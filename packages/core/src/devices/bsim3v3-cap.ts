import type { BSIM3v3ModelParams, BSIM3v3Derived } from './bsim3v3-params.js';

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
  p: BSIM3v3ModelParams,
  d: BSIM3v3Derived,
  Vgs: number,
  Vds: number,
  Vbs: number,
): BSIM3v3CapResult {
  const CoxWL = d.Cox * d.Weff * d.Leff;

  // ===== Approximate Vth for cap model (simplified, no SCE) =====
  const sqrtPhiMinusVbs = Math.sqrt(Math.max(d.phi_s - Vbs, 0.01));
  const Vth = p.VTH0 + p.K1 * sqrtPhiMinusVbs - Math.abs(p.K1) * d.sqrtPhi;

  // Normalized gate overdrive
  const Vov = Vgs - Vth;

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
    if (Vds < Vov) {
      // Linear region
      const x = Vds / (2 * Vov - Vds + 1e-20);
      fDrain = 0.5 - x / 3;
    } else {
      // Saturation
      fDrain = 0.4;
    }
  }

  // Intrinsic caps from gate-channel + Ward-Dutton split
  const Cgd_i = Cgc * fDrain;
  const Cgs_i = Cgc * (1 - fDrain);

  // ===== Overlap capacitances (bias-independent) =====
  const Cgd_ov = p.CGDO * d.Weff;
  const Cgs_ov = p.CGSO * d.Weff;
  const Cgb_ov = p.CGBO * d.Leff;

  // ===== Junction capacitances =====
  // Drain junction: Vbd = Vbs - Vds
  const Cbd = junctionCap(p, d, Vbs - Vds, 'drain');
  // Source junction: Vbs = Vbs
  const Cbs = junctionCap(p, d, Vbs, 'source');

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
  p: BSIM3v3ModelParams,
  d: BSIM3v3Derived,
  Vj: number,
  terminal: 'drain' | 'source',
): number {
  const area = terminal === 'drain' ? d.AD : d.AS;
  const perim = terminal === 'drain' ? d.PD : d.PS;

  let cBottom = 0;
  if (p.CJ > 0 && area > 0) {
    if (Vj < 0.5 * p.PB) {
      cBottom = p.CJ * area / Math.pow(1 - Vj / p.PB, p.MJ);
    } else {
      // Linearize in forward bias: use value at 0.5*PB
      cBottom = p.CJ * area / Math.pow(0.5, p.MJ);
    }
  }

  let cSidewall = 0;
  if (p.CJSW > 0 && perim > 0) {
    if (Vj < 0.5 * p.PBSW) {
      cSidewall = p.CJSW * perim / Math.pow(1 - Vj / p.PBSW, p.MJSW);
    } else {
      // Linearize in forward bias: use value at 0.5*PBSW
      cSidewall = p.CJSW * perim / Math.pow(0.5, p.MJSW);
    }
  }

  return cBottom + cSidewall;
}
