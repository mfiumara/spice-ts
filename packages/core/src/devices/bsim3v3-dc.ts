import type { BSIM3Model, BSIM3Size } from './bsim3v3-params.js';
import { EPSSI, CHARGE_Q, MAX_EXP, MIN_EXP, EXP_THRESHOLD } from './bsim3v3-params.js';

/** b3ld.c drain current and derivatives for one normal-mode (Vds >= 0) evaluation. */
export interface BSIM3v3DCResult {
  /** Channel current from the effective drain to the effective source (A). */
  Ids: number;
  gm: number;   // dIds/dVgs
  gds: number;  // dIds/dVds
  gmbs: number; // dIds/dVbs
  /** Substrate current from the effective drain into the bulk (A) and its derivatives. */
  Isub: number;
  gbg: number;
  gbd: number;
  gbb: number;
  /** Threshold voltage (ngspice BSIM3von), the DEVfetlim pivot. */
  von: number;
  vdsat: number;
  vgsteff: number;
  ueff: number;
  rds: number;
}

/** Fresh result record; evaluateDC writes into it so callers can reuse one. */
export function createDCResult(): BSIM3v3DCResult {
  return {
    Ids: 0, gm: 0, gds: 0, gmbs: 0, Isub: 0, gbg: 0, gbd: 0, gbb: 0,
    von: 0, vdsat: 0, vgsteff: 0, ueff: 0, rds: 0,
  };
}

/**
 * Evaluate the BSIM3v3.3.0 DC drain current and its derivatives, a direct
 * port of ngspice-47 b3ld.c from "if (vds >= 0.0)" through the substrate
 * current. Voltages are in the NMOS convention (multiplied by type) and in
 * normal mode: the caller interchanges drain and source when Vds < 0 and
 * passes (Vgd, -Vds, Vbd), exactly as b3ld.c does for BSIM3mode = -1.
 */
