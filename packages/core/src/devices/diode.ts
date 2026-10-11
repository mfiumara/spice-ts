import type { DiodeInstanceParams } from '../parser/diode-parser.js';
import { InvalidCircuitError } from '../errors.js';
import type { ChargeIntegration, DeviceModel, StampContext } from './device.js';

export interface DiodeParams {
  IS: number;
  N: number;
  BV: number;
  IBV: number;
  TBV1: number;
  TBV2: number;
  TNOM: number;
  RS: number;
  JSW?: number;
  CJ0?: number;
  CJO?: number;
  CJP?: number;
  CJSW?: number;
  VJ?: number;
  PHP?: number;
  VJSW?: number;
  M?: number;
  MJSW?: number;
  FC?: number;
  FCS?: number;
  TT?: number;
  KF?: number;
  AF?: number;
  /** Forward knee current (high injection); ngspice alias IK. */
  IKF?: number;
}

/**
 * ngspice-47 dio.c model-parameter aliases. Every name in a group sets the same
 * ngspice field; the first name is the spice-ts canonical one.
 */
const DIODE_ALIAS_GROUPS: ReadonlyArray<{
  names: readonly string[];
  description: string;
}> = [
  { names: ['IS', 'JS'], description: 'saturation current' },
  { names: ['JSW', 'ISW'], description: 'sidewall saturation current' },
  { names: ['TNOM', 'TREF'], description: 'parameter measurement temperature' },
  { names: ['TRS1', 'TRS'], description: 'first-order RS temperature coefficient' },
  { names: ['CJO', 'CJ0', 'CJ'], description: 'zero-bias junction capacitance' },
  { names: ['VJ', 'PB'], description: 'junction potential' },
  { names: ['M', 'MJ'], description: 'grading coefficient' },
  { names: ['CJSW', 'CJP'], description: 'sidewall junction capacitance' },
  { names: ['VJSW', 'PHP'], description: 'sidewall junction potential' },
  { names: ['IKF', 'IK'], description: 'forward knee current' },
  { names: ['NBV', 'NZ'], description: 'breakdown emission coefficient' },
  { names: ['BV', 'VB', 'VRB', 'VAR'], description: 'reverse breakdown voltage' },
  { names: ['IBV', 'IB'], description: 'reverse breakdown current' },
];

const DIODE_CANONICAL_NAMES: ReadonlyMap<string, string> = new Map(
  DIODE_ALIAS_GROUPS.flatMap(({ names }) => names.map(field => [field, names[0]] as const)),
);

export type DiodeModelAlias =
  | 'JS' | 'ISW' | 'TREF' | 'TRS' | 'CJ' | 'PB' | 'MJ' | 'IK' | 'NZ'
  | 'VB' | 'VRB' | 'VAR' | 'IB';

/** Diode model fields as written in a netlist, canonical names or ngspice aliases. */
export type DiodeModelInput = Partial<DiodeParams> & Partial<Record<DiodeModelAlias, number>>;

// ngspice-47 const.h: CONSTboltz, CHARGE, CONSTCtoK.
const BOLTZMANN = 1.38064852e-23;
const ELEMENTARY_CHARGE = 1.6021766208e-19;
const KELVIN_OFFSET = 273.15;
const K_OVER_Q = BOLTZMANN / ELEMENTARY_CHARGE;
const GMIN = 1e-12;
/** ngspice CKTepsmin: smaller IKF values disable the knee (diosetup.c). */
const MIN_KNEE_CURRENT = 1e-28;
/** ngspice dioload.c applies the knee only above this junction current. */
const KNEE_CURRENT_THRESHOLD = 1e-18;
const UNSUPPORTED_BREAKDOWN_TEMPERATURE_PARAMETERS = new Set([
  'NBV', 'IBVL', 'NBVL', 'TLEV', 'TRS1', 'TRS2',
  // ngspice-47 TCV (with alias TBV1) lowers BV by TCV*dT, unlike the bounded
  // TBV1/TBV2 law below, so it is rejected instead of being mapped.
  'TCV',
]);

/** Thermal voltage kT/q at a temperature in Celsius, as ngspice computes it. */
function thermalVoltageAt(temperatureCelsius: number): number {
  return K_OVER_Q * (temperatureCelsius + KELVIN_OFFSET);
}

/**
 * Map ngspice diode model aliases onto canonical spice-ts names. ngspice keeps
 * the last value written to a shared field, which depends on netlist order that
 * the model card no longer carries, so conflicting values are rejected.
 */
