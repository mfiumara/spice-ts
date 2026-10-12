import {
  ClassicBsimMosfet, assertClassicBsimGeometry, resolveClassicBsimInstance,
} from './bsim12-load.js';
import type { ClassicBsimEvaluation, ClassicBsimInstance, ClassicBsimSetup } from './bsim12-load.js';
import { InvalidCircuitError, UnsupportedModelParameterError } from '../errors.js';

/**
 * BSIM2 (MOSFET LEVEL=5), ported from ngspice-47 src/spicelib/devices/bsim2:
 * b2.c parameter table, b2set.c defaults, b2temp.c size-dependent parameters
 * and b2eval.c (B2evaluate) drain current, derivatives, charges and
 * capacitances. The load (b2ld.c, identical to b1ld.c) is shared with BSIM1
 * in bsim12-load.ts.
 */

/** Size-dependent BSIM2 parameters: [card name, b2set.c default]. Each has L<name> and W<name> (default 0). */
const SIZE_PARAMETERS = {
  vfb: ['VFB', -1.0],
  phi: ['PHI', 0.75],
  k1: ['K1', 0.8],
  k2: ['K2', 0.0],
  eta0: ['ETA0', 0.0],
  etaB: ['ETAB', 0.0],
  beta0B: ['MU0B', 0.0],
  betas0: ['MUS0', 500.0],
  betasB: ['MUSB', 0.0],
  beta20: ['MU20', 1.5],
  beta2B: ['MU2B', 0.0],
  beta2G: ['MU2G', 0.0],
  beta30: ['MU30', 10],
  beta3B: ['MU3B', 0.0],
  beta3G: ['MU3G', 0.0],
  beta40: ['MU40', 0.0],
  beta4B: ['MU4B', 0.0],
  beta4G: ['MU4G', 0.0],
  ua0: ['UA0', 0.2],
  uaB: ['UAB', 0.0],
  ub0: ['UB0', 0.0],
  ubB: ['UBB', 0.0],
  u10: ['U10', 0.1],
  u1B: ['U1B', 0.0],
  u1D: ['U1D', 0.0],
  n0: ['N0', 1.4],
  nB: ['NB', 0.5],
  nD: ['ND', 0.0],
  vof0: ['VOF0', 1.8],
  vofB: ['VOFB', 0.0],
  vofD: ['VOFD', 0.0],
  ai0: ['AI0', 0.0],
  aiB: ['AIB', 0.0],
  bi0: ['BI0', 0.0],
  biB: ['BIB', 0.0],
  vghigh: ['VGHIGH', 0.2],
  vglow: ['VGLOW', -0.15],
} as const;

type SizeField = keyof typeof SIZE_PARAMETERS;

/** b2set.c defaults of the parameters without L/W variants. KF and AF only enter .noise, which rejects BSIM2. */
const SCALAR_DEFAULTS: Readonly<Record<string, number>> = {
  MU0: 400.0,
  DL: 0, DW: 0,
  TOX: 0.03,
  TEMP: 27.0,
  VDD: 5.0, VGG: 5.0, VBB: 5.0,
  CGSO: 0, CGDO: 0, CGBO: 0,
  XPART: 0,
  RSH: 0, JS: 0, PB: 0, MJ: 0, PBSW: 0, MJSW: 0, CJ: 0, CJSW: 0,
  WDF: 10.0, DELL: 0,
  KF: 0, AF: 1,
};

export const BSIM2_MODEL_PARAMETERS: ReadonlySet<string> = new Set([
  'LEVEL',
  ...Object.keys(SCALAR_DEFAULTS),
  ...Object.values(SIZE_PARAMETERS).flatMap(([name]) => [name, `L${name}`, `W${name}`]),
]);

/** Resolved BSIM2 model card after b2set.c defaulting and the model part of b2temp.c. */
export interface BSIM2Model {
  name: string;
  polarity: number;
  /** Every b2.c model parameter, defaulted. */
  params: Readonly<Record<string, number>>;
  cox: number;
  vdd2: number;
  vgg2: number;
  vbb2: number;
  /** b2temp.c thermal voltage from the model TEMP. */
  Vtm: number;
  bulkJctPotential: number;
  sidewallJctPotential: number;
}