export function evaluateDC(
  model: BSIM3Model,
  p: BSIM3Size,
  Vgs: number,
  Vds: number,
  Vbs: number,
  out: BSIM3v3DCResult = createDCResult(),
): BSIM3v3DCResult {
  let T0: number, T1: number, T2: number, T3: number, T4: number, T5: number;
  let T6: number, T7: number, T8: number, T9: number, T10: number;
  let dT0_dVg: number, dT0_dVd: number, dT0_dVb: number;
  let dT1_dVg: number, dT1_dVd: number, dT1_dVb: number;
  let dT2_dVg: number, dT2_dVd: number, dT2_dVb: number;
  let tmp1: number, tmp2: number, tmp3: number, tmp4: number;
  const cox = model.cox;
  const tox = model.tox;

  T0 = Vbs - p.vbsc - 0.001;
  T1 = Math.sqrt(T0 * T0 - 0.004 * p.vbsc);
  let Vbseff = p.vbsc + 0.5 * (T0 + T1);
  const dVbseff_dVb = 0.5 * (1.0 + T0 / T1);
  if (Vbseff < Vbs) Vbseff = Vbs;

  let sqrtPhis: number, dsqrtPhis_dVb: number;
  if (Vbseff > 0.0) {
    T0 = p.phi / (p.phi + Vbseff);
    sqrtPhis = p.phis3 / (p.phi + 0.5 * Vbseff);
    dsqrtPhis_dVb = -0.5 * sqrtPhis * sqrtPhis / p.phis3;
  } else {
    sqrtPhis = Math.sqrt(p.phi - Vbseff);
    dsqrtPhis_dVb = -0.5 / sqrtPhis;
  }
  const Xdep = p.Xdep0 * sqrtPhis / p.sqrtPhi;
  const dXdep_dVb = (p.Xdep0 / p.sqrtPhi) * dsqrtPhis_dVb;

  const Leff = p.leff;
  const Vtm = model.vtm;

  // Vth calculation
  T3 = Math.sqrt(Xdep);
  const V0 = p.vbi - p.phi;

  T0 = p.dvt2 * Vbseff;
  if (T0 >= -0.5) {
    T1 = 1.0 + T0;
    T2 = p.dvt2;
  } else {
    T4 = 1.0 / (3.0 + 8.0 * T0);
    T1 = (1.0 + 3.0 * T0) * T4;
    T2 = p.dvt2 * T4 * T4;
  }
  const lt1 = model.factor1 * T3 * T1;
  const dlt1_dVb = model.factor1 * (0.5 / T3 * T1 * dXdep_dVb + T3 * T2);

  T0 = p.dvt2w * Vbseff;
  if (T0 >= -0.5) {
    T1 = 1.0 + T0;
    T2 = p.dvt2w;
  } else {
    T4 = 1.0 / (3.0 + 8.0 * T0);
    T1 = (1.0 + 3.0 * T0) * T4;
    T2 = p.dvt2w * T4 * T4;
  }
  const ltw = model.factor1 * T3 * T1;
  const dltw_dVb = model.factor1 * (0.5 / T3 * T1 * dXdep_dVb + T3 * T2);

  let Theta0: number, dTheta0_dVb: number;
  T0 = -0.5 * p.dvt1 * Leff / lt1;
  if (T0 > -EXP_THRESHOLD) {
    T1 = Math.exp(T0);
    Theta0 = T1 * (1.0 + 2.0 * T1);
    dT1_dVb = -T0 / lt1 * T1 * dlt1_dVb;
    dTheta0_dVb = (1.0 + 4.0 * T1) * dT1_dVb;
  } else {
    T1 = MIN_EXP;
    Theta0 = T1 * (1.0 + 2.0 * T1);
    dTheta0_dVb = 0.0;
  }

  const thetavth = p.dvt0 * Theta0;
  const Delt_vth = thetavth * V0;
  const dDelt_vth_dVb = p.dvt0 * dTheta0_dVb * V0;

  T0 = -0.5 * p.dvt1w * p.weff * Leff / ltw;
  if (T0 > -EXP_THRESHOLD) {
    T1 = Math.exp(T0);
    T2 = T1 * (1.0 + 2.0 * T1);
    dT1_dVb = -T0 / ltw * T1 * dltw_dVb;
    dT2_dVb = (1.0 + 4.0 * T1) * dT1_dVb;
  } else {
    T1 = MIN_EXP;
    T2 = T1 * (1.0 + 2.0 * T1);
    dT2_dVb = 0.0;
  }

  T0 = p.dvt0w * T2;
  T2 = T0 * V0;
  dT2_dVb = p.dvt0w * dT2_dVb * V0;

  const TempRatio = model.temp / model.tnom - 1.0;
  T0 = Math.sqrt(1.0 + p.nlx / Leff);
  T1 = p.k1ox * (T0 - 1.0) * p.sqrtPhi
    + (p.kt1 + p.kt1l / Leff + p.kt2 * Vbseff) * TempRatio;
  tmp2 = tox * p.phi / (p.weff + p.w0);

  T3 = p.eta0 + p.etab * Vbseff;
  if (T3 < 1.0e-4) {
    T9 = 1.0 / (3.0 - 2.0e4 * T3);
    T3 = (2.0e-4 - T3) * T9;
    T4 = T9 * T9;
  } else {
    T4 = 1.0;
  }
  const dDIBL_Sft_dVd = T3 * p.theta0vb0;
  const DIBL_Sft = dDIBL_Sft_dVd * Vds;

  const Vth = model.type * p.instVth0 - p.k1 * p.sqrtPhi + p.k1ox * sqrtPhis
    - p.k2ox * Vbseff - Delt_vth - T2 + (p.k3 + p.k3b * Vbseff) * tmp2 + T1 - DIBL_Sft;
  out.von = Vth;

  const dVth_dVb = p.k1ox * dsqrtPhis_dVb - p.k2ox - dDelt_vth_dVb - dT2_dVb
    + p.k3b * tmp2 - p.etab * Vds * p.theta0vb0 * T4 + p.kt2 * TempRatio;
  const dVth_dVd = -dDIBL_Sft_dVd;

  // Calculate n
  tmp2 = p.nfactor * EPSSI / Xdep;
  tmp3 = p.cdsc + p.cdscb * Vbseff + p.cdscd * Vds;
  tmp4 = (tmp2 + tmp3 * Theta0 + p.cit) / cox;
  let n: number, dn_dVb: number, dn_dVd: number;
  if (tmp4 >= -0.5) {
    n = 1.0 + tmp4;
    dn_dVb = (-tmp2 / Xdep * dXdep_dVb + tmp3 * dTheta0_dVb + p.cdscb * Theta0) / cox;
    dn_dVd = p.cdscd * Theta0 / cox;
  } else {
    T0 = 1.0 / (3.0 + 8.0 * tmp4);
    n = (1.0 + 3.0 * tmp4) * T0;
    T0 *= T0;
    dn_dVb = (-tmp2 / Xdep * dXdep_dVb + tmp3 * dTheta0_dVb + p.cdscb * Theta0) / cox * T0;
    dn_dVd = p.cdscd * Theta0 / cox * T0;
  }

  // Poly gate Si depletion effect
  T0 = p.instVfb + p.phi;
  let Vgs_eff: number, dVgs_eff_dVg: number;
  if (p.ngate > 1.e18 && p.ngate < 1.e25 && Vgs > T0) {
    T1 = 1.0e6 * CHARGE_Q * EPSSI * p.ngate / (cox * cox);
    T4 = Math.sqrt(1.0 + 2.0 * (Vgs - T0) / T1);
    T2 = T1 * (T4 - 1.0);
    T3 = 0.5 * T2 * T2 / T1;
    T7 = 1.12 - T3 - 0.05;
    T6 = Math.sqrt(T7 * T7 + 0.224);
    T5 = 1.12 - 0.5 * (T7 + T6);
    Vgs_eff = Vgs - T5;
    dVgs_eff_dVg = 1.0 - (0.5 - 0.5 / T4) * (1.0 + T7 / T6);
  } else {
    Vgs_eff = Vgs;
    dVgs_eff_dVg = 1.0;
  }
  const Vgst = Vgs_eff - Vth;

  // Effective Vgst (Vgsteff)
  T10 = 2.0 * n * Vtm;
  const VgstNVt = Vgst / T10;
  const ExpArg = (2.0 * p.voff - Vgst) / T10;
  let Vgsteff: number, dVgsteff_dVg: number, dVgsteff_dVd: number, dVgsteff_dVb: number;
  if (VgstNVt > EXP_THRESHOLD) {
    Vgsteff = Vgst;
    dVgsteff_dVg = dVgs_eff_dVg;
    dVgsteff_dVd = -dVth_dVd;
    dVgsteff_dVb = -dVth_dVb;
  } else if (ExpArg > EXP_THRESHOLD) {
    T0 = (Vgst - p.voff) / (n * Vtm);
    const ExpVgst = Math.exp(T0);
    Vgsteff = Vtm * p.cdep0 / cox * ExpVgst;
    dVgsteff_dVg = Vgsteff / (n * Vtm);
    dVgsteff_dVd = -dVgsteff_dVg * (dVth_dVd + T0 * Vtm * dn_dVd);
    dVgsteff_dVb = -dVgsteff_dVg * (dVth_dVb + T0 * Vtm * dn_dVb);
    dVgsteff_dVg *= dVgs_eff_dVg;
  } else {
    const ExpVgst = Math.exp(VgstNVt);
    T1 = T10 * Math.log(1.0 + ExpVgst);
    dT1_dVg = ExpVgst / (1.0 + ExpVgst);
    dT1_dVb = -dT1_dVg * (dVth_dVb + Vgst / n * dn_dVb) + T1 / n * dn_dVb;
    dT1_dVd = -dT1_dVg * (dVth_dVd + Vgst / n * dn_dVd) + T1 / n * dn_dVd;

    dT2_dVg = -cox / (Vtm * p.cdep0) * Math.exp(ExpArg);
    T2 = 1.0 - T10 * dT2_dVg;
    dT2_dVd = -dT2_dVg * (dVth_dVd - 2.0 * Vtm * ExpArg * dn_dVd) + (T2 - 1.0) / n * dn_dVd;
    dT2_dVb = -dT2_dVg * (dVth_dVb - 2.0 * Vtm * ExpArg * dn_dVb) + (T2 - 1.0) / n * dn_dVb;

    Vgsteff = T1 / T2;
    T3 = T2 * T2;
    dVgsteff_dVg = (T2 * dT1_dVg - T1 * dT2_dVg) / T3 * dVgs_eff_dVg;
    dVgsteff_dVd = (T2 * dT1_dVd - T1 * dT2_dVd) / T3;
    dVgsteff_dVb = (T2 * dT1_dVb - T1 * dT2_dVb) / T3;
  }
  out.vgsteff = Vgsteff;

  // Effective channel geometry
  T9 = sqrtPhis - p.sqrtPhi;
  let Weff = p.weff - 2.0 * (p.dwg * Vgsteff + p.dwb * T9);
  let dWeff_dVg = -2.0 * p.dwg;
  let dWeff_dVb = -2.0 * p.dwb * dsqrtPhis_dVb;
  if (Weff < 2.0e-8) {
    T0 = 1.0 / (6.0e-8 - 2.0 * Weff);
    Weff = 2.0e-8 * (4.0e-8 - Weff) * T0;
    T0 *= T0 * 4.0e-16;
    dWeff_dVg *= T0;
    dWeff_dVb *= T0;
  }

  T0 = p.prwg * Vgsteff + p.prwb * T9;
  let Rds: number, dRds_dVg: number, dRds_dVb: number;
  if (T0 >= -0.9) {
    Rds = p.rds0 * (1.0 + T0);
    dRds_dVg = p.rds0 * p.prwg;
    dRds_dVb = p.rds0 * p.prwb * dsqrtPhis_dVb;
  } else {
    T1 = 1.0 / (17.0 + 20.0 * T0);
    Rds = p.rds0 * (0.8 + T0) * T1;
    T1 *= T1;
    dRds_dVg = p.rds0 * p.prwg * T1;
    dRds_dVb = p.rds0 * p.prwb * dsqrtPhis_dVb * T1;
  }
  out.rds = Rds;

  // Abulk
  T1 = 0.5 * p.k1ox / sqrtPhis;
  dT1_dVb = -T1 / sqrtPhis * dsqrtPhis_dVb;

  T9 = Math.sqrt(p.xj * Xdep);
  tmp1 = Leff + 2.0 * T9;
  T5 = Leff / tmp1;
  tmp2 = p.a0 * T5;
  tmp3 = p.weff + p.b1;
  tmp4 = p.b0 / tmp3;
  T2 = tmp2 + tmp4;
  dT2_dVb = -T9 / tmp1 / Xdep * dXdep_dVb;
  T6 = T5 * T5;
  T7 = T5 * T6;

  let Abulk0 = 1.0 + T1 * T2;
  let dAbulk0_dVb = T1 * tmp2 * dT2_dVb + T2 * dT1_dVb;

  T8 = p.ags * p.a0 * T7;
  let dAbulk_dVg = -T1 * T8;
  let Abulk = Abulk0 + dAbulk_dVg * Vgsteff;
  let dAbulk_dVb = dAbulk0_dVb - T8 * Vgsteff * (dT1_dVb + 3.0 * T1 * dT2_dVb);

  if (Abulk0 < 0.1) {
    T9 = 1.0 / (3.0 - 20.0 * Abulk0);
    Abulk0 = (0.2 - Abulk0) * T9;
    dAbulk0_dVb *= T9 * T9;
  }
  if (Abulk < 0.1) {
    T9 = 1.0 / (3.0 - 20.0 * Abulk);
    Abulk = (0.2 - Abulk) * T9;
    T10 = T9 * T9;
    dAbulk_dVb *= T10;
    dAbulk_dVg *= T10;
  }

  T2 = p.keta * Vbseff;
  if (T2 >= -0.9) {
    T0 = 1.0 / (1.0 + T2);
    dT0_dVb = -p.keta * T0 * T0;
  } else {
    T1 = 1.0 / (0.8 + T2);
    T0 = (17.0 + 20.0 * T2) * T1;
    dT0_dVb = -p.keta * T1 * T1;
  }
  dAbulk_dVg *= T0;
  dAbulk_dVb = dAbulk_dVb * T0 + Abulk * dT0_dVb;
  dAbulk0_dVb = dAbulk0_dVb * T0 + Abulk0 * dT0_dVb;
  Abulk *= T0;
  Abulk0 *= T0;

  // Mobility
  let dDenomi_dVg: number, dDenomi_dVd: number, dDenomi_dVb: number;
  if (model.mobMod === 1) {
    T0 = Vgsteff + Vth + Vth;
    T2 = p.ua + p.uc * Vbseff;
    T3 = T0 / tox;
    T5 = T3 * (T2 + p.ub * T3);
    dDenomi_dVg = (T2 + 2.0 * p.ub * T3) / tox;
    dDenomi_dVd = dDenomi_dVg * 2.0 * dVth_dVd;
    dDenomi_dVb = dDenomi_dVg * 2.0 * dVth_dVb + p.uc * T3;
  } else if (model.mobMod === 2) {
    T5 = Vgsteff / tox * (p.ua + p.uc * Vbseff + p.ub * Vgsteff / tox);
    dDenomi_dVg = (p.ua + p.uc * Vbseff + 2.0 * p.ub * Vgsteff / tox) / tox;
    dDenomi_dVd = 0.0;
    dDenomi_dVb = Vgsteff * p.uc / tox;
  } else {
    T0 = Vgsteff + Vth + Vth;
    T2 = 1.0 + p.uc * Vbseff;
    T3 = T0 / tox;
    T4 = T3 * (p.ua + p.ub * T3);
    T5 = T4 * T2;
    dDenomi_dVg = (p.ua + 2.0 * p.ub * T3) * T2 / tox;
    dDenomi_dVd = dDenomi_dVg * 2.0 * dVth_dVd;
    dDenomi_dVb = dDenomi_dVg * 2.0 * dVth_dVb + p.uc * T4;
  }

  let Denomi: number;
  if (T5 >= -0.8) {
    Denomi = 1.0 + T5;
  } else {
    T9 = 1.0 / (7.0 + 10.0 * T5);
    Denomi = (0.6 + T5) * T9;
    T9 *= T9;
    dDenomi_dVg *= T9;
    dDenomi_dVd *= T9;
    dDenomi_dVb *= T9;
  }

  const ueff = p.instU0temp / Denomi;
  out.ueff = ueff;
  T9 = -ueff / Denomi;
  const dueff_dVg = T9 * dDenomi_dVg;
  const dueff_dVd = T9 * dDenomi_dVd;
  const dueff_dVb = T9 * dDenomi_dVb;

  // Saturation drain voltage Vdsat
  const WVCox = Weff * p.vsattemp * cox;
  const WVCoxRds = WVCox * Rds;

  const Esat = 2.0 * p.vsattemp / ueff;
  const EsatL = Esat * Leff;
  T0 = -EsatL / ueff;
  const dEsatL_dVg = T0 * dueff_dVg;
  const dEsatL_dVd = T0 * dueff_dVd;
  const dEsatL_dVb = T0 * dueff_dVb;

  const a1 = p.a1;
  let Lambda: number, dLambda_dVg: number;
  if (a1 === 0.0) {
    Lambda = p.a2;
    dLambda_dVg = 0.0;
  } else if (a1 > 0.0) {
    T0 = 1.0 - p.a2;
    T1 = T0 - p.a1 * Vgsteff - 0.0001;
    T2 = Math.sqrt(T1 * T1 + 0.0004 * T0);
    Lambda = p.a2 + T0 - 0.5 * (T1 + T2);
    dLambda_dVg = 0.5 * p.a1 * (1.0 + T1 / T2);
  } else {
    T1 = p.a2 + p.a1 * Vgsteff - 0.0001;
    T2 = Math.sqrt(T1 * T1 + 0.0004 * p.a2);
    Lambda = 0.5 * (T1 + T2);
    dLambda_dVg = 0.5 * p.a1 * (1.0 + T1 / T2);
  }

  const Vgst2Vtm = Vgsteff + 2.0 * Vtm;

  if (Rds > 0) {
    tmp2 = dRds_dVg / Rds + dWeff_dVg / Weff;
    tmp3 = dRds_dVb / Rds + dWeff_dVb / Weff;
  } else {
    tmp2 = dWeff_dVg / Weff;
    tmp3 = dWeff_dVb / Weff;
  }
  let Vdsat: number, dVdsat_dVg: number, dVdsat_dVd: number, dVdsat_dVb: number;
  if (Rds === 0.0 && Lambda === 1.0) {
    T0 = 1.0 / (Abulk * EsatL + Vgst2Vtm);
    tmp1 = 0.0;
    T1 = T0 * T0;
    T2 = Vgst2Vtm * T0;
    T3 = EsatL * Vgst2Vtm;
    Vdsat = T3 * T0;

    dT0_dVg = -(Abulk * dEsatL_dVg + EsatL * dAbulk_dVg + 1.0) * T1;
    dT0_dVd = -(Abulk * dEsatL_dVd) * T1;
    dT0_dVb = -(Abulk * dEsatL_dVb + dAbulk_dVb * EsatL) * T1;

    dVdsat_dVg = T3 * dT0_dVg + T2 * dEsatL_dVg + EsatL * T0;
    dVdsat_dVd = T3 * dT0_dVd + T2 * dEsatL_dVd;
    dVdsat_dVb = T3 * dT0_dVb + T2 * dEsatL_dVb;
  } else {
    tmp1 = dLambda_dVg / (Lambda * Lambda);
    T9 = Abulk * WVCoxRds;
    T8 = Abulk * T9;
    T7 = Vgst2Vtm * T9;
    T6 = Vgst2Vtm * WVCoxRds;
    T0 = 2.0 * Abulk * (T9 - 1.0 + 1.0 / Lambda);
    dT0_dVg = 2.0 * (T8 * tmp2 - Abulk * tmp1 + (2.0 * T9 + 1.0 / Lambda - 1.0) * dAbulk_dVg);
    dT0_dVb = 2.0 * (T8 * (2.0 / Abulk * dAbulk_dVb + tmp3) + (1.0 / Lambda - 1.0) * dAbulk_dVb);
    dT0_dVd = 0.0;
    T1 = Vgst2Vtm * (2.0 / Lambda - 1.0) + Abulk * EsatL + 3.0 * T7;

    dT1_dVg = (2.0 / Lambda - 1.0) - 2.0 * Vgst2Vtm * tmp1 + Abulk * dEsatL_dVg
      + EsatL * dAbulk_dVg + 3.0 * (T9 + T7 * tmp2 + T6 * dAbulk_dVg);
    dT1_dVb = Abulk * dEsatL_dVb + EsatL * dAbulk_dVb + 3.0 * (T6 * dAbulk_dVb + T7 * tmp3);
    dT1_dVd = Abulk * dEsatL_dVd;

    T2 = Vgst2Vtm * (EsatL + 2.0 * T6);
    dT2_dVg = EsatL + Vgst2Vtm * dEsatL_dVg + T6 * (4.0 + 2.0 * Vgst2Vtm * tmp2);
    dT2_dVb = Vgst2Vtm * (dEsatL_dVb + 2.0 * T6 * tmp3);
    dT2_dVd = Vgst2Vtm * dEsatL_dVd;

    T3 = Math.sqrt(T1 * T1 - 2.0 * T0 * T2);
    Vdsat = (T1 - T3) / T0;


    dVdsat_dVg = (dT1_dVg - (T1 * dT1_dVg - dT0_dVg * T2 - T0 * dT2_dVg) / T3 - Vdsat * dT0_dVg) / T0;
    dVdsat_dVb = (dT1_dVb - (T1 * dT1_dVb - dT0_dVb * T2 - T0 * dT2_dVb) / T3 - Vdsat * dT0_dVb) / T0;
    dVdsat_dVd = (dT1_dVd - (T1 * dT1_dVd - T0 * dT2_dVd) / T3) / T0;
  }
  out.vdsat = Vdsat;

  // Effective Vds (Vdseff)
  T1 = Vdsat - Vds - p.delta;
  dT1_dVg = dVdsat_dVg;
  dT1_dVd = dVdsat_dVd - 1.0;
  dT1_dVb = dVdsat_dVb;

  T2 = Math.sqrt(T1 * T1 + 4.0 * p.delta * Vdsat);
  T0 = T1 / T2;
  T3 = 2.0 * p.delta / T2;
  dT2_dVg = T0 * dT1_dVg + T3 * dVdsat_dVg;
  dT2_dVd = T0 * dT1_dVd + T3 * dVdsat_dVd;
  dT2_dVb = T0 * dT1_dVb + T3 * dVdsat_dVb;

  let Vdseff = Vdsat - 0.5 * (T1 + T2);
  let dVdseff_dVg = dVdsat_dVg - 0.5 * (dT1_dVg + dT2_dVg);
  const dVdseff_dVd = dVdsat_dVd - 0.5 * (dT1_dVd + dT2_dVd);
  let dVdseff_dVb = dVdsat_dVb - 0.5 * (dT1_dVb + dT2_dVb);
  if (Vds === 0.0) {
    Vdseff = 0.0;
    dVdseff_dVg = 0.0;
    dVdseff_dVb = 0.0;
  }

  // VAsat
  tmp4 = 1.0 - 0.5 * Abulk * Vdsat / Vgst2Vtm;
  T9 = WVCoxRds * Vgsteff;
  T8 = T9 / Vgst2Vtm;
  T0 = EsatL + Vdsat + 2.0 * T9 * tmp4;

  T7 = 2.0 * WVCoxRds * tmp4;
  dT0_dVg = dEsatL_dVg + dVdsat_dVg + T7 * (1.0 + tmp2 * Vgsteff)
    - T8 * (Abulk * dVdsat_dVg - Abulk * Vdsat / Vgst2Vtm + Vdsat * dAbulk_dVg);
  dT0_dVb = dEsatL_dVb + dVdsat_dVb + T7 * tmp3 * Vgsteff
    - T8 * (dAbulk_dVb * Vdsat + Abulk * dVdsat_dVb);
  dT0_dVd = dEsatL_dVd + dVdsat_dVd - T8 * Abulk * dVdsat_dVd;

  T9 = WVCoxRds * Abulk;
  T1 = 2.0 / Lambda - 1.0 + T9;
  dT1_dVg = -2.0 * tmp1 + WVCoxRds * (Abulk * tmp2 + dAbulk_dVg);
  dT1_dVb = dAbulk_dVb * WVCoxRds + T9 * tmp3;

  const Vasat = T0 / T1;
  const dVasat_dVg = (dT0_dVg - Vasat * dT1_dVg) / T1;
  const dVasat_dVb = (dT0_dVb - Vasat * dT1_dVb) / T1;
  const dVasat_dVd = dT0_dVd / T1;

  if (Vdseff > Vds) Vdseff = Vds;
  const diffVds = Vds - Vdseff;

  // VACLM
  let VACLM: number, dVACLM_dVg: number, dVACLM_dVd: number, dVACLM_dVb: number;
  if (p.pclm > 0.0 && diffVds > 1.0e-10) {
    T0 = 1.0 / (p.pclm * Abulk * p.litl);
    dT0_dVb = -T0 / Abulk * dAbulk_dVb;
    dT0_dVg = -T0 / Abulk * dAbulk_dVg;

    T2 = Vgsteff / EsatL;
    T1 = Leff * (Abulk + T2);
    dT1_dVg = Leff * ((1.0 - T2 * dEsatL_dVg) / EsatL + dAbulk_dVg);
    dT1_dVb = Leff * (dAbulk_dVb - T2 * dEsatL_dVb / EsatL);
    dT1_dVd = -T2 * dEsatL_dVd / Esat;

    T9 = T0 * T1;
    VACLM = T9 * diffVds;
    dVACLM_dVg = T0 * dT1_dVg * diffVds - T9 * dVdseff_dVg + T1 * diffVds * dT0_dVg;
    dVACLM_dVb = (dT0_dVb * T1 + T0 * dT1_dVb) * diffVds - T9 * dVdseff_dVb;
    dVACLM_dVd = T0 * dT1_dVd * diffVds + T9 * (1.0 - dVdseff_dVd);
  } else {
    VACLM = MAX_EXP;
    dVACLM_dVd = dVACLM_dVg = dVACLM_dVb = 0.0;
  }

  // VADIBL
  let VADIBL: number, dVADIBL_dVg: number, dVADIBL_dVd: number, dVADIBL_dVb: number;
  if (p.thetaRout > 0.0) {
    T8 = Abulk * Vdsat;
    T0 = Vgst2Vtm * T8;
    dT0_dVg = Vgst2Vtm * Abulk * dVdsat_dVg + T8 + Vgst2Vtm * Vdsat * dAbulk_dVg;
    dT0_dVb = Vgst2Vtm * (dAbulk_dVb * Vdsat + Abulk * dVdsat_dVb);
    dT0_dVd = Vgst2Vtm * Abulk * dVdsat_dVd;

    T1 = Vgst2Vtm + T8;
    dT1_dVg = 1.0 + Abulk * dVdsat_dVg + Vdsat * dAbulk_dVg;
    dT1_dVb = Abulk * dVdsat_dVb + dAbulk_dVb * Vdsat;
    dT1_dVd = Abulk * dVdsat_dVd;

    T9 = T1 * T1;
    T2 = p.thetaRout;
    VADIBL = (Vgst2Vtm - T0 / T1) / T2;
    dVADIBL_dVg = (1.0 - dT0_dVg / T1 + T0 * dT1_dVg / T9) / T2;
    dVADIBL_dVb = (-dT0_dVb / T1 + T0 * dT1_dVb / T9) / T2;
    dVADIBL_dVd = (-dT0_dVd / T1 + T0 * dT1_dVd / T9) / T2;

    T7 = p.pdiblb * Vbseff;
    if (T7 >= -0.9) {
      T3 = 1.0 / (1.0 + T7);
      VADIBL *= T3;
      dVADIBL_dVg *= T3;
      dVADIBL_dVb = (dVADIBL_dVb - VADIBL * p.pdiblb) * T3;
      dVADIBL_dVd *= T3;
    } else {
      T4 = 1.0 / (0.8 + T7);
      T3 = (17.0 + 20.0 * T7) * T4;
      dVADIBL_dVg *= T3;
      dVADIBL_dVb = dVADIBL_dVb * T3 - VADIBL * p.pdiblb * T4 * T4;
      dVADIBL_dVd *= T3;
      VADIBL *= T3;
    }
  } else {
    VADIBL = MAX_EXP;
    dVADIBL_dVd = dVADIBL_dVg = dVADIBL_dVb = 0.0;
  }

  // VA
  T8 = p.pvag / EsatL;
  T9 = T8 * Vgsteff;
  if (T9 > -0.9) {
    T0 = 1.0 + T9;
    dT0_dVg = T8 * (1.0 - Vgsteff * dEsatL_dVg / EsatL);
    dT0_dVb = -T9 * dEsatL_dVb / EsatL;
    dT0_dVd = -T9 * dEsatL_dVd / EsatL;
  } else {
    T1 = 1.0 / (17.0 + 20.0 * T9);
    T0 = (0.8 + T9) * T1;
    T1 *= T1;
    dT0_dVg = T8 * (1.0 - Vgsteff * dEsatL_dVg / EsatL) * T1;
    T9 *= T1 / EsatL;
    dT0_dVb = -T9 * dEsatL_dVb;
    dT0_dVd = -T9 * dEsatL_dVd;
  }

  tmp1 = VACLM * VACLM;
  tmp2 = VADIBL * VADIBL;
  tmp3 = VACLM + VADIBL;

  T1 = VACLM * VADIBL / tmp3;
  tmp3 *= tmp3;
  dT1_dVg = (tmp1 * dVADIBL_dVg + tmp2 * dVACLM_dVg) / tmp3;
  dT1_dVd = (tmp1 * dVADIBL_dVd + tmp2 * dVACLM_dVd) / tmp3;
  dT1_dVb = (tmp1 * dVADIBL_dVb + tmp2 * dVACLM_dVb) / tmp3;

  const Va = Vasat + T0 * T1;
  const dVa_dVg = dVasat_dVg + T1 * dT0_dVg + T0 * dT1_dVg;
  const dVa_dVd = dVasat_dVd + T1 * dT0_dVd + T0 * dT1_dVd;
  const dVa_dVb = dVasat_dVb + T1 * dT0_dVb + T0 * dT1_dVb;

  // VASCBE
  let VASCBE: number, dVASCBE_dVg: number, dVASCBE_dVd: number, dVASCBE_dVb: number;
  if (p.pscbe2 > 0.0) {
    if (diffVds > p.pscbe1 * p.litl / EXP_THRESHOLD) {
      T0 = p.pscbe1 * p.litl / diffVds;
      VASCBE = Leff * Math.exp(T0) / p.pscbe2;
      T1 = T0 * VASCBE / diffVds;
      dVASCBE_dVg = T1 * dVdseff_dVg;
      dVASCBE_dVd = -T1 * (1.0 - dVdseff_dVd);
      dVASCBE_dVb = T1 * dVdseff_dVb;
    } else {
      VASCBE = MAX_EXP * Leff / p.pscbe2;
      dVASCBE_dVg = dVASCBE_dVd = dVASCBE_dVb = 0.0;
    }
  } else {
    VASCBE = MAX_EXP;
    dVASCBE_dVg = dVASCBE_dVd = dVASCBE_dVb = 0.0;
  }

  // Ids
  const CoxWovL = cox * Weff / Leff;
  const beta = ueff * CoxWovL;
  const dbeta_dVg = CoxWovL * dueff_dVg + beta * dWeff_dVg / Weff;
  const dbeta_dVd = CoxWovL * dueff_dVd;
  const dbeta_dVb = CoxWovL * dueff_dVb + beta * dWeff_dVb / Weff;

  T0 = 1.0 - 0.5 * Abulk * Vdseff / Vgst2Vtm;
  dT0_dVg = -0.5 * (Abulk * dVdseff_dVg - Abulk * Vdseff / Vgst2Vtm + Vdseff * dAbulk_dVg) / Vgst2Vtm;
  dT0_dVd = -0.5 * Abulk * dVdseff_dVd / Vgst2Vtm;
  dT0_dVb = -0.5 * (Abulk * dVdseff_dVb + dAbulk_dVb * Vdseff) / Vgst2Vtm;

  const fgche1 = Vgsteff * T0;
  const dfgche1_dVg = Vgsteff * dT0_dVg + T0;
  const dfgche1_dVd = Vgsteff * dT0_dVd;
  const dfgche1_dVb = Vgsteff * dT0_dVb;

  T9 = Vdseff / EsatL;
  const fgche2 = 1.0 + T9;
  const dfgche2_dVg = (dVdseff_dVg - T9 * dEsatL_dVg) / EsatL;
  const dfgche2_dVd = (dVdseff_dVd - T9 * dEsatL_dVd) / EsatL;
  const dfgche2_dVb = (dVdseff_dVb - T9 * dEsatL_dVb) / EsatL;

  const gche = beta * fgche1 / fgche2;
  const dgche_dVg = (beta * dfgche1_dVg + fgche1 * dbeta_dVg - gche * dfgche2_dVg) / fgche2;
  const dgche_dVd = (beta * dfgche1_dVd + fgche1 * dbeta_dVd - gche * dfgche2_dVd) / fgche2;
  const dgche_dVb = (beta * dfgche1_dVb + fgche1 * dbeta_dVb - gche * dfgche2_dVb) / fgche2;

  T0 = 1.0 + gche * Rds;
  T9 = Vdseff / T0;
  const Idl = gche * T9;
  const dIdl_dVg = (gche * dVdseff_dVg + T9 * dgche_dVg) / T0 - Idl * gche / T0 * dRds_dVg;
  const dIdl_dVd = (gche * dVdseff_dVd + T9 * dgche_dVd) / T0;
  const dIdl_dVb = (gche * dVdseff_dVb + T9 * dgche_dVb - Idl * dRds_dVb * gche) / T0;

  T9 = diffVds / Va;
  T0 = 1.0 + T9;
  const Idsa = Idl * T0;
  const dIdsa_dVg = T0 * dIdl_dVg - Idl * (dVdseff_dVg + T9 * dVa_dVg) / Va;
  const dIdsa_dVd = T0 * dIdl_dVd + Idl * (1.0 - dVdseff_dVd - T9 * dVa_dVd) / Va;
  const dIdsa_dVb = T0 * dIdl_dVb - Idl * (dVdseff_dVb + T9 * dVa_dVb) / Va;

  T9 = diffVds / VASCBE;
  T0 = 1.0 + T9;
  const Ids = Idsa * T0;

  let Gm = T0 * dIdsa_dVg - Idsa * (dVdseff_dVg + T9 * dVASCBE_dVg) / VASCBE;
  let Gds = T0 * dIdsa_dVd + Idsa * (1.0 - dVdseff_dVd - T9 * dVASCBE_dVd) / VASCBE;
  let Gmb = T0 * dIdsa_dVb - Idsa * (dVdseff_dVb + T9 * dVASCBE_dVb) / VASCBE;

  Gds += Gm * dVgsteff_dVd;
  Gmb += Gm * dVgsteff_dVb;
  Gm *= dVgsteff_dVg;
  Gmb *= dVbseff_dVb;

  // Substrate current
  const alpha = p.alpha0 + p.alpha1 * Leff;
  let Isub: number, Gbd: number, Gbb: number, Gbg: number;
  if (alpha <= 0.0 || p.beta0 <= 0.0) {
    Isub = Gbd = Gbb = Gbg = 0.0;
  } else {
    T2 = alpha / Leff;
    if (diffVds > p.beta0 / EXP_THRESHOLD) {
      T0 = -p.beta0 / diffVds;
      T1 = T2 * diffVds * Math.exp(T0);
      T3 = T1 / diffVds * (T0 - 1.0);
      dT1_dVg = T3 * dVdseff_dVg;
      dT1_dVd = T3 * (dVdseff_dVd - 1.0);
      dT1_dVb = T3 * dVdseff_dVb;
    } else {
      T3 = T2 * MIN_EXP;
      T1 = T3 * diffVds;
      dT1_dVg = -T3 * dVdseff_dVg;
      dT1_dVd = T3 * (1.0 - dVdseff_dVd);
      dT1_dVb = -T3 * dVdseff_dVb;
    }
    Isub = T1 * Idsa;
    Gbg = T1 * dIdsa_dVg + Idsa * dT1_dVg;
    Gbd = T1 * dIdsa_dVd + Idsa * dT1_dVd;
    Gbb = T1 * dIdsa_dVb + Idsa * dT1_dVb;

    Gbd += Gbg * dVgsteff_dVd;
    Gbb += Gbg * dVgsteff_dVb;
    Gbg *= dVgsteff_dVg;
    Gbb *= dVbseff_dVb;
  }

  out.Ids = Ids;
  out.gm = Gm;
  out.gds = Gds;
  out.gmbs = Gmb;
  out.Isub = Isub;
  out.gbg = Gbg;
  out.gbd = Gbd;
  out.gbb = Gbb;
  return out;
}