export function canonicalDiodeModelParams(
  name: string,
  params: Readonly<DiodeModelInput>,
): Partial<DiodeParams> {
  const values = params as Readonly<Record<string, number | undefined>>;
  const canonical: Record<string, number> = {};
  for (const { names, description } of DIODE_ALIAS_GROUPS) {
    const supplied = names.filter(field => values[field] !== undefined);
    const conflict = supplied.find(field => values[field] !== values[supplied[0]]);
    if (conflict !== undefined) {
      throw new InvalidCircuitError(
        `Diode '${name}' sets both ${supplied[0]}=${values[supplied[0]]} and `
          + `${conflict}=${values[conflict]}; they are aliases of the same `
          + `${description}, so supply only one`,
      );
    }
    if (supplied.length > 0) canonical[names[0]] = values[supplied[0]]!;
  }
  for (const [field, value] of Object.entries(values)) {
    if (value !== undefined && !DIODE_CANONICAL_NAMES.has(field)) canonical[field] = value;
  }
  return canonical as Partial<DiodeParams>;
}

interface BreakdownParams {
  voltage: number;
  current: number;
  thermalVoltage: number;
}

/** Temperature-resolved junction law shared by the DC, AC and noise paths. */
interface Junction {
  thermalVoltage: number;
  saturationCurrent: number;
  breakdown?: BreakdownParams;
  /** Area-scaled forward knee current; 0 disables high injection. */
  kneeCurrent: number;
}

export interface DiodeDistortionCoefficients {
  current2: number;
  current3: number;
  charge2: number;
  charge3: number;
}

interface ChargeTaylorCoefficients {
  capacitance: number;
  second: number;
  third: number;
}

