import type { BSIM3v3ModelParams, BSIM3v3Derived } from './bsim3v3-params.js';

const VT = 0.02585; // Thermal voltage at 300K
const GMIN = 1e-12;

export interface BSIM3v3DCResult {
  Ids: number;
  gm: number;   // dIds/dVgs
  gds: number;  // dIds/dVds
  gmbs: number; // dIds/dVbs
}

/**
 * Evaluate BSIM3v3 DC drain current and small-signal conductances.
 *
 * All voltages are in the NMOS convention (positive Vgs turns on).
 * The caller handles polarity flipping for PMOS.
 *
 * Implements a simplified but complete BSIM3v3 flow:
 *   Vth -> ueff -> Vdsat -> Ids (unified) -> CLM/DIBL corrections -> subthreshold blending
 */
export function evaluateDC(
  p: BSIM3v3ModelParams,
  d: BSIM3v3Derived,
  Vgs: number,
  Vds: number,
  Vbs: number,
): BSIM3v3DCResult {
  const Ids = evalIds(p, d, Vgs, Vds, Vbs);

  // Numerical derivatives
  const dV = 1e-6;
  const Ids_gm = evalIds(p, d, Vgs + dV, Vds, Vbs);
  const Ids_gds = evalIds(p, d, Vgs, Vds + dV, Vbs);
  const Ids_gmbs = evalIds(p, d, Vgs, Vds, Vbs + dV);

  const gm = Math.max((Ids_gm - Ids) / dV, 0);
  const gds = Math.max((Ids_gds - Ids) / dV, 0) + GMIN;
  const gmbs = (Ids_gmbs - Ids) / dV;

  return { Ids, gm, gds, gmbs };
}

/**
 * Internal helper: compute Ids only (no derivatives) for numerical differentiation.
 * This duplicates the core Ids flow from evaluateDC but without derivative overhead.
 */
function evalIds(
  p: BSIM3v3ModelParams,
  d: BSIM3v3Derived,
  Vgs: number,
  Vds: number,
  Vbs: number,
): number {
  Vbs = Math.min(Vbs, 0.5 * d.phi_s);
  const sqrtPhiMinusVbs = Math.sqrt(Math.max(d.phi_s - Vbs, 0.01));

  // ===== 1. Threshold voltage =====
  const Vth_body = p.K1 * sqrtPhiMinusVbs - p.K2 * Vbs;
  // Short-channel effect: SCE lowers Vth for short channels based on built-in potential
  const theta_sce = Math.exp(-p.DVT1 * d.Leff / d.litl);
  const dVth_sce = -p.DVT0 * theta_sce * (d.Vbi - d.phi_s);
  // DIBL: drain-induced barrier lowering
  const dVth_dibl = -(p.ETA0 + p.ETAB * Vbs) * Vds;
  const Vth = p.VTH0 + Vth_body - Math.abs(p.K1) * d.sqrtPhi + dVth_sce + dVth_dibl;

  // ===== 2. Effective mobility =====
  const Eeff = (Vgs + Vth) / (6 * p.TOX);
  const mu_denom = 1 + (p.UA + p.UC * Vbs) * Eeff + p.UB * Eeff * Eeff;
  const ueff = (p.U0 * 1e-4) / Math.max(mu_denom, 0.01); // convert cm2/Vs to m2/Vs

  // ===== 3. Subthreshold smoothing =====
  // n is the subthreshold swing factor
  const n_sub = 1 + p.NFACTOR * (p.CDSC + p.CDSCB * Vbs + p.CDSCD * Vds) / d.Cox
    + 0.5 * p.K1 / sqrtPhiMinusVbs;
  const nVt = Math.max(n_sub, 1) * VT;
  // VOFF shifts the subthreshold transition point.
  // Vgsteff approaches 0 in subthreshold and (Vgs - Vth) above threshold.
  const Vgst_raw = Vgs - Vth;
  const voff_arg = (Vgst_raw - p.VOFF) / nVt;
  let Vgst_smooth: number;
  if (voff_arg > 40) {
    Vgst_smooth = Vgst_raw - p.VOFF;
  } else if (voff_arg < -40) {
    Vgst_smooth = nVt * Math.exp(voff_arg);
  } else {
    Vgst_smooth = nVt * Math.log(1 + Math.exp(voff_arg));
  }
  Vgst_smooth = Math.max(Vgst_smooth, 1e-20);

  // ===== 4. Abulk (bulk charge factor) =====
  const Abulk0 = 1 + p.K1 / (2 * sqrtPhiMinusVbs);
  const Abulk = Math.max(Abulk0 * (1 + p.KETA * Vbs), 0.1);

  // ===== 5. Saturation voltage =====
  const beta = ueff * d.Weff * d.Cox / d.Leff;
  const EsatL = 2 * p.VSAT * d.Leff / ueff;
  const Vdsat_long = Vgst_smooth / Abulk;
  const Vdsat = EsatL * Vdsat_long / (EsatL + Vdsat_long);

  // ===== 6. Drain current (unified) =====
  // Smooth Vds clamping to Vdsat
  const delta = 0.02;
  const Vds_clamped = Vdsat - 0.5 * (Vdsat - Vds - delta
    + Math.sqrt((Vdsat - Vds - delta) ** 2 + 4 * delta * Vdsat));

  const Ids_basic = beta * ((Vgst_smooth - Abulk * Vds_clamped / 2) * Vds_clamped);

  // ===== 7. Output conductance corrections =====
  // Smooth excess voltage above Vdsat (≈ 0 in linear, ≈ Vds-Vdsat in saturation)
  const diffVds = Vds - Vdsat;
  const smoothExcess = 0.5 * (diffVds + Math.sqrt(diffVds * diffVds + 0.001));

  // Channel length modulation
  let Va_CLM = 1e30;
  if (p.PCLM > 0) {
    const deltaL_ratio = p.PCLM * Math.log(1 + smoothExcess / (p.PCLM * d.litl + 1e-20));
    Va_CLM = Math.max(Vdsat * (1 + deltaL_ratio), 0.01);
  }

  // DIBL
  let Va_DIBL = 1e30;
  if (p.PDIBLC1 > 0 || p.PDIBLC2 > 0) {
    const theta_dibl = Math.exp(-p.DROUT * d.Leff / d.litl);
    const thetaRout = p.PDIBLC1 * theta_dibl + p.PDIBLC2;
    if (thetaRout > 0) Va_DIBL = Math.max(Vgst_smooth / thetaRout, 0.01);
  }

  const Va = 1 / (1 / Va_CLM + 1 / Va_DIBL);
  // smoothExcess naturally gates the correction: ~0 in linear, grows in saturation
  return Math.max(Ids_basic * (1 + smoothExcess / Va), 0);
}
