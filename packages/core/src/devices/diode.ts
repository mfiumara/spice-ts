import type { DiodeInstanceParams } from '../parser/diode-parser.js';
import type { DeviceModel, StampContext } from './device.js';

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
  CJP?: number;
  CJSW?: number;
  VJ?: number;
  PHP?: number;
  VJSW?: number;
  M?: number;
  MJSW?: number;
  TT?: number;
  KF?: number;
  AF?: number;
}

const VT = 0.02585; // Thermal voltage at 300K
const KELVIN_OFFSET = 273.15;
const K_OVER_Q = 8.617333262e-5;
const GMIN = 1e-12;

interface BreakdownParams {
  voltage: number;
  current: number;
  thermalVoltage: number;
}

export class Diode implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = true;
  readonly params: DiodeParams;
  private temperature = 27;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    params: Partial<DiodeParams>,
    private readonly hasExternalSeriesResistance = false,
    readonly instanceParams: DiodeInstanceParams = {},
  ) {
    const effectiveArea = (instanceParams.AREA ?? 1) * (instanceParams.M ?? 1);
    const effectivePerimeter = (instanceParams.PJ ?? 0) * (instanceParams.M ?? 1);
    const junctionPotential = params.VJ ?? 0.7;
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
      CJ0: (params.CJ0 ?? 0) * effectiveArea,
      CJSW: (params.CJSW ?? params.CJP ?? 0) * effectivePerimeter,
      VJ: junctionPotential,
      VJSW: params.VJSW ?? params.PHP ?? junctionPotential,
      M: params.M ?? 0.5,
      MJSW: params.MJSW ?? 0.33,
      TT: params.TT ?? 0,
      KF: params.KF ?? 0,
      AF: params.AF ?? 1,
    };
  }

  setTemperature(value: number): void {
    this.temperature = value;
  }

  getTemperature(): number {
    return this.temperature;
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
      thermalVoltage: K_OVER_Q * (this.temperature + KELVIN_OFFSET),
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
    const { IS, N, RS, KF, AF } = this.params;
    const { current } = diodeCurrent(
      terminalVoltage,
      N * VT,
      IS,
      RS,
      this.breakdownParams(),
      !this.hasExternalSeriesResistance,
    );
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
    const vd = vA - vK;

    const { IS, N, RS } = this.params;
    const vt = N * VT;

    const { current: id, conductance, linearizationVoltage } = diodeCurrent(
      vd,
      vt,
      IS,
      RS,
      this.breakdownParams(),
      !this.hasExternalSeriesResistance,
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
    const { CJ0, CJSW, VJ, VJSW, M, MJSW, TT, IS, N, RS } = this.params;
    if (!CJ0 && !CJSW && !TT) return;

    const [nA, nK] = this.nodes;
    const vA = nA >= 0 ? ctx.getVoltage(nA) : 0;
    const vK = nK >= 0 ? ctx.getVoltage(nK) : 0;
    const terminalVoltage = vA - vK;
    const vt = N * VT;

    // RS separates the external terminal from the charge-storing junction. The
    // two-terminal reduction therefore needs dVj/dVt as well as dQ/dVj.
    const operatingPoint = RS > 0
      ? diodeCurrent(terminalVoltage, vt, IS, RS, this.breakdownParams())
      : undefined;
    const junctionVoltage = operatingPoint?.junctionVoltage ?? terminalVoltage;
    const junctionVoltageGain = operatingPoint
      ? 1 / (1 + RS * operatingPoint.junctionConductance)
      : 1;

    let cj = depletionCapacitance(junctionVoltage, CJ0!, VJ!, M!);
    cj += depletionCapacitance(junctionVoltage, CJSW!, VJSW!, MJSW!);

    if (TT) {
      const junctionConductance = operatingPoint?.junctionConductance
        ?? (IS / vt) * Math.exp(Math.min(terminalVoltage / vt, 40));
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
}

function depletionCapacitance(
  junctionVoltage: number,
  zeroBiasCapacitance: number,
  junctionPotential: number,
  gradingCoefficient: number,
): number {
  if (!zeroBiasCapacitance) return 0;
  if (junctionVoltage < 0.5 * junctionPotential) {
    return zeroBiasCapacitance
      / Math.pow(1 - junctionVoltage / junctionPotential, gradingCoefficient);
  }
  return zeroBiasCapacitance / Math.pow(0.5, gradingCoefficient);
}

function diodeCurrent(
  terminalVoltage: number,
  thermalVoltage: number,
  saturationCurrent: number,
  seriesResistance: number,
  breakdown?: BreakdownParams,
  limitJunctionVoltage = true,
): {
  current: number;
  conductance: number;
  junctionConductance: number;
  junctionVoltage: number;
  linearizationVoltage: number;
} {
  if (seriesResistance === 0) {
    const limitedVoltage = limitJunctionVoltage
      ? limitVoltage(terminalVoltage, thermalVoltage, saturationCurrent, breakdown)
      : terminalVoltage;
    const junction = junctionCurrent(
      limitedVoltage,
      thermalVoltage,
      saturationCurrent,
      breakdown,
    );
    return {
      current: junction.current,
      conductance: junction.conductance,
      junctionConductance: junction.conductance,
      junctionVoltage: limitedVoltage,
      linearizationVoltage: limitedVoltage,
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
    const junction = junctionCurrent(
      junctionVoltage,
      thermalVoltage,
      saturationCurrent,
      breakdown,
    );
    const correction = (junctionVoltage + seriesResistance * junction.current - terminalVoltage)
      / (1 + seriesResistance * junction.conductance);
    junctionVoltage -= correction;
    if (Math.abs(correction) <= 1e-12) break;
  }

  const junction = junctionCurrent(
    junctionVoltage,
    thermalVoltage,
    saturationCurrent,
    breakdown,
  );
  return {
    current: junction.current,
    conductance: junction.conductance / (1 + seriesResistance * junction.conductance),
    junctionConductance: junction.conductance,
    junctionVoltage,
    linearizationVoltage: terminalVoltage,
  };
}

function junctionCurrent(
  voltage: number,
  thermalVoltage: number,
  saturationCurrent: number,
  breakdown?: BreakdownParams,
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
  return {
    current: saturationCurrent * (exponential - 1),
    conductance: (saturationCurrent / thermalVoltage) * exponential,
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

function limitVoltage(
  voltage: number,
  thermalVoltage: number,
  saturationCurrent: number,
  breakdown?: BreakdownParams,
): number {
  if (breakdown) {
    const knee = breakdownKneeVoltage(breakdown, saturationCurrent);
    if (voltage < -knee) {
      return -knee - limitForwardVoltage(
        -(voltage + knee),
        breakdown.thermalVoltage,
        saturationCurrent,
      );
    }
  }
  return limitForwardVoltage(voltage, thermalVoltage, saturationCurrent);
}

function limitForwardVoltage(
  voltage: number,
  thermalVoltage: number,
  saturationCurrent: number,
): number {
  const criticalVoltage = thermalVoltage
    * Math.log(thermalVoltage / (Math.sqrt(2) * saturationCurrent));
  if (voltage > criticalVoltage) {
    return criticalVoltage
      + thermalVoltage * Math.log(1 + (voltage - criticalVoltage) / thermalVoltage);
  }
  return Math.max(voltage, -40 * thermalVoltage);
}

function safeExponential(exponent: number): number {
  return Math.exp(Math.min(exponent, 700));
}