export class Diode implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = true;
  readonly integratesTransientCharge: boolean;
  readonly params: DiodeParams;
  readonly suppliedParams: Readonly<Partial<DiodeParams>>;
  private temperature = 27;
  /** Limited junction voltage of the last stamp (ngspice CKTstate0 DIOvoltage). */
  private previousJunctionVoltage: number | undefined;
  /** Junction voltage of the last accepted transient timepoint (CKTstate1). */
  private acceptedJunctionVoltage: number | undefined;
  /** Junction voltage of the last undamped transient Newton solve, if unused. */
  private newtonJunctionVoltage: number | undefined;
  /** Whether the last stamp limited the junction (ngspice noncon). */
  private limited = false;
  /**
   * The junction is limited whenever the stamped junction is the terminal
   * pair: no RS, or RS expanded into a separate resistor. The two-terminal RS
   * fallback solves its internal junction exactly and needs no limiting.
   */
  readonly limitsOwnJunctions: boolean;
  /** stampDynamic is a no-op without junction capacitance or transit time. */
  readonly storesCharge: boolean;
  /** Junction voltage the last `stamp` linearised at; the charge uses the same point. */
  private stampedJunctionVoltage = 0;
  /**
   * Accepted junction charge history (ngspice DIOcapCharge in CKTstate1/2) and
   * the charge current at the last accepted point (DIOcapCurrent).
   */
  private acceptedCharge: number | undefined;
  private previousAcceptedCharge: number | undefined;
  private acceptedChargeCurrent = 0;
  /** Integration rule of the most recent charge stamp, committed on acceptance. */
  private pendingIntegration: ChargeIntegration | undefined;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    modelParams: DiodeModelInput,
    private readonly hasExternalSeriesResistance = false,
    readonly instanceParams: DiodeInstanceParams = {},
  ) {
    for (const field of Object.keys(modelParams)) {
      const canonicalField = DIODE_CANONICAL_NAMES.get(field) ?? field;
      if (UNSUPPORTED_BREAKDOWN_TEMPERATURE_PARAMETERS.has(canonicalField)) {
        const written = canonicalField === field ? '' : ` (written as '${field}')`;
        throw new Error(
          `Unsupported bounded diode breakdown-temperature model parameter: '${canonicalField}'${written}`,
        );
      }
    }
    const params = canonicalDiodeModelParams(name, modelParams);
    this.suppliedParams = params;
    const effectiveArea = (instanceParams.AREA ?? 1) * (instanceParams.M ?? 1);
    const effectivePerimeter = (instanceParams.PJ ?? 0) * (instanceParams.M ?? 1);
    this.params = {
      IS: (params.IS ?? 1e-14) * effectiveArea
        + (params.JSW ?? 0) * effectivePerimeter,
      N: params.N ?? 1,
      BV: params.BV ?? Infinity,
      IBV: params.IBV ?? 1e-3,
      TBV1: params.TBV1 ?? 0,
      TBV2: params.TBV2 ?? 0,
      TNOM: params.TNOM ?? 27,
      RS: (params.RS ?? 0) / effectiveArea,
      JSW: params.JSW ?? 0,
      CJ0: (params.CJO ?? 0) * effectiveArea,
      CJSW: (params.CJSW ?? 0) * effectivePerimeter,
      // ngspice diosetup.c defaults: VJ = VJSW = 1 V, FC = FCS = 0.5.
      VJ: params.VJ ?? 1,
      VJSW: params.VJSW ?? 1,
      M: params.M ?? 0.5,
      MJSW: params.MJSW ?? 0.33,
      FC: params.FC ?? 0.5,
      FCS: params.FCS ?? 0.5,
      TT: params.TT ?? 0,
      KF: params.KF ?? 0,
      AF: params.AF ?? 1,
      IKF: (params.IKF ?? 0) >= MIN_KNEE_CURRENT ? params.IKF! * effectiveArea : 0,
    };
    this.limitsOwnJunctions = this.params.RS === 0;
    this.storesCharge = Boolean(this.params.CJ0 || this.params.CJSW || this.params.TT);
    // A two-terminal RS fallback cannot carry the internal junction charge, so
    // it keeps the reduced C(v) stamp. Compiled circuits expand RS whenever the
    // junction stores charge, leaving RS = 0 here.
    this.integratesTransientCharge = this.limitsOwnJunctions && this.storesCharge;
  }

  beginTransientNewton(): void {
    // ngspice MODEINITPRED copies CKTstate1 into CKTstate0, so a new or
    // retried timepoint limits against the accepted junction voltage.
    if (this.acceptedJunctionVoltage !== undefined) {
      this.previousJunctionVoltage = this.acceptedJunctionVoltage;
    }
    this.newtonJunctionVoltage = undefined;
  }

  observeTransientNewton(solution: Float64Array): void {
    this.newtonJunctionVoltage = this.terminalVoltage(solution);
  }

  private terminalVoltage(solution: Float64Array): number {
    const [nA, nK] = this.nodes;
    return (nA >= 0 ? solution[nA] : 0) - (nK >= 0 ? solution[nK] : 0);
  }

  limitedLastStamp(): boolean {
    return this.limited;
  }

  acceptTransientStep(ctx: StampContext): void {
    const [nA, nK] = this.nodes;
    this.acceptedJunctionVoltage = (nA >= 0 ? ctx.getVoltage(nA) : 0)
      - (nK >= 0 ? ctx.getVoltage(nK) : 0);
    this.newtonJunctionVoltage = undefined;
    if (this.integratesTransientCharge) this.acceptCharge(this.acceptedJunctionVoltage);
  }

  resetTransient(): void {
    this.acceptedJunctionVoltage = undefined;
    this.newtonJunctionVoltage = undefined;
    this.limited = false;
    this.acceptedCharge = undefined;
    this.previousAcceptedCharge = undefined;
    this.acceptedChargeCurrent = 0;
    this.pendingIntegration = undefined;
  }

  setTemperature(value: number): void {
    this.temperature = value;
  }

  getTemperature(): number {
    return this.temperature;
  }

  /**
   * Kept for the `.disto` driver. The thermal voltage is kT/q in every mode now,
   * so distortion no longer needs a different junction law.
   */
  setDistortionMode(_enabled: boolean): void {}

  private junction(): Junction {
    return {
      thermalVoltage: this.params.N * thermalVoltageAt(this.temperature),
      saturationCurrent: this.params.IS,
      breakdown: this.breakdownParams(),
      kneeCurrent: this.params.IKF!,
    };
  }

  /** Reject diode fields outside the bounded `.disto` slice (no solution needed). */
  assertDistortionSupported(): void {
    const supported = new Set(['IS', 'TT', 'CJ0', 'CJO', 'RS']);
    const unsupported = Object.keys(this.suppliedParams).filter(name => !supported.has(name));
    if (unsupported.length > 0) {
      throw new InvalidCircuitError(
        `.disto diode '${this.name}' does not support model parameter ${unsupported[0]}`,
      );
    }
    if (Object.keys(this.instanceParams).length > 0) {
      throw new InvalidCircuitError(
        `.disto diode '${this.name}' supports only default instance geometry`,
      );
    }
    if (this.suppliedParams.RS !== undefined
        || this.hasExternalSeriesResistance || this.params.RS !== 0) {
      throw new InvalidCircuitError(`.disto diode '${this.name}' does not support series resistance`);
    }
    if (this.temperature !== 27) {
      throw new InvalidCircuitError(`.disto diode '${this.name}' does not support temperature overrides`);
    }
  }

  distortionCoefficients(solution: Float64Array): DiodeDistortionCoefficients {
    this.assertDistortionSupported();
    const [nA, nK] = this.nodes;
    const voltage = (nA >= 0 ? solution[nA] : 0) - (nK >= 0 ? solution[nK] : 0);
    const { IS, N, TT, CJ0: distortionCapacitance } = this.params;
    const thermalVoltage = N * thermalVoltageAt(this.temperature);
    const conductance = (IS / thermalVoltage) * safeExponential(voltage / thermalVoltage);
    const current2 = conductance / (2 * thermalVoltage);
    const current3 = conductance / (6 * thermalVoltage * thermalVoltage);
    const { VJ, M, FC } = this.params;
    const depletion = depletionChargeTaylor(voltage, distortionCapacitance!, VJ!, M!, FC!);
    return {
      current2,
      current3,
      charge2: TT! * current2 + depletion.second,
      charge3: TT! * current3 + depletion.third,
    };
  }

  stampDistortionDynamic(ctx: StampContext): void {
    const { IS, N, TT, CJ0: distortionCapacitance } = this.params;
    if (!distortionCapacitance && !TT) return;
    const [nA, nK] = this.nodes;
    const voltage = (nA >= 0 ? ctx.getVoltage(nA) : 0) - (nK >= 0 ? ctx.getVoltage(nK) : 0);
    const thermalVoltage = N * thermalVoltageAt(this.temperature);
    const conductance = (IS / thermalVoltage) * safeExponential(voltage / thermalVoltage);
    const { VJ, M, FC } = this.params;
    const capacitance = depletionChargeTaylor(voltage, distortionCapacitance!, VJ!, M!, FC!)
      .capacitance + TT! * conductance;
    if (nA >= 0) ctx.stampC(nA, nA, capacitance);
    if (nK >= 0) ctx.stampC(nK, nK, capacitance);
    if (nA >= 0 && nK >= 0) {
      ctx.stampC(nA, nK, -capacitance);
      ctx.stampC(nK, nA, -capacitance);
    }
  }

  private breakdownParams(): BreakdownParams | undefined {
    const { BV, IBV, TBV1, TBV2, TNOM } = this.params;
    if (!Number.isFinite(BV) || BV <= 0 || !Number.isFinite(IBV) || IBV <= 0) {
      return undefined;
    }
    const delta = this.temperature - TNOM;
    return {
      voltage: BV * (1 + TBV1 * delta + TBV2 * delta * delta),
      current: IBV,
      thermalVoltage: thermalVoltageAt(this.temperature),
    };
  }

  /** DC junction current used by the small-signal shot/flicker noise model. */
  noiseOperatingPoint(solution: Float64Array): {
    current: number;
    flickerCoefficient: number;
    flickerExponent: number;
    parallelMultiplier: number;
  } {
    const [nA, nK] = this.nodes;
    const terminalVoltage = (nA >= 0 ? solution[nA] : 0) - (nK >= 0 ? solution[nK] : 0);
    const { RS, KF, AF } = this.params;
    const { current } = diodeCurrent(terminalVoltage, this.junction(), RS);
    return {
      current,
      flickerCoefficient: KF!,
      flickerExponent: AF!,
      parallelMultiplier: this.instanceParams.M ?? 1,
    };
  }

  stamp(ctx: StampContext): void {
    const [nA, nK] = this.nodes;
    const vA = nA >= 0 ? ctx.getVoltage(nA) : 0;
    const vK = nK >= 0 ? ctx.getVoltage(nK) : 0;
    const junction = this.junction();
    let vd = vA - vK;

    this.limited = false;
    if (this.limitsOwnJunctions) {
      if (this.newtonJunctionVoltage !== undefined) vd = this.newtonJunctionVoltage;
      this.newtonJunctionVoltage = undefined;
      // ngspice dioload.c limits the junction relative to the previous Newton
      // iterate (CKTstate0 DIOvoltage) and stores the limited value back, in
      // DC and transient alike. Limiting only shapes iterates: once a step is
      // within 2*Vte it is the identity, so the converged point is on the
      // exact diode law (#430). A limited iterate is not converged (noncon).
      const limited = limitJunctionStep(vd, this.previousJunctionVoltage ?? 0, junction);
      this.limited = limited !== vd;
      vd = limited;
      this.previousJunctionVoltage = vd;
    }
    this.stampedJunctionVoltage = vd;

    const { current: id, conductance, linearizationVoltage } = diodeCurrent(
      vd,
      junction,
      this.params.RS,
    );
    const gd = conductance + GMIN;

    // Newton-Raphson companion: I = gd * Vd + Ieq
    const ieq = id - gd * linearizationVoltage;

    if (nA >= 0) ctx.stampG(nA, nA, gd);
    if (nK >= 0) ctx.stampG(nK, nK, gd);
    if (nA >= 0 && nK >= 0) {
      ctx.stampG(nA, nK, -gd);
      ctx.stampG(nK, nA, -gd);
    }

    if (nA >= 0) ctx.stampB(nA, -ieq);
    if (nK >= 0) ctx.stampB(nK, ieq);
  }

  stampDynamic(ctx: StampContext): void {
    const { CJ0, CJSW, VJ, VJSW, M, MJSW, FC, FCS, TT, RS } = this.params;
    if (!CJ0 && !CJSW && !TT) return;

    const [nA, nK] = this.nodes;
    const vA = nA >= 0 ? ctx.getVoltage(nA) : 0;
    const vK = nK >= 0 ? ctx.getVoltage(nK) : 0;
    const terminalVoltage = vA - vK;
    const junction = this.junction();

    // RS separates the external terminal from the charge-storing junction. The
    // two-terminal reduction therefore needs dVj/dVt as well as dQ/dVj.
    const operatingPoint = RS > 0
      ? diodeCurrent(terminalVoltage, junction, RS)
      : undefined;
    const junctionVoltage = operatingPoint?.junctionVoltage ?? terminalVoltage;
    const junctionVoltageGain = operatingPoint
      ? 1 / (1 + RS * operatingPoint.junctionConductance)
      : 1;

    let cj = depletionChargeTaylor(junctionVoltage, CJ0!, VJ!, M!, FC!).capacitance;
    cj += depletionChargeTaylor(junctionVoltage, CJSW!, VJSW!, MJSW!, FCS!).capacitance;

    if (TT) {
      const { thermalVoltage: vt, saturationCurrent, kneeCurrent } = junction;
      const exponential = Math.exp(Math.min(terminalVoltage / vt, 40));
      const junctionConductance = operatingPoint?.junctionConductance
        ?? applyForwardKnee(
          saturationCurrent * (exponential - 1),
          (saturationCurrent / vt) * exponential,
          kneeCurrent,
        ).conductance;
      cj += TT * junctionConductance;
    }

    // A two-terminal fallback can only represent the low-frequency reduction.
    // Compiled circuits expand RS into a physical resistor and internal junction
    // node, preserving the complete frequency-dependent pole.
    cj *= junctionVoltageGain * junctionVoltageGain;

    if (nA >= 0) ctx.stampC(nA, nA, cj);
    if (nK >= 0) ctx.stampC(nK, nK, cj);
    if (nA >= 0 && nK >= 0) {
      ctx.stampC(nA, nK, -cj);
      ctx.stampC(nK, nA, -cj);
    }
  }

  /**
   * Transient junction charge companion, as ngspice dioload.c integrates
   * DIOcapCharge with NIintegrate: the current is the integrated dQ/dt of the
   * charge q(v), not C(v)*dv/dt, so the stored charge is conserved across a
   * nonlinear swing (#403).
   */
  stampTransientCharge(ctx: StampContext, integration: ChargeIntegration): void {
    const voltage = this.stampedJunctionVoltage;
    const { charge, capacitance } = this.junctionCharge(voltage);
    const { current, conductance } = this.integrateCharge(charge, capacitance, integration);
    this.pendingIntegration = integration;

    const [nA, nK] = this.nodes;
    const ieq = current - conductance * voltage;
    if (nA >= 0) ctx.stampG(nA, nA, conductance);
    if (nK >= 0) ctx.stampG(nK, nK, conductance);
    if (nA >= 0 && nK >= 0) {
      ctx.stampG(nA, nK, -conductance);
      ctx.stampG(nK, nA, -conductance);
    }
    if (nA >= 0) ctx.stampB(nA, -ieq);
    if (nK >= 0) ctx.stampB(nK, ieq);
  }

  stampAcceptedChargeCurrent(ctx: StampContext): void {
    const [nA, nK] = this.nodes;
    if (nA >= 0) ctx.stampB(nA, -this.acceptedChargeCurrent);
    if (nK >= 0) ctx.stampB(nK, this.acceptedChargeCurrent);
  }

  /** Commit the junction charge and its integrated current at an accepted timepoint. */
  private acceptCharge(junctionVoltage: number): void {
    const { charge, capacitance } = this.junctionCharge(junctionVoltage);
    const integration = this.pendingIntegration;
    this.pendingIntegration = undefined;
    if (integration === undefined || this.acceptedCharge === undefined) {
      // Initial operating point: the charge is at rest (ngspice copies
      // CKTstate0 into CKTstate1 with a zero capacitor current at MODEINITTRAN).
      this.acceptedCharge = charge;
      this.previousAcceptedCharge = undefined;
      this.acceptedChargeCurrent = 0;
      return;
    }
    this.acceptedChargeCurrent = this.integrateCharge(charge, capacitance, integration).current;
    this.previousAcceptedCharge = this.acceptedCharge;
    this.acceptedCharge = charge;
  }

  /** Depletion (bottom + sidewall) plus diffusion charge and dQ/dV (ngspice dioload.c). */
  private junctionCharge(voltage: number): { charge: number; capacitance: number } {
    const { CJ0, CJSW, VJ, VJSW, M, MJSW, FC, FCS, TT } = this.params;
    const bottom = depletionCharge(voltage, CJ0!, VJ!, M!, FC!);
    // ngspice-47 offsets the sidewall charge above FCS*VJSW with the bottom
    // junction's F1 (DIOtF1), which steps the charge at FCS*VJSW whenever the
    // bottom and sidewall F1 differ. That step is not reproduced: the charge
    // here is the integral of the (ngspice-identical) capacitance (#450).
    const sidewall = depletionCharge(voltage, CJSW!, VJSW!, MJSW!, FCS!);
    let charge = bottom.charge + sidewall.charge;
    let capacitance = bottom.capacitance + sidewall.capacitance;
    if (TT) {
      // ngspice: diffcharge = TT*cd, diffcap = TT*gd, with cd and gd including GMIN.
      const { current, conductance } = junctionCurrent(voltage, this.junction());
      charge += TT * (current + GMIN * voltage);
      capacitance += TT * (conductance + GMIN);
    }
    return { charge, capacitance };
  }

  /** ngspice NIintegrate for one charge: returns the capacitor current and its dI/dV. */
  private integrateCharge(
    charge: number,
    capacitance: number,
    { method, dt, prevDt }: ChargeIntegration,
  ): { current: number; conductance: number } {
    const previous = this.acceptedCharge ?? charge;
    if (method === 'trapezoidal') {
      const factor = 2 / dt;
      return {
        current: factor * (charge - previous) - this.acceptedChargeCurrent,
        conductance: factor * capacitance,
      };
    }
    if (method === 'gear2' && prevDt !== undefined && this.previousAcceptedCharge !== undefined) {
      const alpha = prevDt / dt;
      const a1 = (2 + alpha) / ((1 + alpha) * dt);
      const a2 = (1 + alpha) / (alpha * dt);
      const a3 = 1 / (alpha * (1 + alpha) * dt);
      return {
        current: a1 * charge - a2 * previous + a3 * this.previousAcceptedCharge,
        conductance: a1 * capacitance,
      };
    }
    return { current: (charge - previous) / dt, conductance: capacitance / dt };
  }
}

