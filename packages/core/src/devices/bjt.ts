import type {
  ChargeIntegration, ChargeTruncation, DeviceModel, StampContext,
} from './device.js';
import {
  depletionCharge, stampChargeBranch, stampChargeCurrent, TransientChargeState,
} from './charge-state.js';
import {
  assertNoUnsupportedTemperatureParameters, CONSTCTOK, CONSTKOVERQ, NOMINAL_TEMPERATURE_C,
  temperatureJunction,
} from './junction-temperature.js';

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
  /** Substrate junction saturation current and emission coefficient. */
  ISS: number;
  NS: number;
  /** bjttemp.c temperature inputs: TNOM (C), EG (eV), XTI and the beta exponent XTB. */
  TNOM: number;
  EG: number;
  XTI: number;
  XTB: number;
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
  'KF', 'AF', 'ISS', 'NS', 'TNOM', 'EG', 'XTI', 'XTB',
  ...CHARGE_STORAGE_PARAMETERS, ...Object.keys(MODEL_PARAMETER_ALIASES),
]);

/**
 * bjttemp.c fields whose temperature laws are not implemented (TLEV/TLEVC != 0
 * and the per-parameter coefficients). They only act away from TNOM, where
 * they are rejected rather than ignored (#374).
 */
const UNSUPPORTED_TEMPERATURE_PARAMETERS = [
  'TLEV', 'TLEVC', 'TRE1', 'TRE2', 'TRC1', 'TRC2', 'TRB1', 'TRB2', 'TRM1', 'TRM2',
  'TBF1', 'TBF2', 'TBR1', 'TBR2', 'TIKF1', 'TIKF2', 'TIKR1', 'TIKR2', 'TIRB1', 'TIRB2',
  'TNC1', 'TNC2', 'TNE1', 'TNE2', 'TNF1', 'TNF2', 'TNR1', 'TNR2', 'TNS1', 'TNS2',
  'TVAF1', 'TVAF2', 'TVAR1', 'TVAR2', 'TITF1', 'TITF2', 'TTF1', 'TTF2', 'TTR1', 'TTR2',
  'TMJE1', 'TMJE2', 'TMJC1', 'TMJC2', 'TMJS1', 'TMJS2', 'TIS1', 'TIS2', 'TISE1', 'TISE2',
  'TISC1', 'TISC2', 'TISS1', 'TISS2', 'CTE', 'CTC', 'CTS', 'TVJE', 'TVJC', 'TVJS',
] as const;

// ngspice-47 bjttemp.c: vt = BJTtemp * CONSTKoverQ, with const.h CONSTboltz and
// CHARGE (#525; the old 0.02585 V offset Vbe by ~3e-4 V). The device keeps it
// per instance, at its temperature (#374).
const GMIN = 1e-12;
/** ngspice-47 MAX_EXP_ARG: bjtload.c caps the substrate exponent with it. */
const MAX_EXP_ARG = 709;

/**
 * ngspice-47 bjtload.c junction law (polarity domain) for cbe, cbc and cben:
 * csat*(exp(v/vtn) - 1) at and above -3*vtn, and the reverse law
 * -csat*(1 + (3*vtn/(e*v))^3) below it (#551). Forward bias is never clamped:
 * ngspice limits a junction only relative to the previous Newton iterate
 * (DEVpnjlim), which {@link BJT.limitNewtonStep} does (#538). Writes into
 * `out` so the stamp hot path does not allocate.
 */
function junctionLaw(
  out: JunctionPoint, voltage: number, saturationCurrent: number, thermalVoltage: number,
): JunctionPoint {
  if (voltage >= -3 * thermalVoltage) {
    const exponential = Math.exp(voltage / thermalVoltage);
    out.current = saturationCurrent * (exponential - 1);
    out.conductance = saturationCurrent * exponential / thermalVoltage;
  } else {
    const ratio = 3 * thermalVoltage / (voltage * Math.E);
    const cube = ratio * ratio * ratio;
    out.current = -saturationCurrent * (1 + cube);
    out.conductance = saturationCurrent * 3 * cube / voltage;
  }
  return out;
}

