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
  /** Charge storage (SPICE Gummel-Poon, ngspice bjtload.c semantics). */
  CJE: number;
  VJE: number;
  MJE: number;
  TF: number;
  XTF: number;
  VTF: number;
  ITF: number;
  CJC: number;
  VJC: number;
  MJC: number;
  XCJC: number;
  TR: number;
  CJS: number;
  VJS: number;
  MJS: number;
  FC: number;
  /** Substrate connection: 1 vertical (collector), -1 lateral (base). */
  SUBS: number;
  polarity: number; // 1 for NPN, -1 for PNP
}

/** ngspice model-card aliases resolved to their canonical parameter. */
const MODEL_PARAMETER_ALIASES: Readonly<Record<string, string>> = {
  VA: 'VAF',
  PE: 'VJE',
  ME: 'MJE',
  PC: 'VJC',
  MC: 'MJC',
  CSUB: 'CJS',
  CCS: 'CJS',
  PS: 'VJS',
  MS: 'MJS',
};

const CHARGE_STORAGE_PARAMETERS = [
  'CJE', 'VJE', 'MJE', 'TF', 'XTF', 'VTF', 'ITF', 'PTF', 'CJC', 'VJC', 'MJC', 'XCJC',
  'TR', 'CJS', 'VJS', 'MJS', 'FC', 'SUBS',
] as const;