/**
 * Depletion charge and capacitance of one junction component, as ngspice
 * dioload.c: Q = VJ*CJ0*(1 - (1-V/VJ)^(1-M))/(1-M) below FC*VJ, and the
 * integral of the linear capacitance extension above it, so Q is C^1.
 */
function depletionCharge(
  voltage: number,
  zeroBiasCapacitance: number,
  junctionPotential: number,
  gradingCoefficient: number,
  forwardCoefficient: number,
): { charge: number; capacitance: number } {
  if (!zeroBiasCapacitance) return { charge: 0, capacitance: 0 };
  const { capacitance } = depletionChargeTaylor(
    voltage, zeroBiasCapacitance, junctionPotential, gradingCoefficient, forwardCoefficient,
  );
  const threshold = forwardCoefficient * junctionPotential;
  if (voltage < threshold) {
    return {
      charge: abruptJunctionCharge(voltage, zeroBiasCapacitance, junctionPotential, gradingCoefficient),
      capacitance,
    };
  }
  const continuation = Math.pow(1 - forwardCoefficient, 1 + gradingCoefficient);
  const linear = 1 - forwardCoefficient * (1 + gradingCoefficient);
  const extension = zeroBiasCapacitance / continuation * (
    linear * (voltage - threshold)
    + gradingCoefficient / (2 * junctionPotential) * (voltage * voltage - threshold * threshold)
  );
  return {
    charge: abruptJunctionCharge(threshold, zeroBiasCapacitance, junctionPotential, gradingCoefficient)
      + extension,
    capacitance,
  };
}