export function resolveBSIM2Model(
  name: string,
  params: Readonly<Record<string, number | undefined>>,
  polarity: number,
): BSIM2Model {
  const values: Record<string, number> = { ...SCALAR_DEFAULTS };
  for (const [name0, defaultValue] of Object.values(SIZE_PARAMETERS)) {
    values[name0] = defaultValue;
    values[`L${name0}`] = 0;
    values[`W${name0}`] = 0;
  }
  for (const [key, value] of Object.entries(params)) {
    const upper = key.toUpperCase();
    if (!BSIM2_MODEL_PARAMETERS.has(upper)) {
      throw new UnsupportedModelParameterError(
        '', key, 'not a BSIM2 (b2par.c) model parameter', { modelName: name, model: 'BSIM2' },
      );
    }
    if (value !== undefined) values[upper] = value;
  }
  if (!(values.TOX > 0)) {
    throw new InvalidCircuitError(`BSIM2 model '${name}': TOX must be positive (got ${values.TOX})`);
  }
  return {
    name,
    polarity,
    params: values,
    cox: 3.453e-13 / (values.TOX * 1.0e-4),
    vdd2: 2.0 * values.VDD,
    vgg2: 2.0 * values.VGG,
    vbb2: 2.0 * values.VBB,
    Vtm: 8.625e-5 * (values.TEMP + 273.0),
    bulkJctPotential: Math.max(values.PB, 0.1),
    sidewallJctPotential: Math.max(values.PBSW, 0.1),
  };
}

/** b2temp.c bsim2SizeDependParam. */
interface BSIM2Size extends Record<SizeField, number> {
  beta0: number;
  CoxWL: number;
  One_Third_CoxWL: number;
  Two_Third_CoxWL: number;
  SqrtPhi: number;
  Phis3: number;
  Arg: number;
  vt0: number;
}

function bsim2Size(model: BSIM2Model, instance: ClassicBsimInstance): BSIM2Size {
  const p = model.params;
  const effectiveLength = instance.L - p.DL * 1.0e-6;
  const effectiveWidth = instance.W - p.DW * 1.0e-6;
  const invL = 1.0e-6 / effectiveLength;
  const invW = 1.0e-6 / effectiveWidth;
  const s = {} as BSIM2Size;
  for (const [field, [card]] of Object.entries(SIZE_PARAMETERS) as [SizeField, readonly [string, number]][]) {
    s[field] = p[card] + p[`W${card}`] * invW + p[`L${card}`] * invL;
  }
  s.beta0 = p.MU0;
  if (s.betas0 < 1.01 * s.beta0) s.betas0 = 1.01 * s.beta0;
  const vbb = p.VBB;
  const tmp = s.betas0 - s.beta0 - s.beta0B * vbb;
  if (-s.betasB * vbb > tmp) s.betasB = -tmp / vbb;

  const coxWoverL = model.cox * effectiveWidth / effectiveLength;
  s.beta0 *= coxWoverL;
  s.beta0B *= coxWoverL;
  s.betas0 *= coxWoverL;
  s.betasB *= coxWoverL;
  s.beta30 *= coxWoverL;
  s.beta3B *= coxWoverL;
  s.beta3G *= coxWoverL;
  s.beta40 *= coxWoverL;
  s.beta4B *= coxWoverL;
  s.beta4G *= coxWoverL;
  if (s.n0 < 0) s.n0 = 0;

  s.CoxWL = model.cox * effectiveLength * effectiveWidth * 1.0e4;
  s.One_Third_CoxWL = s.CoxWL / 3.0;
  s.Two_Third_CoxWL = 2.0 * s.One_Third_CoxWL;
  s.SqrtPhi = Math.sqrt(s.phi);
  s.Phis3 = s.SqrtPhi * s.phi;
  s.Arg = s.betasB - s.beta0B - p.VDD * (s.beta3B - p.VDD * s.beta4B);
  s.vt0 = s.vfb + s.phi + s.k1 * s.SqrtPhi - s.k2 * s.phi;
  return s;
}

