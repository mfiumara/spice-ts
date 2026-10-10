import type { DeviceModel, StampContext } from './device.js';

export interface BJTParams {
  LEVEL: number;
  BF: number;
  BR: number;
  IS: number;
  NF: number;
  NR: number;
  VAF: number;
  IKF: number;
  ISE: number;
  NE: number;
  RB: number;
  RC: number;
  RE: number;
  KF: number;
  AF: number;
  polarity: number; // 1 for NPN, -1 for PNP
}

const SUPPORTED_MODEL_PARAMETERS = new Set([
  'LEVEL', 'BF', 'BR', 'IS', 'NF', 'NR', 'VAF', 'IKF', 'ISE', 'NE', 'RB', 'RC', 'RE',
  'KF', 'AF',
]);

const VT = 0.02585; // Thermal voltage at 300K
const GMIN = 1e-12;

function limitJunctionVoltage(vd: number, vt: number, IS: number): number {
  const vcrit = vt * Math.log(vt / (Math.sqrt(2) * IS));
  if (vd > vcrit) {
    return vcrit + vt * Math.log(1 + (vd - vcrit) / vt);
  }
  return Math.max(vd, -40 * vt);
}

function limitJunctionStep(
  proposedVoltage: number,
  previousVoltage: number,
  thermalVoltage: number,
  saturationCurrent: number,
): number {
  const criticalVoltage = thermalVoltage
    * Math.log(thermalVoltage / (Math.sqrt(2) * saturationCurrent));
  if (proposedVoltage > criticalVoltage
    && Math.abs(proposedVoltage - previousVoltage) > 2 * thermalVoltage) {
    if (previousVoltage > 0) {
      const argument = 1 + (proposedVoltage - previousVoltage) / thermalVoltage;
      return argument > 0
        ? previousVoltage + thermalVoltage * Math.log(argument)
        : criticalVoltage;
    }
    return thermalVoltage * Math.log(proposedVoltage / thermalVoltage);
  }
  if (proposedVoltage < 0) {
    const minimum = previousVoltage > 0
      ? -previousVoltage - 1
      : 2 * previousVoltage - 1;
    return Math.max(proposedVoltage, minimum);
  }
  return proposedVoltage;
}

function junctionStepScale(
  proposedVoltage: number,
  previousVoltage: number,
  thermalVoltage: number,
  saturationCurrent: number,
): number {
  const delta = proposedVoltage - previousVoltage;
  if (delta === 0) return 1;
  const limited = limitJunctionStep(
    proposedVoltage, previousVoltage, thermalVoltage, saturationCurrent,
  );
  return Math.min(1, Math.max(0, (limited - previousVoltage) / delta));
}

export function resolveBJTParams(
  params: Partial<BJTParams> & Record<string, number>,
): BJTParams {
  const boundedForwardActive = params.VAF !== undefined || params.IKF !== undefined
    || params.ISE !== undefined || params.NE !== undefined;
  if (boundedForwardActive) {
    for (const name of Object.keys(params)) {
      if (name !== 'polarity' && !SUPPORTED_MODEL_PARAMETERS.has(name)) {
        throw new Error(`Unsupported bounded BJT model parameter: '${name}'`);
      }
    }
  }

  const resolved: BJTParams = {
    LEVEL: params.LEVEL ?? 1,
    BF: params.BF ?? 100,
    BR: params.BR ?? 1,
    IS: params.IS ?? 1e-14,
    NF: params.NF ?? 1,
    NR: params.NR ?? 1,
    VAF: params.VAF ?? Infinity,
    IKF: params.IKF ?? Infinity,
    ISE: params.ISE ?? 0,
    NE: params.NE ?? 1.5,
    RB: params.RB ?? 0,
    RC: params.RC ?? 0,
    RE: params.RE ?? 0,
    KF: params.KF ?? 0,
    AF: params.AF ?? 1,
    polarity: params.polarity ?? 1,
  };
  if (resolved.LEVEL !== 1) {
    throw new Error(`Unsupported bounded BJT model level: ${resolved.LEVEL}`);
  }
  if (resolved.BF <= 0 || resolved.BR <= 0 || resolved.IS <= 0
    || resolved.NF <= 0 || resolved.NR <= 0 || resolved.VAF <= 0
    || resolved.IKF <= 0 || resolved.ISE < 0 || resolved.NE <= 0
    || resolved.RB < 0 || !Number.isFinite(resolved.RB)
    || resolved.RC < 0 || !Number.isFinite(resolved.RC)
    || resolved.RE < 0 || !Number.isFinite(resolved.RE)) {
    throw new Error('Invalid bounded BJT model parameter value');
  }
  if (resolved.KF < 0 || !Number.isFinite(resolved.KF)) {
    throw new Error('Invalid bounded BJT noise parameter: expected finite BJT KF >= 0');
  }
  if (resolved.AF <= 0 || !Number.isFinite(resolved.AF)) {
    throw new Error('Invalid bounded BJT noise parameter: expected finite BJT AF > 0');
  }
  return resolved;
}