/** Charge stored between 0 and V on the abrupt-junction law CJ0/(1-V/VJ)^M. */
function abruptJunctionCharge(
  voltage: number,
  zeroBiasCapacitance: number,
  junctionPotential: number,
  gradingCoefficient: number,
): number {
  const depletion = 1 - voltage / junctionPotential;
  const exponent = 1 - gradingCoefficient;
  return Math.abs(exponent) < 1e-12
    ? -junctionPotential * zeroBiasCapacitance * Math.log(depletion)
    : junctionPotential * zeroBiasCapacitance * (1 - Math.pow(depletion, exponent)) / exponent;
}

/**
 * Resolve the zero-bias junction capacitance. ngspice accepts CJO, CJ0 and CJ
 * for the same model field; conflicting values are rejected rather than
 * silently picking one.
 */
export function diodeZeroBiasCapacitance(
  name: string,
  params: Readonly<DiodeModelInput>,
): number | undefined {
  return canonicalDiodeModelParams(name, params).CJO;
}

/**
 * Depletion capacitance dQ/dV and its Taylor terms, as in ngspice dioload.c:
 * the abrupt-junction law below FC*VJ, and above it the linear extension
 * C = CJ0/F2 * (F3 + M*V/VJ) with F2 = (1-FC)^(1+M), F3 = 1 - FC*(1+M),
 * which keeps the capacitance continuous at V = FC*VJ.
 */