/** b2eval.c B2evaluate. */
function bsim2Evaluate(
  model: BSIM2Model,
  pp: BSIM2Size,
  VdsIn: number,
  VbsIn: number,
  VgsIn: number,
  chargeComputationNeeded: boolean,
  out: ClassicBsimEvaluation,
): void {
  const Vtm = model.Vtm;
  const vdd = model.params.VDD;
  let Vds = VdsIn;
  let Vbs = VbsIn;
  let Vgs = VgsIn;
  let Vdsat = 0;
  let dVdsat_dVd = 0;
  let dVdsat_dVg = 0;
  let dVdsat_dVb = 0;
  let Exp0 = 0;
  let Exp1 = 0;
  let n = 0;
  let Ids: number;
  let gm: number;
  let gds: number;
  let gmb: number;

  if (Vbs < model.vbb2) Vbs = model.vbb2;
  if (Vgs > model.vgg2) Vgs = model.vgg2;
  if (Vds > model.vdd2) Vds = model.vdd2;

  // Threshold voltage.
  let Phisb: number;
  let dPhisb_dVb: number;
  let T1s: number;
  let dT1s_dVb: number;
  if (Vbs <= 0.0) {
    Phisb = pp.phi - Vbs;
    dPhisb_dVb = -1.0;
    T1s = Math.sqrt(Phisb);
    dT1s_dVb = -0.5 / T1s;
  } else {
    const tmp = pp.phi / (pp.phi + Vbs);
    Phisb = pp.phi * tmp;
    dPhisb_dVb = -tmp * tmp;
    T1s = pp.Phis3 / (pp.phi + 0.5 * Vbs);
    dT1s_dVb = -0.5 * T1s * T1s / pp.Phis3;
  }

  const Eta = pp.eta0 + pp.etaB * Vbs;
  const Ua = pp.ua0 + pp.uaB * Vbs;
  const Ub = pp.ub0 + pp.ubB * Vbs;
  const U1s = pp.u10 + pp.u1B * Vbs;

  const Vth = pp.vfb + pp.phi + pp.k1 * T1s - pp.k2 * Phisb - Eta * Vds;
  const dVth_dVd = -Eta;
  const dVth_dVb = pp.k1 * dT1s_dVb + pp.k2 - pp.etaB * Vds;

  const Vgst = Vgs - Vth;

  let tmp = 1.0 / (1.744 + 0.8364 * Phisb);
  const Gg = 1.0 - tmp;
  const dGg_dVb = 0.8364 * tmp * tmp * dPhisb_dVb;
  let T0 = Gg / T1s;
  let tmp1 = 0.5 * T0 * pp.k1;
  const Aa = 1.0 + tmp1;
  const dAa_dVb = (Aa - 1.0) * (dGg_dVb / Gg - dT1s_dVb / T1s);
  const Inv_Aa = 1.0 / Aa;

  const Vghigh = pp.vghigh;
  const Vglow = pp.vglow;

  let Vgeff: number;
  let dVgeff_dVg: number;
  let dVgeff_dVd: number;
  let dVgeff_dVb: number;
  if (Vgst >= Vghigh || pp.n0 === 0.0) {
    Vgeff = Vgst;
    dVgeff_dVg = 1.0;
    dVgeff_dVd = -dVth_dVd;
    dVgeff_dVb = -dVth_dVb;
  } else {
    const Vof = pp.vof0 + pp.vofB * Vbs + pp.vofD * Vds;
    n = pp.n0 + pp.nB / T1s + pp.nD * Vds;
    tmp = 0.5 / (n * Vtm);

    let ExpArg1 = -Vds / Vtm;
    ExpArg1 = Math.max(ExpArg1, -30.0);
    Exp1 = Math.exp(ExpArg1);
    tmp1 = 1.0 - Exp1;
    tmp1 = Math.max(tmp1, 1.0e-18);
    const tmp2 = 2.0 * Aa * tmp1;

    if (Vgst <= Vglow) {
      let ExpArg = Vgst * tmp;
      ExpArg = Math.max(ExpArg, -30.0);
      Exp0 = Math.exp(0.5 * Vof + ExpArg);
      Vgeff = Math.sqrt(tmp2) * Vtm * Exp0;
      T0 = n * Vtm;
      dVgeff_dVg = Vgeff * tmp;
      dVgeff_dVd = dVgeff_dVg * (n / tmp1 * Exp1 - dVth_dVd - Vgst * pp.nD / n + T0 * pp.vofD);
      dVgeff_dVb = dVgeff_dVg * (pp.vofB * T0 - dVth_dVb + pp.nB * Vgst / (n * T1s * T1s) * dT1s_dVb
        + T0 * Inv_Aa * dAa_dVb);
    } else {
      let ExpArg = Vglow * tmp;
      ExpArg = Math.max(ExpArg, -30.0);
      Exp0 = Math.exp(0.5 * Vof + ExpArg);
      Vgeff = Math.sqrt(2.0 * Aa * (1.0 - Exp1)) * Vtm * Exp0;
      const Con1 = Vghigh;
      const Con3 = Vgeff;
      const Con4 = Con3 * tmp;
      const SqrVghigh = Vghigh * Vghigh;
      const SqrVglow = Vglow * Vglow;
      const CubVghigh = Vghigh * SqrVghigh;
      const CubVglow = Vglow * SqrVglow;
      T0 = 2.0 * Vghigh;
      const T1 = 2.0 * Vglow;
      const T2 = 3.0 * SqrVghigh;
      const T3 = 3.0 * SqrVglow;
      const T4 = Vghigh - Vglow;
      const T5 = SqrVghigh - SqrVglow;
      const T6 = CubVghigh - CubVglow;
      let T7 = Con1 - Con3;
      let delta = (T1 - T0) * T6 + (T2 - T3) * T5 + (T0 * T3 - T1 * T2) * T4;
      delta = 1.0 / delta;
      const Coeffb = (T1 - Con4 * T0) * T6 + (Con4 * T2 - T3) * T5 + (T0 * T3 - T1 * T2) * T7;
      const Coeffc = (Con4 - 1.0) * T6 + (T2 - T3) * T7 + (T3 - Con4 * T2) * T4;
      const Coeffd = (T1 - T0) * T7 + (1.0 - Con4) * T5 + (Con4 * T0 - T1) * T4;
      const Coeffa = SqrVghigh * (Coeffc + Coeffd * T0);
      Vgeff = (Coeffa + Vgst * (Coeffb + Vgst * (Coeffc + Vgst * Coeffd))) * delta;
      dVgeff_dVg = (Coeffb + Vgst * (2.0 * Coeffc + 3.0 * Vgst * Coeffd)) * delta;
      T7 = Con3 * tmp;
      const T8 = dT1s_dVb * pp.nB / (T1s * T1s * n);
      const T9 = n * Vtm;
      const dCon3_dVd = T7 * (n * Exp1 / tmp1 - Vglow * pp.nD / n + T9 * pp.vofD);
      const dCon3_dVb = T7 * (T9 * Inv_Aa * dAa_dVb + Vglow * T8 + T9 * pp.vofB);
      const dCon4_dVd = tmp * dCon3_dVd - T7 * pp.nD / n;
      const dCon4_dVb = tmp * dCon3_dVb + T7 * T8;

      const dCoeffb_dVd = dCon4_dVd * (T2 * T5 - T0 * T6) + dCon3_dVd * (T1 * T2 - T0 * T3);
      const dCoeffc_dVd = dCon4_dVd * (T6 - T2 * T4) + dCon3_dVd * (T3 - T2);
      const dCoeffd_dVd = dCon4_dVd * (T0 * T4 - T5) + dCon3_dVd * (T0 - T1);
      const dCoeffa_dVd = SqrVghigh * (dCoeffc_dVd + dCoeffd_dVd * T0);

      dVgeff_dVd = -dVgeff_dVg * dVth_dVd
        + (dCoeffa_dVd + Vgst * (dCoeffb_dVd + Vgst * (dCoeffc_dVd + Vgst * dCoeffd_dVd))) * delta;

      const dCoeffb_dVb = dCon4_dVb * (T2 * T5 - T0 * T6) + dCon3_dVb * (T1 * T2 - T0 * T3);
      const dCoeffc_dVb = dCon4_dVb * (T6 - T2 * T4) + dCon3_dVb * (T3 - T2);
      const dCoeffd_dVb = dCon4_dVb * (T0 * T4 - T5) + dCon3_dVb * (T0 - T1);
      const dCoeffa_dVb = SqrVghigh * (dCoeffc_dVb + dCoeffd_dVb * T0);

      dVgeff_dVb = -dVgeff_dVg * dVth_dVb
        + (dCoeffa_dVb + Vgst * (dCoeffb_dVb + Vgst * (dCoeffc_dVb + Vgst * dCoeffd_dVb))) * delta;
    }
  }

  let Uvert = 0;
  let Inv_Uvert = 0;
  let dUvert_dVg = 0;
  let dUvert_dVd = 0;
  let dUvert_dVb = 0;
  let Vc = 0;
  let dVc_dVg = 0;
  let dVc_dVd = 0;
  let dVc_dVb = 0;
  let Kk = 0;
  let Inv_Kk = 0;
  let dKk_dVc = 0;
  if (Vgeff > 0.0) {
    Uvert = 1.0 + Vgeff * (Ua + Vgeff * Ub);
    Uvert = Math.max(Uvert, 0.2);
    Inv_Uvert = 1.0 / Uvert;
    let T8 = Ua + 2.0 * Ub * Vgeff;
    dUvert_dVg = T8 * dVgeff_dVg;
    dUvert_dVd = T8 * dVgeff_dVd;
    dUvert_dVb = T8 * dVgeff_dVb + Vgeff * (pp.uaB + Vgeff * pp.ubB);

    T8 = U1s * Inv_Aa * Inv_Uvert;
    Vc = T8 * Vgeff;
    let T9 = Vc * Inv_Uvert;
    dVc_dVg = T8 * dVgeff_dVg - T9 * dUvert_dVg;
    dVc_dVd = T8 * dVgeff_dVd - T9 * dUvert_dVd;
    dVc_dVb = T8 * dVgeff_dVb + pp.u1B * Vgeff * Inv_Aa * Inv_Uvert - Vc * Inv_Aa * dAa_dVb - T9 * dUvert_dVb;

    const tmp2 = Math.sqrt(1.0 + 2.0 * Vc);
    Kk = 0.5 * (1.0 + Vc + tmp2);
    Inv_Kk = 1.0 / Kk;
    dKk_dVc = 0.5 + 0.5 / tmp2;
    const SqrtKk = Math.sqrt(Kk);

    T8 = Inv_Aa / SqrtKk;
    Vdsat = Vgeff * T8;
    Vdsat = Math.max(Vdsat, 1.0e-18);
    const Inv_Vdsat = 1.0 / Vdsat;
    T9 = 0.5 * Vdsat * Inv_Kk * dKk_dVc;
    dVdsat_dVd = T8 * dVgeff_dVd - T9 * dVc_dVd;
    dVdsat_dVg = T8 * dVgeff_dVg - T9 * dVc_dVg;
    dVdsat_dVb = T8 * dVgeff_dVb - T9 * dVc_dVb - Vdsat * Inv_Aa * dAa_dVb;

    const Beta0 = pp.beta0 + pp.beta0B * Vbs;
    const Betas = pp.betas0 + pp.betasB * Vbs;
    const Beta2 = pp.beta20 + pp.beta2B * Vbs + pp.beta2G * Vgs;
    const Beta3 = pp.beta30 + pp.beta3B * Vbs + pp.beta3G * Vgs;
    const Beta4 = pp.beta40 + pp.beta4B * Vbs + pp.beta4G * Vgs;
    const Beta1 = Betas - (Beta0 + vdd * (Beta3 - vdd * Beta4));

    T0 = Vds * Beta2 * Inv_Vdsat;
    T0 = Math.min(T0, 30.0);
    let T1 = Math.exp(T0);
    let T2 = T1 * T1;
    let T3 = T2 + 1.0;
    const tanh = (T2 - 1.0) / T3;
    const Sqrsech = 4.0 * T2 / (T3 * T3);

    const Beta = Beta0 + Beta1 * tanh + Vds * (Beta3 - Beta4 * Vds);
    let T4 = Beta1 * Sqrsech * Inv_Vdsat;
    let T5 = vdd * tanh;
    const dBeta_dVd = Beta3 - 2.0 * Beta4 * Vds + T4 * (Beta2 - T0 * dVdsat_dVd);
    const dBeta_dVg = T4 * (pp.beta2G * Vds - T0 * dVdsat_dVg) + pp.beta3G * (Vds - T5)
      - pp.beta4G * (Vds * Vds - vdd * T5);
    const dBeta1_dVb = pp.Arg;
    const dBeta_dVb = pp.beta0B + dBeta1_dVb * tanh + Vds * (pp.beta3B - Vds * pp.beta4B)
      + T4 * (pp.beta2B * Vds - T0 * dVdsat_dVb);

    if (Vgst > Vglow) {
      if (Vds <= Vdsat) {
        // Triode region
        T3 = Vds * Inv_Vdsat;
        T4 = T3 - 1.0;
        T2 = 1.0 - pp.u1D * T4 * T4;
        const U1 = U1s * T2;
        let Utot = Uvert + U1 * Vds;
        Utot = Math.max(Utot, 0.5);
        const Inv_Utot = 1.0 / Utot;
        T5 = 2.0 * U1s * pp.u1D * Inv_Vdsat * T4;
        const dU1_dVd = T5 * (T3 * dVdsat_dVd - 1.0);
        const dU1_dVg = T5 * T3 * dVdsat_dVg;
        const dU1_dVb = T5 * T3 * dVdsat_dVb + pp.u1B * T2;
        const dUtot_dVd = dUvert_dVd + U1 + Vds * dU1_dVd;
        const dUtot_dVg = dUvert_dVg + Vds * dU1_dVg;
        const dUtot_dVb = dUvert_dVb + Vds * dU1_dVb;

        tmp1 = Vgeff - 0.5 * Aa * Vds;
        const tmp3 = tmp1 * Vds;
        const Betaeff = Beta * Inv_Utot;
        Ids = Betaeff * tmp3;
        const T6 = Ids / Betaeff * Inv_Utot;
        gds = T6 * (dBeta_dVd - Betaeff * dUtot_dVd) + Betaeff * (tmp1 + (dVgeff_dVd - 0.5 * Aa) * Vds);
        gm = T6 * (dBeta_dVg - Betaeff * dUtot_dVg) + Betaeff * Vds * dVgeff_dVg;
        gmb = T6 * (dBeta_dVb - Betaeff * dUtot_dVb) + Betaeff * Vds * (dVgeff_dVb - 0.5 * Vds * dAa_dVb);
      } else {
        // Saturation
        tmp1 = Vgeff * Inv_Aa * Inv_Kk;
        const tmp3 = 0.5 * Vgeff * tmp1;
        const Betaeff = Beta * Inv_Uvert;
        Ids = Betaeff * tmp3;
        T0 = Ids / Betaeff * Inv_Uvert;
        T1 = Betaeff * Vgeff * Inv_Aa * Inv_Kk;
        T2 = Ids * Inv_Kk * dKk_dVc;

        if (pp.ai0 !== 0.0) {
          const Ai = pp.ai0 + pp.aiB * Vbs;
          const Bi = pp.bi0 + pp.biB * Vbs;
          T5 = Bi / (Vds - Vdsat);
          T5 = Math.min(T5, 30.0);
          const T6 = Math.exp(-T5);
          const FR = 1.0 + Ai * T6;
          const T7 = T5 / (Vds - Vdsat);
          const T8b = (1.0 - FR) * T7;
          const dFR_dVd = T8b * (dVdsat_dVd - 1.0);
          const dFR_dVg = T8b * dVdsat_dVg;
          const dFR_dVb = T8b * dVdsat_dVb + T6 * (pp.aiB - Ai * pp.biB / (Vds - Vdsat));

          gds = (T0 * (dBeta_dVd - Betaeff * dUvert_dVd) + T1 * dVgeff_dVd - T2 * dVc_dVd) * FR + Ids * dFR_dVd;
          gm = (T0 * (dBeta_dVg - Betaeff * dUvert_dVg) + T1 * dVgeff_dVg - T2 * dVc_dVg) * FR + Ids * dFR_dVg;
          gmb = (T0 * (dBeta_dVb - Betaeff * dUvert_dVb) + T1 * dVgeff_dVb - T2 * dVc_dVb
            - Ids * Inv_Aa * dAa_dVb) * FR + Ids * dFR_dVb;
          Ids *= FR;
        } else {
          gds = T0 * (dBeta_dVd - Betaeff * dUvert_dVd) + T1 * dVgeff_dVd - T2 * dVc_dVd;
          gm = T0 * (dBeta_dVg - Betaeff * dUvert_dVg) + T1 * dVgeff_dVg - T2 * dVc_dVg;
          gmb = T0 * (dBeta_dVb - Betaeff * dUvert_dVb) + T1 * dVgeff_dVb - T2 * dVc_dVb
            - Ids * Inv_Aa * dAa_dVb;
        }
      }
    } else {
      T0 = Exp0 * Exp0;
      T1 = Exp1;
      Ids = Beta * Vtm * Vtm * T0 * (1.0 - T1);
      T2 = Ids / Beta;
      T4 = n * Vtm;
      T3 = Ids / T4;
      let FR: number;
      let dFR_dVd: number;
      let dFR_dVg: number;
      let dFR_dVb: number;
      if (Vds > Vdsat && pp.ai0 !== 0.0) {
        const Ai = pp.ai0 + pp.aiB * Vbs;
        const Bi = pp.bi0 + pp.biB * Vbs;
        T5 = Bi / (Vds - Vdsat);
        T5 = Math.min(T5, 30.0);
        const T6 = Math.exp(-T5);
        FR = 1.0 + Ai * T6;
        const T7 = T5 / (Vds - Vdsat);
        const T8b = (1.0 - FR) * T7;
        dFR_dVd = T8b * (dVdsat_dVd - 1.0);
        dFR_dVg = T8b * dVdsat_dVg;
        dFR_dVb = T8b * dVdsat_dVb + T6 * (pp.aiB - Ai * pp.biB / (Vds - Vdsat));
      } else {
        FR = 1.0;
        dFR_dVd = 0.0;
        dFR_dVg = 0.0;
        dFR_dVb = 0.0;
      }

      gds = (T2 * dBeta_dVd + T3 * (pp.vofD * T4 - dVth_dVd - pp.nD * Vgst / n) + Beta * Vtm * T0 * T1) * FR
        + Ids * dFR_dVd;
      gm = (T2 * dBeta_dVg + T3) * FR + Ids * dFR_dVg;
      gmb = (T2 * dBeta_dVb + T3 * (pp.vofB * T4 - dVth_dVb + pp.nB * Vgst / (n * T1s * T1s) * dT1s_dVb)) * FR
        + Ids * dFR_dVb;
      Ids *= FR;
    }
  } else {
    Ids = 0.0;
    gm = 0.0;
    gds = 0.0;
    gmb = 0.0;
  }

  // Some limiting of DC parameters
  gds = Math.max(gds, 1.0e-20);

  let qg = 0;
  let qb = 0;
  let qd = 0;
  let cgg = 0;
  let cgd = 0;
  let cgs = 0;
  let cbg = 0;
  let cbd = 0;
  let cbs = 0;
  let cdg = 0;
  let cdd = 0;
  let cds = 0;
  // XPART is a 0/1 flag (b2mpar.c), so the charge block runs exactly when charges are needed.
  if (chargeComputationNeeded) {
    let Vbseff: number;
    let dVbseff_dVb: number;
    if (Vbs < 0.0) {
      Vbseff = Vbs;
      dVbseff_dVb = 1.0;
    } else {
      Vbseff = pp.phi - Phisb;
      dVbseff_dVb = -dPhisb_dVb;
    }
    const Arg1 = Vgs - Vbseff - pp.vfb;
    const Arg2 = Arg1 - Vgst;
    const Qbulk = pp.One_Third_CoxWL * Arg2;
    const dQbulk_dVb = pp.One_Third_CoxWL * (dVth_dVb - dVbseff_dVb);
    const dQbulk_dVd = pp.One_Third_CoxWL * dVth_dVd;
    if (Arg1 <= 0.0) {
      qg = pp.CoxWL * Arg1;
      qb = -qg;
      qd = 0.0;
      cgg = pp.CoxWL;
      cgd = 0.0;
      cgs = -cgg * (1.0 - dVbseff_dVb);
      cdg = 0.0;
      cdd = 0.0;
      cds = 0.0;
      cbg = -pp.CoxWL;
      cbd = 0.0;
      cbs = -cgs;
    } else if (Vgst <= 0.0) {
      const T2 = Arg1 / Arg2;
      const T3 = T2 * T2 * (pp.CoxWL - pp.Two_Third_CoxWL * T2);
      qg = pp.CoxWL * Arg1 * (1.0 - T2 * (1.0 - T2 / 3.0));
      qb = -qg;
      qd = 0.0;
      cgg = pp.CoxWL * (1.0 - T2 * (2.0 - T2));
      tmp = T3 * dVth_dVb - (cgg + T3) * dVbseff_dVb;
      cgd = T3 * dVth_dVd;
      cgs = -(cgg + cgd + tmp);
      cdg = 0.0;
      cdd = 0.0;
      cds = 0.0;
      cbg = -cgg;
      cbd = -cgd;
      cbs = -cgs;
    } else {
      if (Vgst < pp.vghigh) {
        Uvert = 1.0 + Vgst * (Ua + Vgst * Ub);
        Uvert = Math.max(Uvert, 0.2);
        Inv_Uvert = 1.0 / Uvert;
        dUvert_dVg = Ua + 2.0 * Ub * Vgst;
        dUvert_dVd = -dUvert_dVg * dVth_dVd;
        dUvert_dVb = -dUvert_dVg * dVth_dVb + Vgst * (pp.uaB + Vgst * pp.ubB);

        let T8 = U1s * Inv_Aa * Inv_Uvert;
        Vc = T8 * Vgst;
        let T9 = Vc * Inv_Uvert;
        dVc_dVg = T8 - T9 * dUvert_dVg;
        dVc_dVd = -T8 * dVth_dVd - T9 * dUvert_dVd;
        dVc_dVb = -T8 * dVth_dVb + pp.u1B * Vgst * Inv_Aa * Inv_Uvert - Vc * Inv_Aa * dAa_dVb - T9 * dUvert_dVb;

        const tmp2 = Math.sqrt(1.0 + 2.0 * Vc);
        Kk = 0.5 * (1.0 + Vc + tmp2);
        Inv_Kk = 1.0 / Kk;
        dKk_dVc = 0.5 + 0.5 / tmp2;
        const SqrtKk = Math.sqrt(Kk);

        T8 = Inv_Aa / SqrtKk;
        Vdsat = Vgst * T8;
        T9 = 0.5 * Vdsat * Inv_Kk * dKk_dVc;
        dVdsat_dVd = -T8 * dVth_dVd - T9 * dVc_dVd;
        dVdsat_dVg = T8 - T9 * dVc_dVg;
        dVdsat_dVb = -T8 * dVth_dVb - T9 * dVc_dVb - Vdsat * Inv_Aa * dAa_dVb;
      }
      if (Vds >= Vdsat) {
        // Saturation region
        cgg = pp.Two_Third_CoxWL;
        cgd = -cgg * dVth_dVd + dQbulk_dVd;
        tmp = -cgg * dVth_dVb + dQbulk_dVb;
        cgs = -(cgg + cgd + tmp);

        cbg = 0.0;
        cbd = -dQbulk_dVd;
        cbs = dQbulk_dVd + dQbulk_dVb;

        cdg = -0.4 * cgg;
        tmp = -cdg * dVth_dVb;
        cdd = -cdg * dVth_dVd;
        cds = -(cdg + cdd + tmp);

        qb = -Qbulk;
        qg = pp.Two_Third_CoxWL * Vgst + Qbulk;
        qd = cdg * Vgst;
      } else {
        // Linear region
        const T7 = Vds / Vdsat;
        const T8 = Vgst / Vdsat;
        const T6 = T7 * T8;
        const T9 = 1.0 - T7;
        const Vgdt = Vgst * T9;
        const T0b = Vgst / (Vgst + Vgdt);
        const T1b = Vgdt / (Vgst + Vgdt);
        const T5 = T0b * T1b;
        let T2 = 1.0 - T1b + T5;
        let T3 = 1.0 - T0b + T5;

        const dVgdt_dVg = T9 + T6 * dVdsat_dVg;
        const dVgdt_dVd = T6 * dVdsat_dVd - T8 - T9 * dVth_dVd;
        const dVgdt_dVb = T6 * dVdsat_dVb - T9 * dVth_dVb;

        qg = pp.Two_Third_CoxWL * (Vgst + Vgdt - Vgdt * T0b) + Qbulk;
        qb = -Qbulk;
        qd = -pp.One_Third_CoxWL * (0.2 * Vgdt + 0.8 * Vgst + Vgdt * T1b + 0.2 * T5 * (Vgdt - Vgst));

        cgg = pp.Two_Third_CoxWL * (T2 + T3 * dVgdt_dVg);
        tmp = dQbulk_dVb + pp.Two_Third_CoxWL * (T3 * dVgdt_dVb - T2 * dVth_dVb);
        cgd = pp.Two_Third_CoxWL * (T3 * dVgdt_dVd - T2 * dVth_dVd) + dQbulk_dVd;
        cgs = -(cgg + cgd + tmp);

        T2 = 0.8 - 0.4 * T1b * (2.0 * T1b + T0b + T0b * (T1b - T0b));
        T3 = 0.2 + T1b + T0b * (1.0 - 0.4 * T0b * (T1b + 3.0 * T0b));
        cdg = -pp.One_Third_CoxWL * (T2 + T3 * dVgdt_dVg);
        tmp = pp.One_Third_CoxWL * (T2 * dVth_dVb - T3 * dVgdt_dVb);
        cdd = pp.One_Third_CoxWL * (T2 * dVth_dVd - T3 * dVgdt_dVd);
        cds = -(cdg + tmp + cdd);

        cbg = 0.0;
        cbd = -dQbulk_dVd;
        cbs = dQbulk_dVd + dQbulk_dVb;
      }
    }
  }

  // finished: XPART 0 or 1 both clamp Ids at 1e-50.
  out.cdrain = Math.max(Ids, 1e-50);
  out.gm = gm;
  out.gds = gds;
  out.gmbs = gmb;
  out.qg = qg;
  out.qb = qb;
  out.qd = qd;
  out.cggb = cgg;
  out.cgdb = cgd;
  out.cgsb = cgs;
  out.cbgb = cbg;
  out.cbdb = cbd;
  out.cbsb = cbs;
  out.cdgb = cdg;
  out.cddb = cdd;
  out.cdsb = cds;
  out.von = Vth;
  out.vdsat = Vdsat;
}