const SUPPORTED_MODEL_PARAMETERS = new Set([
  'LEVEL', 'BF', 'BR', 'IS', 'NF', 'NR', 'VAF', 'IKF', 'ISE', 'NE', 'RB', 'RC', 'RE',
  'KF', 'AF', ...CHARGE_STORAGE_PARAMETERS, ...Object.keys(MODEL_PARAMETER_ALIASES),
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

/**
 * Forward-bias limiting only. The -40*Vt reverse floor above is a Newton aid
 * for the Ebers-Moll path; Early base charge and depletion capacitance need
 * the true reverse bias (ngspice only limits forward junction steps).
 */
function limitForwardJunctionVoltage(vd: number, vt: number, IS: number): number {
  return vd < 0 ? vd : limitJunctionVoltage(vd, vt, IS);
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
  supplied: Partial<BJTParams> & Record<string, number>,
): BJTParams {
  const params: Record<string, number> = {};
  for (const [name, value] of Object.entries(supplied)) {
    params[MODEL_PARAMETER_ALIASES[name] ?? name] = value;
  }
  const boundedForwardActive = params.VAF !== undefined || params.IKF !== undefined
    || params.ISE !== undefined || params.NE !== undefined;
  if (boundedForwardActive) {
    for (const name of Object.keys(supplied)) {
      if (name !== 'polarity' && !SUPPORTED_MODEL_PARAMETERS.has(name)) {
        throw new Error(`Unsupported bounded BJT model parameter: '${name}'`);
      }
    }
  }

  const polarity = params.polarity ?? 1;
  const resolved: BJTParams = {
    LEVEL: params.LEVEL ?? 1,
    BF: params.BF ?? 100,
    BR: params.BR ?? 1,
    // ngspice-47 bjtsetup.c default (SPICE2/3 used 1e-14).
    IS: params.IS ?? 1e-16,
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
    CJE: params.CJE ?? 0,
    VJE: params.VJE ?? 0.75,
    MJE: params.MJE ?? 0.33,
    TF: params.TF ?? 0,
    XTF: params.XTF ?? 0,
    VTF: params.VTF ?? 0,
    ITF: params.ITF ?? 0,
    CJC: params.CJC ?? 0,
    VJC: params.VJC ?? 0.75,
    MJC: params.MJC ?? 0.33,
    XCJC: params.XCJC ?? 1,
    TR: params.TR ?? 0,
    CJS: params.CJS ?? 0,
    VJS: params.VJS ?? 0.75,
    MJS: params.MJS ?? 0,
    // ngspice bjttemp.c limits FC to 0.9999.
    FC: Math.min(params.FC ?? 0.5, 0.9999),
    SUBS: params.SUBS ?? (polarity < 0 ? -1 : 1),
    polarity,
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
  validateChargeStorage(resolved, params.PTF ?? 0);
  return resolved;
}

function validateChargeStorage(params: BJTParams, excessPhase: number): void {
  const nonNegative = ['CJE', 'TF', 'XTF', 'ITF', 'CJC', 'TR', 'CJS', 'MJE', 'MJC', 'MJS', 'FC'] as const;
  for (const name of nonNegative) {
    if (!(params[name] >= 0) || !Number.isFinite(params[name])) {
      throw new Error(`Invalid BJT charge-storage parameter: expected finite BJT ${name} >= 0`);
    }
  }
  for (const name of ['VJE', 'VJC', 'VJS'] as const) {
    if (!(params[name] > 0) || !Number.isFinite(params[name])) {
      throw new Error(`Invalid BJT charge-storage parameter: expected finite BJT ${name} > 0`);
    }
  }
  if (!Number.isFinite(params.VTF)) {
    throw new Error('Invalid BJT charge-storage parameter: expected finite BJT VTF');
  }
  if (!(params.XCJC >= 0 && params.XCJC <= 1)) {
    throw new Error('Invalid BJT charge-storage parameter: expected BJT XCJC in [0, 1]');
  }
  if (params.SUBS !== 1 && params.SUBS !== -1) {
    throw new Error('Invalid BJT charge-storage parameter: expected BJT SUBS of 1 or -1');
  }
  if (excessPhase !== 0) {
    throw new Error("Unsupported BJT model parameter: 'PTF' (excess phase is not implemented)");
  }
  // The base-collector fraction outside RB connects to the external base,
  // which the device does not see once RB is expanded into a resistor.
  if (params.XCJC < 1 && params.CJC > 0 && params.RB > 0) {
    throw new Error("Unsupported BJT model parameter: 'XCJC' < 1 together with RB > 0");
  }
}

export class BJT implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = true;
  readonly params: BJTParams;
  readonly suppliedParams: Readonly<Record<string, number>>;
  /**
   * Present only when the model stores charge, so charge-free BJTs keep the
   * transient driver's static-current history path unchanged.
   */
  readonly stampDynamic?: (ctx: StampContext) => void;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    params: Partial<BJTParams> & Record<string, number>,
  ) {
    this.suppliedParams = { ...params };
    this.params = resolveBJTParams(params);
    const { CJE, CJC, CJS, TF, TR } = this.params;
    if (CJE > 0 || CJC > 0 || CJS > 0 || TF > 0 || TR > 0) {
      this.stampDynamic = ctx => this.stampChargeStorage(ctx);
    }
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

  /** Whether the bounded Gummel-Poon base charge (VAF/IKF/ISE) is active. */
  private usesBaseCharge(): boolean {
    const { VAF, IKF, ISE } = this.params;
    return Number.isFinite(VAF) || Number.isFinite(IKF) || ISE !== 0;
  }

  /**
   * The Ebers-Moll path keeps its historical reverse floor; the base-charge
   * path needs the true reverse bias for the Early factor and its gm.
   */
  private limitBaseCollectorVoltage(vBC: number): number {
    const { NR, IS } = this.params;
    return this.usesBaseCharge()
      ? limitForwardJunctionVoltage(vBC, NR * VT, IS)
      : limitJunctionVoltage(vBC, NR * VT, IS);
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
    const vBC = this.limitBaseCollectorVoltage(
      polarity * (voltage(baseNode) - voltage(collectorNode)),
    );
    const forwardCurrent = IS * (Math.exp(vBE / (NF * VT)) - 1);
    const reverseCurrent = IS * (Math.exp(vBC / (NR * VT)) - 1);

    let collectorCurrent: number;
    let baseCurrent: number;
    if (!this.usesBaseCharge()) {
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
    const vBC = this.limitBaseCollectorVoltage(vBC_raw);

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
    if (!this.usesBaseCharge()) {
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

  /**
   * Stamp the linearised charge storage of ngspice's BJT (bjtload.c /
   * bjtacld.c): B-E depletion plus TF diffusion (with XTF/VTF/ITF and base
   * charge), B-C depletion plus TR diffusion, the dQbe/dVbc cross term and the
   * substrate junction to ground. Polarity cancels in every capacitance.
   */
  private stampChargeStorage(ctx: StampContext): void {
    const {
      IS, NF, NR, VAF, IKF, polarity,
      CJE, VJE, MJE, TF, XTF, VTF, ITF, CJC, VJC, MJC, TR, CJS, VJS, MJS, FC, SUBS,
    } = this.params;
    const [nC, nB, nE] = this.nodes;
    const voltage = (node: number): number => node >= 0 ? ctx.getVoltage(node) : 0;
    const vtF = NF * VT;
    const vtR = NR * VT;
    // Depletion charge needs the true reverse bias.
    const junction = (positive: number, negative: number, vt: number): number =>
      limitForwardJunctionVoltage(polarity * (voltage(positive) - voltage(negative)), vt, IS);
    const vBE = junction(nB, nE, vtF);
    const vBC = junction(nB, nC, vtR);

    const expBE = Math.exp(vBE / vtF);
    const expBC = Math.exp(vBC / vtR);
    const forwardCurrent = IS * (expBE - 1);
    const forwardConductance = IS * expBE / vtF;
    const reverseConductance = IS * expBC / vtR;

    let capBE = depletionCapacitance(vBE, CJE, VJE, MJE, FC);
    let crossCapacitance = 0;
    if (TF > 0) {
      let diffusionConductance = forwardConductance;
      if (vBE > 0) {
        const qEarly = Number.isFinite(VAF) ? 1 / (1 - vBC / VAF) : 1;
        const sqarg = Number.isFinite(IKF)
          ? Math.sqrt(Math.max(0, 1 + 4 * forwardCurrent / IKF))
          : 1;
        const qB = qEarly * (1 + sqarg) / 2;
        const dqBdVBE = Number.isFinite(IKF) ? qEarly * forwardConductance / (IKF * sqarg) : 0;
        const dqBdVBC = Number.isFinite(VAF) ? qEarly * qB / VAF : 0;
        const inverseVtf = VTF !== 0 ? 1 / (1.44 * VTF) : 0;
        let argtf = 0;
        let arg2 = 0;
        let arg3 = 0;
        if (XTF !== 0) {
          argtf = XTF * (inverseVtf !== 0 ? Math.exp(vBC * inverseVtf) : 1);
          arg2 = argtf;
          if (ITF !== 0) {
            const share = forwardCurrent / (forwardCurrent + ITF);
            argtf *= share * share;
            arg2 = argtf * (3 - share - share);
          }
          arg3 = forwardCurrent * argtf * inverseVtf;
        }
        const transportCurrent = forwardCurrent * (1 + argtf) / qB;
        diffusionConductance = (forwardConductance * (1 + arg2) - transportCurrent * dqBdVBE) / qB;
        crossCapacitance = TF * (arg3 - transportCurrent * dqBdVBC) / qB;
      }
      capBE += TF * diffusionConductance;
    }
    const capBC = TR * reverseConductance + depletionCapacitance(vBC, CJC, VJC, MJC, FC);

    const substrateNode = SUBS === 1 ? nC : nB;
    const vSub = -polarity * SUBS * voltage(substrateNode);
    const capSub = CJS === 0 ? 0 : vSub < 0
      ? CJS * Math.pow(1 - vSub / VJS, -MJS)
      : CJS * (1 + MJS * vSub / VJS);

    stampCapacitance(ctx, nB, nE, capBE);
    stampCapacitance(ctx, nB, nC, capBC);
    stampCapacitance(ctx, substrateNode, -1, capSub);
    if (crossCapacitance !== 0) {
      // dQbe/dVbc: charge between B and E controlled by the B-C voltage.
      if (nB >= 0) {
        ctx.stampC(nB, nB, crossCapacitance);
        if (nC >= 0) ctx.stampC(nB, nC, -crossCapacitance);
      }
      if (nE >= 0) {
        if (nB >= 0) ctx.stampC(nE, nB, -crossCapacitance);
        if (nC >= 0) ctx.stampC(nE, nC, crossCapacitance);
      }
    }
  }
}

/** ngspice junction depletion capacitance with the FC linear extension. */
function depletionCapacitance(
  junctionVoltage: number,
  zeroBiasCapacitance: number,
  potential: number,
  grading: number,
  forwardCoefficient: number,
): number {
  if (zeroBiasCapacitance === 0) return 0;
  if (junctionVoltage < forwardCoefficient * potential) {
    return zeroBiasCapacitance * Math.pow(1 - junctionVoltage / potential, -grading);
  }
  const f2 = Math.pow(1 - forwardCoefficient, 1 + grading);
  const f3 = 1 - forwardCoefficient * (1 + grading);
  return zeroBiasCapacitance / f2 * (f3 + grading * junctionVoltage / potential);
}

function stampCapacitance(ctx: StampContext, a: number, b: number, capacitance: number): void {
  if (capacitance === 0) return;
  if (a >= 0) ctx.stampC(a, a, capacitance);
  if (b >= 0) ctx.stampC(b, b, capacitance);
  if (a >= 0 && b >= 0) {
    ctx.stampC(a, b, -capacitance);
    ctx.stampC(b, a, -capacitance);
  }
}