function depletionChargeTaylor(
  junctionVoltage: number,
  zeroBiasCapacitance: number,
  junctionPotential: number,
  gradingCoefficient: number,
  forwardCoefficient: number,
): ChargeTaylorCoefficients {
  if (!zeroBiasCapacitance) return { capacitance: 0, second: 0, third: 0 };
  if (junctionVoltage < forwardCoefficient * junctionPotential) {
    const depletion = 1 - junctionVoltage / junctionPotential;
    const capacitance = zeroBiasCapacitance / Math.pow(depletion, gradingCoefficient);
    const second = capacitance * gradingCoefficient
      / (2 * junctionPotential * depletion);
    return {
      capacitance,
      second,
      third: second * (gradingCoefficient + 1)
        / (3 * junctionPotential * depletion),
    };
  }
  const continuation = Math.pow(1 - forwardCoefficient, 1 + gradingCoefficient);
  return {
    capacitance: zeroBiasCapacitance / continuation * (
      1 - forwardCoefficient * (1 + gradingCoefficient)
      + gradingCoefficient * junctionVoltage / junctionPotential
    ),
    second: zeroBiasCapacitance * gradingCoefficient
      / (2 * junctionPotential * continuation),
    third: 0,
  };
}

function diodeCurrent(
  terminalVoltage: number,
  junction: Junction,
  seriesResistance: number,
): {
  current: number;
  conductance: number;
  junctionConductance: number;
  junctionVoltage: number;
  linearizationVoltage: number;
} {
  const { thermalVoltage, saturationCurrent } = junction;
  if (seriesResistance === 0) {
    const { current, conductance } = junctionCurrent(terminalVoltage, junction);
    return {
      current,
      conductance,
      junctionConductance: conductance,
      junctionVoltage: terminalVoltage,
      linearizationVoltage: terminalVoltage,
    };
  }

  let junctionVoltage = terminalVoltage;
  if (terminalVoltage > 0) {
    junctionVoltage = Math.min(
      terminalVoltage,
      thermalVoltage * Math.log1p(terminalVoltage / (seriesResistance * saturationCurrent)),
    );
  }

  for (let iteration = 0; iteration < 12; iteration++) {
    const { current, conductance } = junctionCurrent(junctionVoltage, junction);
    const correction = (junctionVoltage + seriesResistance * current - terminalVoltage)
      / (1 + seriesResistance * conductance);
    junctionVoltage -= correction;
    if (Math.abs(correction) <= 1e-12) break;
  }

  const { current, conductance } = junctionCurrent(junctionVoltage, junction);
  return {
    current,
    conductance: conductance / (1 + seriesResistance * conductance),
    junctionConductance: conductance,
    junctionVoltage,
    linearizationVoltage: terminalVoltage,
  };
}

