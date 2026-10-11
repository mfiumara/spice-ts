import type { BSIM3Model, BSIM3Size } from './bsim3v3-params.js';

/**
 * Inputs of the bounded capacitance approximation below. Geometry, overlap
 * and junction values come from the ngspice b3temp.c size-dependent
 * parameters; the intrinsic charge model itself is not ngspice capMod.
 */
export interface BSIM3v3CapParams {
  /** NMOS-convention zero-bias threshold (type * vth0). */
  vth0: number;
  k1: number;
  phi: number;
  /** Cox * WeffCV * LeffCV (F). */
  coxWL: number;
  /** Absolute overlap capacitances (F): (CGDO + CF) * WeffCV etc. */
  cgdo: number;
  cgso: number;
  cgbo: number;
  cj: number; cjsw: number; mj: number; mjsw: number; pb: number; pbsw: number;
  ad: number; as: number; pd: number; ps: number;
}

/** Capacitance inputs for one instance. */
export function capParams(model: BSIM3Model, size: BSIM3Size): BSIM3v3CapParams {
  const m = model.values;
  return {
    vth0: model.type * size.instVth0,
    k1: size.k1,
    phi: size.phi,
    coxWL: model.cox * size.weffCV * size.leffCV,
    cgdo: size.cgdo,
    cgso: size.cgso,
    cgbo: size.cgbo,
    cj: m.cj, cjsw: m.cjsw, mj: m.mj, mjsw: m.mjsw, pb: m.pb, pbsw: m.pbsw,
    ad: size.drainArea, as: size.sourceArea, pd: size.drainPerimeter, ps: size.sourcePerimeter,
  };
}

export interface BSIM3v3CapResult {
  Cgg: number;  // Total gate capacitance
  Cgd: number;  // Gate-drain capacitance
  Cgs: number;  // Gate-source capacitance
  Cgb: number;  // Gate-bulk capacitance
  Cbd: number;  // Bulk-drain junction capacitance
  Cbs: number;  // Bulk-source junction capacitance
}

/**
 * Evaluate BSIM3v3 capacitances.
 *
 * Uses a simplified charge-based model:
 * - Intrinsic: Meyer-like model with smooth tanh transitions
 * - Overlap: CGSO, CGDO, CGBO (bias-independent)
 * - Junction: CJ, CJSW with reverse-bias depletion
 */
export function evaluateCap(
  p: BSIM3v3CapParams,
  Vgs: number,
  Vds: number,
  Vbs: number,
): BSIM3v3CapResult {
  const CoxWL = p.coxWL;

  // Reverse mode (Vds < 0): the intrinsic channel charge is evaluated with
  // drain and source interchanged and its gate-drain/gate-source split is
  // swapped back onto the physical terminals, as ngspice BSIM3 does for
  // BSIM3mode = -1. Overlap and junction capacitances stay on the physical
  // terminals.
  const reverse = Vds < 0;
  const iVgs = reverse ? Vgs - Vds : Vgs;
  const iVds = reverse ? -Vds : Vds;
  const iVbs = reverse ? Vbs - Vds : Vbs;

  // ===== Approximate Vth for cap model (simplified, no SCE) =====
  const sqrtPhiMinusVbs = Math.sqrt(Math.max(p.phi - iVbs, 0.01));
  const Vth = p.vth0 + p.k1 * sqrtPhiMinusVbs - Math.abs(p.k1) * Math.sqrt(p.phi);

  // Normalized gate overdrive
  const Vov = iVgs - Vth;

  // ===== Intrinsic gate capacitances (Meyer-like with smooth tanh transitions) =====
  let Cgc: number;   // Gate-channel capacitance (intrinsic)
  let Cgb_i: number; // Gate-bulk (intrinsic, depletion component)
  let fDrain: number; // Fraction of Cgc attributed to drain (Ward-Dutton)

  if (Vov < -0.1) {
    // Accumulation / deep depletion — Cgc ≈ 0, Cgb ≈ 0 (simplified)
    Cgc = 0;
    Cgb_i = 0;
    fDrain = 0.5;
  } else if (Vov < 0.1) {
    // Transition region — smooth blend using tanh
    const blend = 0.5 + 0.5 * Math.tanh(Vov / 0.04);
    Cgc = CoxWL * blend;
    Cgb_i = CoxWL * (1 - blend) * 0.5; // depletion contribution
    fDrain = 0.5;
  } else {
    // Strong inversion
    Cgc = CoxWL;
    Cgb_i = 0;

    // Ward-Dutton charge partitioning:
    // Linear region: fDrain = 0.5 - x/3 where x = Vds/(2*Vov - Vds)
    // Saturation: fDrain = 0.4 (2/3 of Cgc to source)
    if (iVds < Vov) {
      // Linear region
      const x = iVds / (2 * Vov - iVds + 1e-20);
      fDrain = 0.5 - x / 3;
    } else {
      // Saturation
      fDrain = 0.4;
    }
  }

  // Intrinsic caps from gate-channel + Ward-Dutton split (effective orientation)
  const CgdEff = Cgc * fDrain;
  const CgsEff = Cgc * (1 - fDrain);
  const Cgd_i = reverse ? CgsEff : CgdEff;
  const Cgs_i = reverse ? CgdEff : CgsEff;

  // ===== Overlap capacitances (bias-independent) =====
  const Cgd_ov = p.cgdo;
  const Cgs_ov = p.cgso;
  const Cgb_ov = p.cgbo;

  // ===== Junction capacitances =====
  // Drain junction: Vbd = Vbs - Vds
  const Cbd = junctionCap(p, Vbs - Vds, 'drain');
  // Source junction: Vbs = Vbs
  const Cbs = junctionCap(p, Vbs, 'source');

  // ===== Totals =====
  const Cgd = Cgd_i + Cgd_ov;
  const Cgs = Cgs_i + Cgs_ov;
  const Cgb = Cgb_i + Cgb_ov;
  const Cgg = Cgd + Cgs + Cgb;

  return { Cgg, Cgd, Cgs, Cgb, Cbd, Cbs };
}

/**
 * Junction capacitance model:
 *   Cj = CJ * area / (1 - Vj/PB)^MJ + CJSW * perim / (1 - Vj/PBSW)^MJSW
 * With linearization for forward bias (Vj > 0.5*PB).
 */
function junctionCap(
  p: BSIM3v3CapParams,
  Vj: number,
  terminal: 'drain' | 'source',
): number {
  const area = terminal === 'drain' ? p.ad : p.as;
  const perim = terminal === 'drain' ? p.pd : p.ps;

  let cBottom = 0;
  if (p.cj > 0 && area > 0) {
    if (Vj < 0.5 * p.pb) {
      cBottom = p.cj * area / Math.pow(1 - Vj / p.pb, p.mj);
    } else {
      // Linearize in forward bias: use value at 0.5*PB
      cBottom = p.cj * area / Math.pow(0.5, p.mj);
    }
  }

  let cSidewall = 0;
  if (p.cjsw > 0 && perim > 0) {
    if (Vj < 0.5 * p.pbsw) {
      cSidewall = p.cjsw * perim / Math.pow(1 - Vj / p.pbsw, p.mjsw);
    } else {
      // Linearize in forward bias: use value at 0.5*PBSW
      cSidewall = p.cjsw * perim / Math.pow(0.5, p.mjsw);
    }
  }

  return cBottom + cSidewall;
}
