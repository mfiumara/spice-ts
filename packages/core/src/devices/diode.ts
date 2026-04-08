import type { DeviceModel, StampContext } from './device.js';

export interface DiodeParams {
  IS: number;
  N: number;
  BV: number;
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

    const { IS, N } = this.params;
    const vt = N * VT;

    const vdLim = limitVoltage(vd, vt, IS);
    const expTerm = Math.exp(vdLim / vt);
    const id = IS * (expTerm - 1);
    const gd = (IS / vt) * expTerm + GMIN;

    // Newton-Raphson companion: I = gd * Vd + Ieq
    // where Ieq = Id(vdLim) - gd * vdLim (use limited voltage consistently)
    const ieq = id - gd * vdLim;

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

function limitVoltage(vd: number, vt: number, IS: number): number {
  const vcrit = vt * Math.log(vt / (Math.sqrt(2) * IS));
  if (vd > vcrit) {
    return vcrit + vt * Math.log(1 + (vd - vcrit) / vt);
  }
  return Math.max(vd, -40 * vt);
}