function junctionCurrent(
  voltage: number,
  { thermalVoltage, saturationCurrent, breakdown, kneeCurrent }: Junction,
): { current: number; conductance: number } {
  if (breakdown) {
    const knee = breakdownKneeVoltage(breakdown, saturationCurrent);
    if (voltage < -knee) {
      const exponential = safeExponential(-(knee + voltage) / breakdown.thermalVoltage);
      return {
        current: -saturationCurrent * exponential,
        conductance: saturationCurrent * exponential / breakdown.thermalVoltage,
      };
    }
  }
  const exponential = safeExponential(voltage / thermalVoltage);
  return applyForwardKnee(
    saturationCurrent * (exponential - 1),
    (saturationCurrent / thermalVoltage) * exponential,
    kneeCurrent,
  );
}

/** High-injection roll-off above the forward knee current IKF (ngspice dioload.c). */
function applyForwardKnee(
  current: number,
  conductance: number,
  kneeCurrent: number,
): { current: number; conductance: number } {
  if (kneeCurrent <= 0 || current <= KNEE_CURRENT_THRESHOLD) return { current, conductance };
  const root = Math.sqrt(current / kneeCurrent);
  return {
    current: current / (1 + root),
    conductance: ((1 + root) * conductance - current * conductance / (2 * root * kneeCurrent))
      / (1 + 2 * root + current / kneeCurrent),
  };
}