export class BJT implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = true;
  readonly params: BJTParams;
  readonly suppliedParams: Readonly<Record<string, number>>;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    params: Partial<BJTParams> & Record<string, number>,
  ) {
    this.suppliedParams = { ...params };
    this.params = resolveBJTParams(params);
  }

  limitNewtonStep(previous: Float64Array, candidate: Float64Array): number {
    const { NF, NR, IS, polarity } = this.params;
    const [nC, nB, nE] = this.nodes;
    const voltage = (solution: Float64Array, node: number): number =>
      node >= 0 ? solution[node] : 0;
    const junction = (solution: Float64Array, positive: number, negative: number): number =>
      polarity * (voltage(solution, positive) - voltage(solution, negative));

    return Math.min(
      junctionStepScale(
        junction(candidate, nB, nE), junction(previous, nB, nE), NF * VT, IS,
      ),
      junctionStepScale(
        junction(candidate, nB, nC), junction(previous, nB, nC), NR * VT, IS,
      ),
    );
  }

  noiseOperatingPoint(solution: Float64Array): {
    collectorNode: number;
    baseNode: number;
    emitterNode: number;
    collectorCurrent: number;
    baseCurrent: number;
  } {
    const { BF, BR, IS, NF, NR, VAF, IKF, ISE, NE, polarity } = this.params;
    const [collectorNode, baseNode, emitterNode] = this.nodes;
    const voltage = (node: number): number => node >= 0 ? solution[node] : 0;
    const vBE = limitJunctionVoltage(
      polarity * (voltage(baseNode) - voltage(emitterNode)),
      NF * VT,
      IS,
    );
    const vBC = limitJunctionVoltage(
      polarity * (voltage(baseNode) - voltage(collectorNode)),
      NR * VT,
      IS,
    );
    const forwardCurrent = IS * (Math.exp(vBE / (NF * VT)) - 1);
    const reverseCurrent = IS * (Math.exp(vBC / (NR * VT)) - 1);

    let collectorCurrent: number;
    let baseCurrent: number;
    if (!Number.isFinite(VAF) && !Number.isFinite(IKF) && ISE === 0) {
      collectorCurrent = forwardCurrent - reverseCurrent * (1 + 1 / BR);
      baseCurrent = forwardCurrent / BF + reverseCurrent / BR;
    } else {
      const qEarly = Number.isFinite(VAF) ? 1 / (1 - vBC / VAF) : 1;
      const highCurrent = Number.isFinite(IKF) ? forwardCurrent / IKF : 0;
      const qB = 0.5 * qEarly
        * (1 + Math.sqrt(Math.max(1 + 4 * highCurrent, Number.EPSILON)));
      const leakage = ISE * (Math.exp(vBE / (NE * VT)) - 1);
      collectorCurrent = (forwardCurrent - reverseCurrent) / qB - reverseCurrent / BR;
      baseCurrent = forwardCurrent / BF + reverseCurrent / BR + leakage;
    }

    return {
      collectorNode,
      baseNode,
      emitterNode,
      collectorCurrent: Math.abs(collectorCurrent),
      baseCurrent: Math.abs(baseCurrent),
    };
  }

  stamp(ctx: StampContext): void {
    const { BF, BR, IS, NF, NR, VAF, IKF, ISE, NE, polarity } = this.params;
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

    // Forward and reverse junction currents.
    const expBE = Math.exp(vBE / vtF);
    const expBC = Math.exp(vBC / vtR);
    const IF = IS * (expBE - 1);
    const IR = IS * (expBC - 1);
    const gF = (IS / vtF) * expBE + GMIN;
    const gR = (IS / vtR) * expBC + GMIN;

    let IC: number;
    let IB: number;
    let gm_f: number;
    let gm_r: number;
    let go_be: number;
    const go_bc = gR / BR;
    if (!Number.isFinite(VAF) && !Number.isFinite(IKF) && ISE === 0) {
      // Keep the established level-1 arithmetic byte-for-byte equivalent;
      // nonlinear transient acceptance can be sensitive to operation order.
      IC = IF - IR * (1 + 1 / BR);
      IB = IF / BF + IR / BR;
      gm_f = gF;
      gm_r = gR * (1 + 1 / BR);
      go_be = gF / BF;
    } else {
      // Bounded forward-active Gummel-Poon base charge.
      const qEarly = Number.isFinite(VAF) ? 1 / (1 - vBC / VAF) : 1;
      const highCurrent = Number.isFinite(IKF) ? IF / IKF : 0;
      const root = Math.sqrt(Math.max(1 + 4 * highCurrent, Number.EPSILON));
      const qB = 0.5 * qEarly * (1 + root);
      const dqBdVBE = Number.isFinite(IKF) ? qEarly * gF / (IKF * root) : 0;
      const dqBdVBC = Number.isFinite(VAF) ? qB * qEarly / VAF : 0;
      const transport = (IF - IR) / qB;
      const dTransportVBE = (gF * qB - (IF - IR) * dqBdVBE) / (qB * qB);
      const dTransportVBC = (-gR * qB - (IF - IR) * dqBdVBC) / (qB * qB);
      const leakageExp = Math.exp(vBE / (NE * VT));
      const leakage = ISE * (leakageExp - 1);
      const leakageG = ISE * leakageExp / (NE * VT);

      IC = transport - IR / BR;
      IB = IF / BF + IR / BR + leakage;
      gm_f = dTransportVBE;
      gm_r = -(dTransportVBC - gR / BR);
      go_be = gF / BF + leakageG;
    }

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