/** Build a BSIM2 device on [drain', gate, source', bulk] for a resolved model card. */
export function createBSIM2(
  deviceName: string,
  nodes: number[],
  model: BSIM2Model,
  instanceParams: Readonly<Record<string, number | undefined>> | undefined,
): ClassicBsimMosfet {
  const instance = resolveClassicBsimInstance('BSIM2', deviceName, instanceParams);
  return new ClassicBsimMosfet(deviceName, nodes, bsim2Setup(deviceName, model, instance), instance);
}

export function bsim2Setup(deviceName: string, model: BSIM2Model, instance: ClassicBsimInstance): ClassicBsimSetup {
  const p = model.params;
  assertClassicBsimGeometry('B2', deviceName, model.name, instance, p.DL, p.DW);
  const size = bsim2Size(model, instance);
  const effectiveLength = instance.L - p.DL * 1e-6;
  const effectiveWidth = instance.W - p.DW * 1e-6;
  return {
    kind: 'BSIM2',
    polarity: model.polarity,
    vt0: size.vt0,
    deltaL: p.DL,
    jctSatCurDensity: p.JS,
    unitAreaJctCap: p.CJ,
    unitLengthSidewallJctCap: p.CJSW,
    bulkJctPotential: model.bulkJctPotential,
    sidewallJctPotential: model.sidewallJctPotential,
    bulkJctBotGradingCoeff: p.MJ,
    bulkJctSideGradingCoeff: p.MJSW,
    cgso: p.CGSO,
    cgdo: p.CGDO,
    cgbo: p.CGBO,
    // b2temp.c: every AC overlap uses the effective width or length.
    acOverlap: {
      gd: p.CGDO * effectiveWidth,
      gs: p.CGSO * effectiveWidth,
      gb: p.CGBO * effectiveLength,
    },
    evaluate: (vds, vbs, vgs, chargeNeeded, out) => bsim2Evaluate(model, size, vds, vbs, vgs, chargeNeeded, out),
  };
}