function breakdownKneeVoltage(
  breakdown: BreakdownParams,
  saturationCurrent: number,
): number {
  const { voltage, current, thermalVoltage } = breakdown;
  let knee = voltage - thermalVoltage * Math.log1p(current / saturationCurrent);
  for (let iteration = 0; iteration < 25; iteration++) {
    knee = voltage - thermalVoltage
      * Math.log(current / saturationCurrent + 1 - knee / thermalVoltage);
  }
  return knee;
}

/**
 * ngspice-47 dioload.c junction limiting: DEVpnjlim on the forward junction,
 * or on the voltage beyond the breakdown knee when the junction is in breakdown.
 * Both use the forward critical voltage tVcrit, as ngspice does.
 */
function limitJunctionStep(
  voltage: number,
  previousVoltage: number,
  { thermalVoltage, saturationCurrent, breakdown }: Junction,
): number {
  const criticalVoltage = thermalVoltage
    * Math.log(thermalVoltage / (Math.SQRT2 * saturationCurrent));
  if (breakdown) {
    const knee = breakdownKneeVoltage(breakdown, saturationCurrent);
    if (voltage < Math.min(0, -knee + 10 * breakdown.thermalVoltage)) {
      return -knee - pnjlim(
        -(voltage + knee),
        -(previousVoltage + knee),
        breakdown.thermalVoltage,
        criticalVoltage,
      );
    }
  }
  return pnjlim(voltage, previousVoltage, thermalVoltage, criticalVoltage);
}

/** ngspice-47 devsup.c DEVpnjlim: limit a junction step relative to the last iterate. */
function pnjlim(
  voltage: number,
  previousVoltage: number,
  thermalVoltage: number,
  criticalVoltage: number,
): number {
  if (voltage > criticalVoltage
    && Math.abs(voltage - previousVoltage) > 2 * thermalVoltage) {
    if (previousVoltage > 0) {
      const ratio = (voltage - previousVoltage) / thermalVoltage;
      return ratio > 0
        ? previousVoltage + thermalVoltage * (2 + Math.log(ratio - 2))
        : previousVoltage - thermalVoltage * (2 + Math.log(2 - ratio));
    }
    return thermalVoltage * Math.log(voltage / thermalVoltage);
  }
  if (voltage < 0) {
    const minimum = previousVoltage > 0 ? -previousVoltage - 1 : 2 * previousVoltage - 1;
    return Math.max(voltage, minimum);
  }
  return voltage;
}

function safeExponential(exponent: number): number {
  return Math.exp(Math.min(exponent, 700));
}
