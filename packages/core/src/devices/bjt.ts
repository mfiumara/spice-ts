import type { DeviceModel, StampContext } from './device.js';

export interface BJTParams {
  BF: number;
  BR: number;
  IS: number;
  NF: number;
  NR: number;
  VAF: number;
  polarity: number; // 1 for NPN, -1 for PNP
}

const VT = 0.02585; // Thermal voltage at 300K
const GMIN = 1e-12;

function limitJunctionVoltage(vd: number, vt: number, IS: number): number {
  const vcrit = vt * Math.log(vt / (Math.sqrt(2) * IS));
  if (vd > vcrit) {
    return vcrit + vt * Math.log(1 + (vd - vcrit) / vt);
  }
  return Math.max(vd, -40 * vt);
}

export class BJT implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = true;
  readonly params: BJTParams;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    params: Partial<BJTParams> & Record<string, number>,
  ) {
    this.params = {
      BF: params.BF ?? 100,
      BR: params.BR ?? 1,
      IS: params.IS ?? 1e-14,
      NF: params.NF ?? 1,
      NR: params.NR ?? 1,
      VAF: params.VAF ?? Infinity,
      polarity: params.polarity ?? 1,
    };
  }

  stamp(ctx: StampContext): void {
    const { BF, BR, IS, NF, NR, polarity } = this.params;
    const [nC, nB, nE] = this.nodes;

    // Get node voltages
    const vC = nC >= 0 ? ctx.getVoltage(nC) : 0;
    const vB = nB >= 0 ? ctx.getVoltage(nB) : 0;
    const vE = nE >= 0 ? ctx.getVoltage(nE) : 0;

    // Junction voltages (polarity flips for PNP)
    const vBE_raw = polarity * (vB - vE);
    const vBC_raw = polarity * (vB - vC);

    const vtF = NF * VT;
    const vtR = NR * VT;

    // Voltage limiting
    const vBE = limitJunctionVoltage(vBE_raw, vtF, IS);
    const vBC = limitJunctionVoltage(vBC_raw, vtR, IS);

    // Forward and reverse currents
    const expBE = Math.exp(vBE / vtF);
    const expBC = Math.exp(vBC / vtR);
    const IF = IS * (expBE - 1);
    const IR = IS * (expBC - 1);

    // Terminal currents (in terms of internal/polarity-adjusted voltages)
    const IC = IF - IR * (1 + 1 / BR);
    const IB = IF / BF + IR / BR;
    // IE = -(IC + IB) by KCL

    // Conductances (derivatives)
    const gF = (IS / vtF) * expBE + GMIN; // dIF/dVBE
    const gR = (IS / vtR) * expBC + GMIN; // dIR/dVBC

    // IC depends on VBE (gm_f = gF) and VBC (gm_r = gR*(1+1/BR))
    const gm_f = gF;               // dIC/dVBE
    const gm_r = gR * (1 + 1 / BR); // -dIC/dVBC (IC decreases with VBC)

    // IB depends on VBE (go_be = gF/BF) and VBC (go_bc = gR/BR)
    const go_be = gF / BF;  // dIB/dVBE
    const go_bc = gR / BR;  // dIB/dVBC

    // Equivalent currents for Newton-Raphson companion model
    // For IC: IC_eq = IC - gm_f * vBE + gm_r * vBC
    const IC_eq = IC - gm_f * vBE + gm_r * vBC;
    // For IB: IB_eq = IB - go_be * vBE - go_bc * vBC
    const IB_eq = IB - go_be * vBE - go_bc * vBC;

    // Now stamp. The actual node currents include polarity:
    // Physical IC_node = polarity * IC(vBE, vBC) flowing into collector
    // Physical IB_node = polarity * IB(vBE, vBC) flowing into base
    //
    // Since vBE = polarity*(vB - vE) and vBC = polarity*(vB - vC):
    // dvBE/dvB = polarity, dvBE/dvE = -polarity
    // dvBC/dvB = polarity, dvBC/dvC = -polarity
    //
    // For collector current (convention: current INTO node is positive in KCL → stamp negative):
    // IC_node = polarity * (gm_f * vBE - gm_r * vBC + IC_eq)
    //
    // dIC_node/dvB = polarity * (gm_f * polarity - gm_r * polarity) = (gm_f - gm_r)
    // dIC_node/dvE = polarity * (gm_f * (-polarity)) = -gm_f
    // dIC_node/dvC = polarity * (-gm_r * (-polarity)) = gm_r
    //
    // Similarly for IB_node = polarity * (go_be * vBE + go_bc * vBC + IB_eq)
    // dIB_node/dvB = polarity * (go_be * polarity + go_bc * polarity) = (go_be + go_bc)
    // dIB_node/dvE = polarity * (go_be * (-polarity)) = -go_be
    // dIB_node/dvC = polarity * (go_bc * (-polarity)) = -go_bc

    // IE_node = -(IC_node + IB_node) by KCL
    // dIE_node/dvB = -(gm_f - gm_r + go_be + go_bc)
    // dIE_node/dvE = -(-gm_f - go_be) = gm_f + go_be
    // dIE_node/dvC = -(gm_r - go_bc) = -gm_r + go_bc

    const IE_eq_internal = -(IC_eq + IB_eq);

    // Stamp conductance matrix G: G[row][col] += conductance
    // Convention: KCL at node i: sum of currents leaving = 0
    // G*V + B = 0, so we stamp positive conductance for current leaving
    // Current into collector = polarity * IC, so current leaving = -polarity * IC
    // We stamp: G[nC][...] -= dIC_node/dV..., B[nC] -= polarity*IC_eq (equiv current)

    // Collector row
    if (nC >= 0) {
      if (nC >= 0) ctx.stampG(nC, nC, gm_r);
      if (nB >= 0) ctx.stampG(nC, nB, gm_f - gm_r);
      if (nE >= 0) ctx.stampG(nC, nE, -gm_f);
      ctx.stampB(nC, -polarity * IC_eq);
    }

    // Base row
    if (nB >= 0) {
      if (nC >= 0) ctx.stampG(nB, nC, -go_bc);
      if (nB >= 0) ctx.stampG(nB, nB, go_be + go_bc);
      if (nE >= 0) ctx.stampG(nB, nE, -go_be);
      ctx.stampB(nB, -polarity * IB_eq);
    }

    // Emitter row
    if (nE >= 0) {
      if (nC >= 0) ctx.stampG(nE, nC, -gm_r + go_bc);
      if (nB >= 0) ctx.stampG(nE, nB, -(gm_f - gm_r + go_be + go_bc));
      if (nE >= 0) ctx.stampG(nE, nE, gm_f + go_be);
      ctx.stampB(nE, -polarity * IE_eq_internal);
    }
  }
}