interface JunctionPoint {
  current: number;
  conductance: number;
}

/**
 * ngspice-47 bjtload.c DC currents and their linearisation (polarity domain):
 * collector current cc and base current cb as functions of (vbe, vbc), with
 * dcc/dvbe = gmForward, dcc/dvbc = -gmReverse, dcb/dvbe = gpi, dcb/dvbc = gmu.
 */
interface BJTDCPoint {
  collectorCurrent: number;
  baseCurrent: number;
  gmForward: number;
  gmReverse: number;
  gpi: number;
  gmu: number;
}

/**
 * ngspice-47 bjtload.c substrate junction (polarity domain): the ISS diode,
 * with the reverse law below -3*NS*Vt, plus CKTgmin. A gmin current therefore
 * flows through the substrate terminal even when ISS = 0 (#539).
 */
function substrateJunction(vsub: number, saturationCurrent: number, thermalVoltage: number): {
  current: number;
  conductance: number;
} {
  if (vsub <= -3 * thermalVoltage) {
    const ratio = 3 * thermalVoltage / (vsub * Math.E);
    const cube = ratio * ratio * ratio;
    return {
      current: -saturationCurrent * (1 + cube) + GMIN * vsub,
      conductance: saturationCurrent * 3 * cube / vsub + GMIN,
    };
  }
  const exponential = Math.exp(Math.min(MAX_EXP_ARG, vsub / thermalVoltage));
  return {
    current: saturationCurrent * (exponential - 1) + GMIN * vsub,
    conductance: saturationCurrent * exponential / thermalVoltage + GMIN,
  };
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
    // ngspice-47 bjtsetup.c: BJTsatCur defaults to 1e-16 A (not the 1e-14 of the diode).
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
    ISS: params.ISS ?? 0,
    NS: params.NS ?? 1,
    TNOM: params.TNOM ?? NOMINAL_TEMPERATURE_C,
    EG: params.EG ?? 1.11,
    XTI: params.XTI ?? 3,
    XTB: params.XTB ?? 0,
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
  if (!(resolved.ISS >= 0) || !Number.isFinite(resolved.ISS)
    || !(resolved.NS > 0) || !Number.isFinite(resolved.NS)) {
    throw new Error('Invalid bounded BJT substrate parameter: expected finite ISS >= 0 and NS > 0');
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

/**
 * Apply ngspice-47 instance scaling to resolved Gummel-Poon parameters.
 *
 * bjttemp.c multiplies IS, ISE, ISS, IKF, ITF, CJE, CJC and CJS (and the RC/RE
 * conductances) by AREA and divides RB by it; bjtload.c then multiplies every
 * stamp by M. For the bounded parameter set both are the same as a device
 * with these parameters scaled by AREA*M. Flicker noise is the exception:
 * bjtnoise.c uses M*KF*|Ib/M|^AF, so KF absorbs M^(1-AF). (ngspice also scales
 * its gmin by M; spice-ts keeps its fixed 1e-12 S gmin.)
 */
export function scaleBJTInstance(
  params: BJTParams,
  instance: { AREA?: number; M?: number } | undefined,
): BJTParams {
  const area = instance?.AREA ?? 1;
  const multiplier = instance?.M ?? 1;
  const scale = area * multiplier;
  if (scale === 1) return params;
  return {
    ...params,
    IS: params.IS * scale,
    ISE: params.ISE * scale,
    ISS: params.ISS * scale,
    IKF: params.IKF * scale,
    ITF: params.ITF * scale,
    CJE: params.CJE * scale,
    CJC: params.CJC * scale,
    CJS: params.CJS * scale,
    RB: params.RB / scale,
    RC: params.RC / scale,
    RE: params.RE / scale,
    KF: params.KF * Math.pow(multiplier, 1 - params.AF),
  };
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
  /** Instance-scaled parameters at TNOM; {@link params} holds them at the device temperature. */
  private readonly nominal: BJTParams;
  private temperature = NOMINAL_TEMPERATURE_C;
  /** Thermal voltage kT/q at the device temperature (bjttemp.c vt). */
  private vt = CONSTKOVERQ * (NOMINAL_TEMPERATURE_C + CONSTCTOK);
  /**
   * Present only when the model stores charge, so charge-free BJTs keep the
   * transient driver's static-current history path unchanged.
   */
  readonly stampDynamic?: (ctx: StampContext) => void;
  /**
   * Charge-storing BJTs integrate qbe (with its dQbe/dVbc cross term), qbc and
   * qsub themselves in transient analysis, as ngspice bjtload.c NIintegrates them.
   */
  readonly integratesTransientCharge: boolean;
  private readonly charges = new TransientChargeState(3);
  private readonly chargePoint: BJTChargePoint = {
    nodeVBE: 0, nodeVBC: 0, vSub: 0, substrateNode: -1,
    qBE: 0, capBE: 0, crossCapacitance: 0, qBC: 0, capBC: 0, qSub: 0, capSub: 0,
  };
  private readonly junction: JunctionPoint = { current: 0, conductance: 0 };
  private readonly dcPoint: BJTDCPoint = {
    collectorCurrent: 0, baseCurrent: 0, gmForward: 0, gmReverse: 0, gpi: 0, gmu: 0,
  };

  constructor(
    readonly name: string,
    readonly nodes: number[],
    params: Partial<BJTParams> & Record<string, number>,
    instance?: { AREA?: number; M?: number },
  ) {
    this.suppliedParams = { ...params };
    this.nominal = scaleBJTInstance(resolveBJTParams(params), instance);
    this.params = { ...this.nominal };
    this.applyTemperature();
    const { CJE, CJC, CJS, TF, TR } = this.params;
    this.integratesTransientCharge = CJE > 0 || CJC > 0 || CJS > 0 || TF > 0 || TR > 0;
    if (this.integratesTransientCharge) {
      this.stampDynamic = ctx => this.stampChargeStorage(ctx);
    }
  }

  setTemperature(value: number): void {
    this.temperature = value;
    this.applyTemperature();
  }

  getTemperature(): number {
    return this.temperature;
  }

  /**
   * ngspice-47 bjttemp.c (TLEV = TLEVC = 0) at the device temperature:
   * IS and ISS scale by exp(factlog), factlog = (T/TNOM - 1)*EG/vt +
   * XTI*ln(T/TNOM); BF and BR by bfactor = (T/TNOM)^XTB; ISE by
   * exp(factlog/NE)/bfactor; the B-E, B-C and substrate junction potentials
   * and capacitances by the REFTEMP-mapped band-gap law. VAF, IKF, the
   * transit times and the resistances have no law without their T*
   * coefficients. At T = TNOM every factor is exactly 1.
   */
  private applyTemperature(): void {
    assertNoUnsupportedTemperatureParameters(
      this.name, this.suppliedParams, UNSUPPORTED_TEMPERATURE_PARAMETERS,
      this.temperature, this.nominal.TNOM,
    );
    const nominal = this.nominal;
    const params = this.params;
    const kelvin = this.temperature + CONSTCTOK;
    const nominalKelvin = nominal.TNOM + CONSTCTOK;
    this.vt = CONSTKOVERQ * kelvin;
    if (kelvin === nominalKelvin) {
      Object.assign(params, nominal);
      return;
    }
    const ratlog = Math.log(kelvin / nominalKelvin);
    const factlog = (kelvin / nominalKelvin - 1) * nominal.EG / this.vt + nominal.XTI * ratlog;
    const bfactor = Math.exp(ratlog * nominal.XTB);
    params.IS = nominal.IS * Math.exp(factlog);
    params.ISS = nominal.ISS * Math.exp(factlog);
    params.ISE = nominal.ISE * Math.exp(factlog / nominal.NE) / bfactor;
    params.BF = nominal.BF * bfactor;
    params.BR = nominal.BR * bfactor;
    const junction = (potential: number, capacitance: number, grading: number) =>
      temperatureJunction(potential, capacitance, grading, kelvin, nominalKelvin);
    const emitter = junction(nominal.VJE, nominal.CJE, nominal.MJE);
    const collector = junction(nominal.VJC, nominal.CJC, nominal.MJC);
    const substrate = junction(nominal.VJS, nominal.CJS, nominal.MJS);
    params.VJE = emitter.potential;
    params.CJE = emitter.capacitance;
    params.VJC = collector.potential;
    params.CJC = collector.capacitance;
    params.VJS = substrate.potential;
    params.CJS = substrate.capacitance;
  }

  stampTransientCharge(ctx: StampContext, integration: ChargeIntegration): void {
    const point = this.evaluateCharges(ctx);
    const charges = this.charges;
    charges.begin(integration);
    const { polarity } = this.params;
    const [nC, nB, nE] = this.nodes;
    const factor = charges.factor;
    // Physical branch quantities are the polarity-domain ones times the sign.
    // The charges are functions of the node junction voltages, so a converged
    // point carries exactly the integrated current.
    const crossConductance = factor * point.crossCapacitance;
    stampChargeBranch(
      ctx, nB, nE,
      polarity * charges.current(BASE_EMITTER, point.qBE) - crossConductance * polarity * point.nodeVBC,
      factor * point.capBE, polarity * point.nodeVBE,
    );
    if (crossConductance !== 0) {
      // dQbe/dVbc: the B-E charge current is controlled by the B-C voltage.
      if (nB >= 0) {
        ctx.stampG(nB, nB, crossConductance);
        if (nC >= 0) ctx.stampG(nB, nC, -crossConductance);
      }
      if (nE >= 0) {
        if (nB >= 0) ctx.stampG(nE, nB, -crossConductance);
        if (nC >= 0) ctx.stampG(nE, nC, crossConductance);
      }
    }
    stampChargeBranch(
      ctx, nB, nC, polarity * charges.current(BASE_COLLECTOR, point.qBC),
      factor * point.capBC, polarity * point.nodeVBC,
    );
    // Substrate charge between the substrate-connect node and the substrate
    // terminal: its voltage is -type*subs*vsub.
    const substrateSign = -polarity * this.params.SUBS;
    stampChargeBranch(
      ctx, point.substrateNode, this.substrateNode,
      substrateSign * charges.current(SUBSTRATE, point.qSub),
      factor * point.capSub, substrateSign * point.vSub,
    );
  }

  stampAcceptedChargeCurrent(ctx: StampContext): void {
    const { polarity, SUBS } = this.params;
    const [nC, nB, nE] = this.nodes;
    const charges = this.charges;
    stampChargeCurrent(ctx, nB, nE, polarity * charges.acceptedChargeCurrent(BASE_EMITTER));
    stampChargeCurrent(ctx, nB, nC, polarity * charges.acceptedChargeCurrent(BASE_COLLECTOR));
    stampChargeCurrent(
      ctx, SUBS === 1 ? nC : nB, this.substrateNode,
      -polarity * SUBS * charges.acceptedChargeCurrent(SUBSTRATE),
    );
  }

  acceptTransientStep(ctx: StampContext): void {
    if (!this.integratesTransientCharge) return;
    const point = this.evaluateCharges(ctx);
    const charges = this.charges;
    charges.accept(BASE_EMITTER, point.qBE);
    charges.accept(BASE_COLLECTOR, point.qBC);
    charges.accept(SUBSTRATE, point.qSub);
    charges.commit();
  }

  resetTransient(): void {
    this.charges.reset();
  }

  /** ngspice BJTtrunc: qbe, qbc and qsub. */
  truncateTransientStep(ctx: StampContext, truncation: ChargeTruncation): number {
    return this.charges.truncationTimestep(truncation, () => this.acceptTransientStep(ctx));
  }

  limitNewtonStep(previous: Float64Array, candidate: Float64Array): number {
    const { NF, NR, IS, ISS, NS, SUBS, polarity } = this.params;
    const [nC, nB, nE] = this.nodes;
    const voltage = (solution: Float64Array, node: number): number =>
      node >= 0 ? solution[node] : 0;
    const junction = (solution: Float64Array, positive: number, negative: number): number =>
      polarity * (voltage(solution, positive) - voltage(solution, negative));

    const scale = Math.min(
      junctionStepScale(
        junction(candidate, nB, nE), junction(previous, nB, nE), NF * this.vt, IS,
      ),
      junctionStepScale(
        junction(candidate, nB, nC), junction(previous, nB, nC), NR * this.vt, IS,
      ),
    );
    if (ISS === 0) return scale;
    // ngspice bjtload.c DEVpnjlim on vsub with tSubVcrit (from ISS and NS).
    const substrate = this.substrateNode;
    const substrateConnect = SUBS === 1 ? nC : nB;
    return Math.min(scale, junctionStepScale(
      SUBS * junction(candidate, substrate, substrateConnect),
      SUBS * junction(previous, substrate, substrateConnect),
      NS * this.vt, ISS,
    ));
  }

  /** Substrate terminal (the optional 4th node); omitted, it is ground as in ngspice. */
  private get substrateNode(): number {
    return this.nodes[3] ?? -1;
  }

  /**
   * ngspice-47 bjtload.c DC evaluation at the polarity-domain junction
   * voltages: cbe/cbc from the IS law, the B-E leakage cben from ISE/NE, and
   * CKTgmin*vbe in cben and CKTgmin*vbc in cbcn, so the gmin current flows at
   * convergence as in ngspice, not only in the Jacobian (#551). With VAF and
   * IKF omitted qb = 1, which is the Ebers-Moll transport model. Writes into a
   * reused object.
   */
  private evaluateDC(vBE: number, vBC: number): BJTDCPoint {
    const { BF, BR, IS, NF, NR, VAF, IKF, ISE, NE } = this.params;
    const { current: cbe, conductance: gbe } = junctionLaw(this.junction, vBE, IS, NF * this.vt);
    const { current: cbc, conductance: gbc } = junctionLaw(this.junction, vBC, IS, NR * this.vt);
    let cben = GMIN * vBE;
    let gben = GMIN;
    if (ISE !== 0) {
      const leakage = junctionLaw(this.junction, vBE, ISE, NE * this.vt);
      cben += leakage.current;
      gben += leakage.conductance;
    }
    // ISC/NC are not supported, so cbcn is the gmin term alone.
    const cbcn = GMIN * vBC;
    const gbcn = GMIN;

    const inverseEarly = Number.isFinite(VAF) ? 1 / VAF : 0;
    const q1 = 1 / (1 - inverseEarly * vBC);
    let qb: number;
    let dqbdve: number;
    if (!Number.isFinite(IKF)) {
      qb = q1;
      dqbdve = 0;
    } else {
      const arg = Math.max(0, 1 + 4 * cbe / IKF);
      const sqarg = arg !== 0 ? Math.sqrt(arg) : 1;
      qb = q1 * (1 + sqarg) / 2;
      dqbdve = q1 * gbe / (IKF * sqarg);
    }
    const dqbdvc = q1 * qb * inverseEarly;

    const transport = cbe - cbc;
    const go = (gbc + transport * dqbdvc / qb) / qb;
    const gm = (gbe - transport * dqbdve / qb) / qb - go;
    const point = this.dcPoint;
    point.collectorCurrent = transport / qb - cbc / BR - cbcn;
    point.baseCurrent = cbe / BF + cben + cbc / BR + cbcn;
    point.gpi = gbe / BF + gben;
    point.gmu = gbc / BR + gbcn;
    point.gmForward = gm + go;
    point.gmReverse = point.gmu + go;
    return point;
  }

  noiseOperatingPoint(solution: Float64Array): {
    collectorNode: number;
    baseNode: number;
    emitterNode: number;
    collectorCurrent: number;
    baseCurrent: number;
  } {
    const { polarity } = this.params;
    const [collectorNode, baseNode, emitterNode] = this.nodes;
    const voltage = (node: number): number => node >= 0 ? solution[node] : 0;
    const { collectorCurrent, baseCurrent } = this.evaluateDC(
      polarity * (voltage(baseNode) - voltage(emitterNode)),
      polarity * (voltage(baseNode) - voltage(collectorNode)),
    );
    return {
      collectorNode,
      baseNode,
      emitterNode,
      collectorCurrent: Math.abs(collectorCurrent),
      baseCurrent: Math.abs(baseCurrent),
    };
  }

  stamp(ctx: StampContext): void {
    const { polarity } = this.params;
    const [nC, nB, nE] = this.nodes;

    // Get node voltages
    const vC = nC >= 0 ? ctx.getVoltage(nC) : 0;
    const vB = nB >= 0 ? ctx.getVoltage(nB) : 0;
    const vE = nE >= 0 ? ctx.getVoltage(nE) : 0;

    // Junction voltages (polarity flips for PNP). No clamp: Newton steps are
    // limited relative to the previous iterate in limitNewtonStep (#538).
    const vBE = polarity * (vB - vE);
    const vBC = polarity * (vB - vC);

    const dc = this.evaluateDC(vBE, vBC);
    const IC = dc.collectorCurrent;
    const IB = dc.baseCurrent;
    const gm_f = dc.gmForward;
    const gm_r = dc.gmReverse;
    const go_be = dc.gpi;
    const go_bc = dc.gmu;

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

    this.stampSubstrateJunction(ctx);
  }

  /**
   * ngspice-47 bjtload.c substrate junction between the substrate terminal and
   * the substrate-connect node (collector for vertical, base for lateral):
   * vsub = type*subs*(V(s) - V(sc)), cdsub/gdsub from {@link substrateJunction}.
   */
  private stampSubstrateJunction(ctx: StampContext): void {
    const { ISS, NS, SUBS, polarity } = this.params;
    const substrate = this.substrateNode;
    const substrateConnect = SUBS === 1 ? this.nodes[0] : this.nodes[1];
    const voltage = (node: number): number => node >= 0 ? ctx.getVoltage(node) : 0;
    const sign = polarity * SUBS;
    const terminalVoltage = voltage(substrate) - voltage(substrateConnect);
    const { current, conductance } = substrateJunction(sign * terminalVoltage, ISS, NS * this.vt);
    // Physical current from the substrate into the substrate-connect node.
    stampChargeBranch(ctx, substrate, substrateConnect, sign * current, conductance, terminalVoltage);
  }

  /**
   * Stamp the linearised charge storage of ngspice's BJT (bjtload.c /
   * bjtacld.c): B-E depletion plus TF diffusion (with XTF/VTF/ITF and base
   * charge), B-C depletion plus TR diffusion, the dQbe/dVbc cross term and the
   * substrate junction to the substrate terminal. Polarity cancels in every capacitance.
   */
  private stampChargeStorage(ctx: StampContext): void {
    const [nC, nB, nE] = this.nodes;
    const { capBE, capBC, capSub, crossCapacitance, substrateNode } = this.evaluateCharges(ctx);
    stampCapacitance(ctx, nB, nE, capBE);
    stampCapacitance(ctx, nB, nC, capBC);
    stampCapacitance(ctx, substrateNode, this.substrateNode, capSub);
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

  /**
   * ngspice bjtload.c charges qbe, qbc and qsub (polarity domain) with their
   * capacitances dQ/dV and the dQbe/dVbc cross capacitance, at the present
   * terminal voltages. Writes into a reused object.
   */
  private evaluateCharges(ctx: StampContext): BJTChargePoint {
    const {
      IS, NF, NR, VAF, IKF, polarity,
      CJE, VJE, MJE, TF, XTF, VTF, ITF, CJC, VJC, MJC, TR, CJS, VJS, MJS, FC, SUBS,
    } = this.params;
    const [nC, nB, nE] = this.nodes;
    const voltage = (node: number): number => node >= 0 ? ctx.getVoltage(node) : 0;
    const vtF = NF * this.vt;
    const vtR = NR * this.vt;
    // ngspice evaluates the charges at the junction voltages it linearises at;
    // depletion charge needs the true reverse bias.
    const vBE = polarity * (voltage(nB) - voltage(nE));
    const vBC = polarity * (voltage(nB) - voltage(nC));

    // ngspice bjtload.c builds the diffusion charges from cbe/gbe and cbc/gbc
    // (the junction law without gmin, reverse law included).
    const forward = junctionLaw(this.junction, vBE, IS, vtF);
    const forwardCurrent = forward.current;
    const forwardConductance = forward.conductance;
    const reverse = junctionLaw(this.junction, vBC, IS, vtR);
    const reverseCurrent = reverse.current;
    const reverseConductance = reverse.conductance;

    const point = this.chargePoint;
    const depletionBE = depletionCharge(vBE, CJE, VJE, MJE, FC);
    let qBE = depletionBE.charge;
    let capBE = depletionBE.capacitance;
    let crossCapacitance = 0;
    if (TF > 0) {
      let diffusionCurrent = forwardCurrent;
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
        diffusionCurrent = transportCurrent;
        diffusionConductance = (forwardConductance * (1 + arg2) - transportCurrent * dqBdVBE) / qB;
        crossCapacitance = TF * (arg3 - transportCurrent * dqBdVBC) / qB;
      }
      qBE += TF * diffusionCurrent;
      capBE += TF * diffusionConductance;
    }
    const depletionBC = depletionCharge(vBC, CJC, VJC, MJC, FC);

    const substrateNode = SUBS === 1 ? nC : nB;
    // ngspice bjtload.c vsub = type*subs*(V(substrate) - V(substrate-connect)).
    const vSub = polarity * SUBS * (voltage(this.substrateNode) - voltage(substrateNode));
    let qSub = 0;
    let capSub = 0;
    if (CJS !== 0) {
      if (vSub < 0) {
        const depletion = depletionCharge(vSub, CJS, VJS, MJS, 1);
        qSub = depletion.charge;
        capSub = depletion.capacitance;
      } else {
        // ngspice: linear capacitance continuation from zero bias.
        qSub = vSub * CJS * (1 + MJS * vSub / (2 * VJS));
        capSub = CJS * (1 + MJS * vSub / VJS);
      }
    }

    point.nodeVBE = vBE;
    point.nodeVBC = vBC;
    point.vSub = vSub;
    point.substrateNode = substrateNode;
    point.qBE = qBE;
    point.capBE = capBE;
    point.crossCapacitance = crossCapacitance;
    point.qBC = TR * reverseCurrent + depletionBC.charge;
    point.capBC = TR * reverseConductance + depletionBC.capacitance;
    point.qSub = qSub;
    point.capSub = capSub;
    return point;
  }
}

interface BJTChargePoint {
  /** Polarity-domain junction voltages at the nodes. */
  nodeVBE: number;
  nodeVBC: number;
  vSub: number;
  /** Substrate-connect node: collector (vertical) or base (lateral). */
  substrateNode: number;
  qBE: number;
  capBE: number;
  crossCapacitance: number;
  qBC: number;
  capBC: number;
  qSub: number;
  capSub: number;
}

const BASE_EMITTER = 0;
const BASE_COLLECTOR = 1;
const SUBSTRATE = 2;

function stampCapacitance(ctx: StampContext, a: number, b: number, capacitance: number): void {
  if (capacitance === 0) return;
  if (a >= 0) ctx.stampC(a, a, capacitance);
  if (b >= 0) ctx.stampC(b, b, capacitance);
  if (a >= 0 && b >= 0) {
    ctx.stampC(a, b, -capacitance);
    ctx.stampC(b, a, -capacitance);
  }
}
