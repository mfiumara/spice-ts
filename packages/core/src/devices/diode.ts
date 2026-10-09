import type { DeviceModel, StampContext } from './device.js';

export interface DiodeParams {
  IS: number;
  N: number;
  BV: number;
  RS: number;
  CJ0?: number;
  VJ?: number;
  M?: number;
  TT?: number;
}

const VT = 0.02585; // Thermal voltage at 300K
const GMIN = 1e-12;

export class Diode implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = true;
  readonly params: DiodeParams;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    params: Partial<DiodeParams>,
  ) {
    this.params = {
      IS: params.IS ?? 1e-14,
      N: params.N ?? 1,
      BV: params.BV ?? Infinity,
      RS: params.RS ?? 0,
      CJ0: params.CJ0 ?? 0,
      VJ: params.VJ ?? 0.7,
      M: params.M ?? 0.5,
      TT: params.TT ?? 0,
    };
  }

  stamp(ctx: StampContext): void {
    const [nA, nK] = this.nodes;
    const vA = nA >= 0 ? ctx.getVoltage(nA) : 0;
    const vK = nK >= 0 ? ctx.getVoltage(nK) : 0;
    const vd = vA - vK;

    const { IS, N, RS } = this.params;
    const vt = N * VT;

    const { current: id, conductance, linearizationVoltage } = diodeCurrent(vd, vt, IS, RS);
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
    const { CJ0, VJ, M, TT, IS, N } = this.params;
    if (!CJ0 && !TT) return;

    const [nA, nK] = this.nodes;
    const vA = nA >= 0 ? ctx.getVoltage(nA) : 0;
    const vK = nK >= 0 ? ctx.getVoltage(nK) : 0;
    const vd = vA - vK;

    let cj = 0;
    if (CJ0) {
      if (vd < 0.5 * VJ!) {
        cj = CJ0 / Math.pow(1 - vd / VJ!, M!);
      } else {
        cj = CJ0 / Math.pow(0.5, M!);
      }
    }

    if (TT) {
      const vt = N * VT;
      const gd = (IS / vt) * Math.exp(Math.min(vd / vt, 40));
      cj += TT * gd;
    }

    if (nA >= 0) ctx.stampC(nA, nA, cj);
    if (nK >= 0) ctx.stampC(nK, nK, cj);
    if (nA >= 0 && nK >= 0) {
      ctx.stampC(nA, nK, -cj);
      ctx.stampC(nK, nA, -cj);
    }
  }
}

function diodeCurrent(
  terminalVoltage: number,
  thermalVoltage: number,
  saturationCurrent: number,
  seriesResistance: number,
): { current: number; conductance: number; linearizationVoltage: number } {
  if (seriesResistance === 0) {
    const limitedVoltage = limitVoltage(terminalVoltage, thermalVoltage, saturationCurrent);
    const exponential = safeExponential(limitedVoltage / thermalVoltage);
    return {
      current: saturationCurrent * (exponential - 1),
      conductance: (saturationCurrent / thermalVoltage) * exponential,
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
    const exponential = safeExponential(junctionVoltage / thermalVoltage);
    const current = saturationCurrent * (exponential - 1);
    const junctionConductance = (saturationCurrent / thermalVoltage) * exponential;
    const correction = (junctionVoltage + seriesResistance * current - terminalVoltage)
      / (1 + seriesResistance * junctionConductance);
    junctionVoltage -= correction;
    if (Math.abs(correction) <= 1e-12) break;
  }

  const exponential = safeExponential(junctionVoltage / thermalVoltage);
  const current = saturationCurrent * (exponential - 1);
  const junctionConductance = (saturationCurrent / thermalVoltage) * exponential;
  return {
    current,
    conductance: junctionConductance / (1 + seriesResistance * junctionConductance),
    linearizationVoltage: terminalVoltage,
  };
}

function limitVoltage(voltage: number, thermalVoltage: number, saturationCurrent: number): number {
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
