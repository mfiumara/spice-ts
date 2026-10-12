import {
  ClassicBsimMosfet, assertClassicBsimGeometry, resolveClassicBsimInstance,
} from './bsim12-load.js';
import type { ClassicBsimEvaluation, ClassicBsimInstance, ClassicBsimSetup } from './bsim12-load.js';
import { CONSTVT0 } from './bsim12-load.js';
import { InvalidCircuitError, UnsupportedModelParameterError } from '../errors.js';

/**
 * BSIM1 (MOSFET LEVEL=4), ported from ngspice-47 src/spicelib/devices/bsim1:
 * b1.c parameter table, b1set.c defaults, b1temp.c size-dependent parameters
 * and b1eval.c (B1evaluate) drain current, derivatives, charges and
 * capacitances. The load (b1ld.c) is shared with BSIM2 in bsim12-load.ts.
 */

/** Size-dependent BSIM1 parameters: card name of the base value, keyed by the instance field. Each has L<name> and W<name>. */
const SIZE_PARAMETERS = {
  vfb: 'VFB',
  phi: 'PHI',
  K1: 'K1',
  K2: 'K2',
  eta: 'ETA',
  etaB: 'X2E',
  etaD: 'X3E',
  betaZeroB: 'X2MZ',
  ugs: 'U0',
  ugsB: 'X2U0',
  uds: 'U1',
  udsB: 'X2U1',
  udsD: 'X3U1',
  betaVdd: 'MUS',
  betaVddB: 'X2MS',
  betaVddD: 'X3MS',
  subthSlope: 'N0',
  subthSlopeB: 'NB',
  subthSlopeD: 'ND',
} as const;

type SizeField = keyof typeof SIZE_PARAMETERS;

/** b1.c model parameters without L/W variants. KF and AF only enter .noise, which rejects BSIM1. */
const SCALAR_PARAMETERS = [
  'MUZ', 'DL', 'DW', 'TOX', 'TEMP', 'VDD', 'CGSO', 'CGDO', 'CGBO', 'XPART', 'RSH', 'JS', 'PB', 'MJ',
  'PBSW', 'MJSW', 'CJ', 'CJSW', 'WDF', 'DELL', 'KF', 'AF',
] as const;

export const BSIM1_MODEL_PARAMETERS: ReadonlySet<string> = new Set([
  'LEVEL',
  ...SCALAR_PARAMETERS,
  ...Object.values(SIZE_PARAMETERS).flatMap(name => [name, `L${name}`, `W${name}`]),
]);

/** Resolved BSIM1 model card (b1set.c defaults: every parameter 0 when not given). */
export interface BSIM1Model {
  name: string;
  polarity: number;
  params: Readonly<Record<string, number>>;
  /** b1temp.c Cox in F/cm^2. */
  cox: number;
  bulkJctPotential: number;
  sidewallJctPotential: number;
  /**
   * XPART flag. b1.c declares XPART as IF_FLAG, so INPgetValue (inpgval.c)
   * stores 1 without reading the value (b1mpar.c): any XPART= on the card,
   * including XPART=0, selects 0/100 partitioning; an absent XPART gives 40/60.
   */
  chargePartition: boolean;
}

export function resolveBSIM1Model(
  name: string,
  params: Readonly<Record<string, number | undefined>>,
  polarity: number,
): BSIM1Model {
  const values: Record<string, number> = {};
  for (const [key, value] of Object.entries(params)) {
    const upper = key.toUpperCase();
    if (!BSIM1_MODEL_PARAMETERS.has(upper)) {
      throw new UnsupportedModelParameterError(
        '', key, 'not a BSIM1 (b1par.c) model parameter', { modelName: name, model: 'BSIM1' },
      );
    }
    if (value !== undefined) values[upper] = value;
  }
  const get = (key: string) => values[key] ?? 0;
  const tox = get('TOX');
  if (!(tox > 0)) {
    // b1set.c defaults TOX to 0, which makes Cox infinite in b1temp.c.
    throw new InvalidCircuitError(`BSIM1 model '${name}': TOX must be positive (got ${tox})`);
  }
  return {
    name,
    polarity,
    params: values,
    cox: 3.453e-13 / (tox * 1e-4),
    // b1temp.c limits PB and PBSW to at least 0.1 V.
    bulkJctPotential: Math.max(get('PB'), 0.1),
    sidewallJctPotential: Math.max(get('PBSW'), 0.1),
    chargePartition: 'XPART' in values,
  };
}

/** b1temp.c per-instance parameters. */
interface BSIM1Size extends Record<SizeField, number> {
  betaZero: number;
  vt0: number;
}

function bsim1Size(model: BSIM1Model, instance: ClassicBsimInstance): BSIM1Size {
  const p = model.params;
  const get = (key: string) => p[key] ?? 0;
  const leff = (instance.L - get('DL') * 1e-6) * 1e6;
  const weff = (instance.W - get('DW') * 1e-6) * 1e6;
  const coxWoverL = model.cox * weff / leff;
  const size = {} as BSIM1Size;
  for (const [field, card] of Object.entries(SIZE_PARAMETERS) as [SizeField, string][]) {
    size[field] = get(card) + get(`L${card}`) / leff + get(`W${card}`) / weff;
  }
  size.betaZero = get('MUZ');
  if (size.phi < 0.1) size.phi = 0.1;
  if (size.K1 < 0) size.K1 = 0;
  if (size.K2 < 0) size.K2 = 0;
  size.vt0 = size.vfb + size.phi + size.K1 * Math.sqrt(size.phi) - size.K2 * size.phi;
  size.betaZero *= coxWoverL;
  size.betaZeroB *= coxWoverL;
  size.betaVdd *= coxWoverL;
  size.betaVddB *= coxWoverL;
  size.betaVddD = Math.max(size.betaVddD * coxWoverL, 0);
  return size;
}

/** b1eval.c B1evaluate. */
function bsim1Evaluate(
  model: BSIM1Model,
  here: BSIM1Size,
  instance: ClassicBsimInstance,
  vds: number,
  vbs: number,
  vgs: number,
  chargeComputationNeeded: boolean,
  out: ClassicBsimEvaluation,
): void {
  const deltaL = model.params.DL ?? 0;
  const deltaW = model.params.DW ?? 0;
  let gm: number;
  let gds: number;
  let gmbs: number;
  let qg = 0;
  let qb = 0;
  let qd = 0;
  let cggb = 0;
  let cgdb = 0;
  let cgsb = 0;
  let cbgb = 0;
  let cbdb = 0;
  let cbsb = 0;
  let cdgb = 0;
  let cddb = 0;
  let cdsb = 0;
  let VdsSat = 0;
  let DrainCurrent: number;

  const Vfb = here.vfb;
  let Phi = here.phi;
  const K1 = here.K1;
  const K2 = here.K2;
  const Vdd = model.params.VDD ?? 0;
  let Ugs = here.ugs + here.ugsB * vbs;
  let dUgsdVbs: number;
  if (Ugs <= 0) {
    Ugs = 0;
    dUgsdVbs = 0;
  } else {
    dUgsdVbs = here.ugsB;
  }
  let Uds = here.uds + here.udsB * vbs + here.udsD * (vds - Vdd);
  let dUdsdVbs: number;
  let dUdsdVds: number;
  if (Uds <= 0) {
    Uds = 0;
    dUdsdVbs = 0;
    dUdsdVds = 0;
  } else {
    const Leff = instance.L * 1e6 - deltaL; // um
    Uds = Uds / Leff;
    dUdsdVbs = here.udsB / Leff;
    dUdsdVds = here.udsD / Leff;
  }
  let Eta = here.eta + here.etaB * vbs + here.etaD * (vds - Vdd);
  let dEtadVds: number;
  let dEtadVbs: number;
  if (Eta <= 0) {
    Eta = 0;
    dEtadVds = 0;
    dEtadVbs = 0;
  } else if (Eta > 1) {
    Eta = 1;
    dEtadVds = 0;
    dEtadVbs = 0;
  } else {
    dEtadVds = here.etaD;
    dEtadVbs = here.etaB;
  }
  const Vpb = vbs < 0 ? Phi - vbs : Phi;
  const SqrtVpb = Math.sqrt(Vpb);
  const Von = Vfb + Phi + K1 * SqrtVpb - K2 * Vpb - Eta * vds;
  const Vth = Von;
  const dVthdVds = -Eta - dEtadVds * vds;
  let dVthdVbs = K2 - 0.5 * K1 / SqrtVpb - dEtadVbs * vds;
  let Vgs_Vth = vgs - Vth;

  const G = 1 - 1 / (1.744 + 0.8364 * Vpb);
  const A = Math.max(1 + 0.5 * G * K1 / SqrtVpb, 1.0);
  const Arg = Math.max(1 + Ugs * Vgs_Vth, 1.0);
  const dGdVbs = -0.8364 * (1 - G) * (1 - G);
  let dAdVbs = 0.25 * K1 / SqrtVpb * (2 * dGdVbs + G / Vpb);

  if (Vgs_Vth < 0) {
    DrainCurrent = 0;
    gm = 0;
    gds = 0;
    gmbs = 0;
  } else {
    const Beta_Vds_0 = here.betaZero + here.betaZeroB * vbs;
    const BetaVdd = here.betaVdd + here.betaVddB * vbs;
    const dBetaVdd_dVds = Math.max(here.betaVddD, 0.0);
    let Beta0: number;
    let dBeta0dVds: number;
    let dBeta0dVbs: number;
    if (vds > Vdd) {
      Beta0 = BetaVdd + dBetaVdd_dVds * (vds - Vdd);
      dBeta0dVds = dBetaVdd_dVds;
      dBeta0dVbs = here.betaVddB;
    } else {
      const VddSquare = Vdd * Vdd;
      const C1 = (-BetaVdd + Beta_Vds_0 + dBetaVdd_dVds * Vdd) / VddSquare;
      const C2 = 2 * (BetaVdd - Beta_Vds_0) / Vdd - dBetaVdd_dVds;
      const dBeta_Vds_0_dVbs = here.betaZeroB;
      const dBetaVdd_dVbs = here.betaVddB;
      const dC1dVbs = (dBeta_Vds_0_dVbs - dBetaVdd_dVbs) / VddSquare;
      const dC2dVbs = dC1dVbs * (-2) * Vdd;
      Beta0 = (C1 * vds + C2) * vds + Beta_Vds_0;
      dBeta0dVds = 2 * C1 * vds + C2;
      dBeta0dVbs = dC1dVbs * vds * vds + dC2dVbs * vds + dBeta_Vds_0_dVbs;
    }

    const Beta = Beta0 / Arg;
    const dBetadVgs = -Beta * Ugs / Arg;
    const dBetadVds = dBeta0dVds / Arg - dBetadVgs * dVthdVds;
    const dBetadVbs = dBeta0dVbs / Arg + Beta * Ugs * dVthdVbs / Arg - Beta * Vgs_Vth * dUgsdVbs / Arg;

    let Vc = Uds * Vgs_Vth / A;
    if (Vc < 0) Vc = 0;
    const Term1 = Math.sqrt(1 + 2 * Vc);
    const K = 0.5 * (1 + Vc + Term1);
    VdsSat = Math.max(Vgs_Vth / (A * Math.sqrt(K)), 0.0);

    if (vds < VdsSat) {
      // Triode region
      const Argl1 = Math.max(1 + Uds * vds, 1);
      const Argl2 = Vgs_Vth - 0.5 * A * vds;
      DrainCurrent = Beta * Argl2 * vds / Argl1;
      gm = (dBetadVgs * Argl2 * vds + Beta * vds) / Argl1;
      gds = (dBetadVds * Argl2 * vds + Beta * (Vgs_Vth - vds * dVthdVds - A * vds)
        - DrainCurrent * (vds * dUdsdVds + Uds)) / Argl1;
      gmbs = (dBetadVbs * Argl2 * vds + Beta * vds * (-dVthdVbs - 0.5 * vds * dAdVbs)
        - DrainCurrent * vds * dUdsdVbs) / Argl1;
    } else {
      // Pinchoff (saturation) region
      const Args1 = 1 + 1 / Term1;
      const dVcdVgs = Uds / A;
      const dVcdVds = Vgs_Vth * dUdsdVds / A - dVcdVgs * dVthdVds;
      const dVcdVbs = (Vgs_Vth * dUdsdVbs - Uds * (dVthdVbs + Vgs_Vth * dAdVbs / A)) / A;
      const dKdVc = 0.5 * Args1;
      const dKdVgs = dKdVc * dVcdVgs;
      const dKdVds = dKdVc * dVcdVds;
      const dKdVbs = dKdVc * dVcdVbs;
      const Args2 = Vgs_Vth / A / K;
      const Args3 = Args2 * Vgs_Vth;
      DrainCurrent = 0.5 * Beta * Args3;
      gm = 0.5 * Args3 * dBetadVgs + Beta * Args2 - DrainCurrent * dKdVgs / K;
      gds = 0.5 * Args3 * dBetadVds - Beta * Args2 * dVthdVds - DrainCurrent * dKdVds / K;
      gmbs = 0.5 * dBetadVbs * Args3 - Beta * Args2 * dVthdVbs - DrainCurrent * (dAdVbs / A + dKdVbs / K);
    }
  }

  // SubthresholdComputation
  const N0 = here.subthSlope;
  if (N0 < 200) {
    const NB = here.subthSlopeB;
    const ND = here.subthSlopeD;
    let N = N0 + NB * vbs + ND * vds;
    if (N < 0.5) N = 0.5;
    const Warg1 = Math.exp(-vds / CONSTVT0);
    const Wds = 1 - Warg1;
    const Wgs = Math.exp(Vgs_Vth / (N * CONSTVT0));
    const Vtsquare = CONSTVT0 * CONSTVT0;
    const Warg2 = 6.04965 * Vtsquare * here.betaZero;
    const Ilimit = 4.5 * Vtsquare * here.betaZero;
    const Iexp = Warg2 * Wgs * Wds;
    DrainCurrent = DrainCurrent + Ilimit * Iexp / (Ilimit + Iexp);
    let Temp1 = Ilimit / (Ilimit + Iexp);
    Temp1 = Temp1 * Temp1;
    let Temp3 = Ilimit / (Ilimit + Wgs * Warg2);
    Temp3 = Temp3 * Temp3 * Warg2 * Wgs;
    gm = gm + Temp1 * Iexp / (N * CONSTVT0);
    gds = gds + Temp3 * (-Wds / N / CONSTVT0 * (dVthdVds + Vgs_Vth * ND / N) + Warg1 / CONSTVT0);
    gmbs = gmbs - Temp1 * Iexp * (dVthdVbs + Vgs_Vth * NB / N) / (N * CONSTVT0);
  }

  // ChargeComputation: some limiting of DC parameters
  if (DrainCurrent < 0) DrainCurrent = 0;
  if (gm < 0) gm = 0;
  if (gds < 0) gds = 0;
  if (gmbs < 0) gmbs = 0;

  const WLCox = model.cox * (instance.L - deltaL * 1e-6) * (instance.W - deltaW * 1e-6) * 1e4;

  if (chargeComputationNeeded) {
    // b1eval.c recomputes G, A and Phi here; they equal the values above.
    Phi = Math.max(0.1, Phi);

    const Vth0 = Vfb + Phi + K1 * SqrtVpb;
    Vgs_Vth = vgs - Vth0;
    const Arg1 = A * vds;
    const Arg2 = Vgs_Vth - 0.5 * Arg1;
    const Arg3 = vds - Arg1;
    const Arg5 = Arg1 * Arg1;
    dVthdVbs = -0.5 * K1 / SqrtVpb;
    dAdVbs = 0.5 * K1 * (0.5 * G / Vpb - 0.8364 * (1 - G) * (1 - G)) / SqrtVpb;
    const Ent = Math.max(Arg2, 1.0e-8);
    const dEntdVds = -0.5 * A;
    const dEntdVbs = -dVthdVbs - 0.5 * vds * dAdVbs;
    const Vcom = Vgs_Vth * Vgs_Vth / 6.0 - 1.25e-1 * Arg1 * Vgs_Vth + 2.5e-2 * Arg5;
    const VdsPinchoff = Math.max(Vgs_Vth / A, 0.0);
    const Vgb = vgs - vbs;
    const Vgb_Vfb = Vgb - Vfb;

    if (Vgb_Vfb < 0) {
      // Accumulation region
      qg = WLCox * Vgb_Vfb;
      qb = -qg;
      qd = 0;
      cggb = WLCox;
      cgdb = 0; cgsb = 0;
      cbgb = -WLCox;
      cbdb = 0; cbsb = 0;
      cdgb = 0; cddb = 0; cdsb = 0;
    } else if (vgs < Vth0) {
      // Subthreshold region
      qg = 0.5 * WLCox * K1 * K1 * (-1 + Math.sqrt(1 + 4 * Vgb_Vfb / (K1 * K1)));
      qb = -qg;
      qd = 0;
      cggb = WLCox / Math.sqrt(1 + 4 * Vgb_Vfb / (K1 * K1));
      cgdb = 0; cgsb = 0;
      cbgb = -cggb;
      cbdb = 0; cbsb = 0; cdgb = 0; cddb = 0; cdsb = 0;
    } else if (vds < VdsPinchoff) {
      // Triode region
      const EntSquare = Ent * Ent;
      const Argl1 = 1.2e1 * EntSquare;
      const Argl2 = 1.0 - A;
      const Argl3 = Arg1 * vds;
      let Argl5: number;
      let Argl6: number;
      if (Ent > 1.0e-8) {
        Argl5 = Arg1 / Ent;
        Argl6 = Vcom / EntSquare;
      } else {
        Argl5 = 2.0;
        Argl6 = 4.0 / 1.5e1;
      }
      const Argl7 = Argl5 / 1.2e1;
      const Argl8 = 6.0 * Ent;
      qg = WLCox * (vgs - Vfb - Phi - 0.5 * vds + vds * Argl7);
      qb = WLCox * (-Vth0 + Vfb + Phi + 0.5 * Arg3 - Arg3 * Argl7);
      cggb = WLCox * (1.0 - Argl3 / Argl1);
      cgdb = WLCox * (-0.5 + Arg1 / Argl8 - Argl3 * dEntdVds / Argl1);
      const cgbb = WLCox * (vds * vds * dAdVbs * Ent - Argl3 * dEntdVbs) / Argl1;
      cgsb = -(cggb + cgdb + cgbb);
      cbgb = WLCox * Argl3 * Argl2 / Argl1;
      cbdb = WLCox * Argl2 * (0.5 - Arg1 / Argl8 + Argl3 * dEntdVds / Argl1);
      const cbbb = -WLCox * (dVthdVbs + 0.5 * vds * dAdVbs + vds * vds
        * ((1.0 - 2.0 * A) * dAdVbs * Ent - Argl2 * A * dEntdVbs) / Argl1);
      cbsb = -(cbgb + cbdb + cbbb);
      if (model.chargePartition) {
        // 0/100 drain/source partitioning
        const Argl9 = 0.125 * Argl5 * Argl5;
        qd = -WLCox * (0.5 * Vgs_Vth - 0.75 * Arg1 + 0.125 * Arg1 * Argl5);
        cdgb = -WLCox * (0.5 - Argl9);
        cddb = WLCox * (0.75 * A - 0.25 * A * Arg1 / Ent + Argl9 * dEntdVds);
        const cdbb = WLCox * (0.5 * dVthdVbs + vds * dAdVbs * (0.75 - 0.25 * Argl5) + Argl9 * dEntdVbs);
        cdsb = -(cdgb + cddb + cdbb);
      } else {
        // 40/60 drain/source partitioning
        const Vgs_VthSquare = Vgs_Vth * Vgs_Vth;
        const Argl4 = Vcom / Ent / EntSquare;
        qd = -WLCox * (0.5 * (Vgs_Vth - Arg1) + Arg1 * Argl6);
        cdgb = -WLCox * (0.5 + Arg1 * (4.0 * Vgs_Vth - 1.5 * Arg1) / Argl1 - 2.0 * Arg1 * Argl4);
        cddb = WLCox * (0.5 * A + 2.0 * Arg1 * dEntdVds * Argl4
          - A * (2.0 * Vgs_VthSquare - 3.0 * Arg1 * Vgs_Vth + 0.9 * Arg5) / Argl1);
        const cdbb = WLCox * (0.5 * dVthdVbs + 0.5 * vds * dAdVbs + 2.0 * Arg1 * dEntdVbs * Argl4
          - vds * (2.0 * Vgs_VthSquare * dAdVbs - 4.0 * A * Vgs_Vth * dVthdVbs - 3.0 * Arg1 * Vgs_Vth * dAdVbs
            + 1.5 * A * Arg1 * dVthdVbs + 0.9 * Arg5 * dAdVbs) / Argl1);
        cdsb = -(cdgb + cddb + cdbb);
      }
    } else if (vds >= VdsPinchoff) {
      // Saturation region
      const Args1 = 1.0 / (3.0 * A);
      qg = WLCox * (vgs - Vfb - Phi - Vgs_Vth * Args1);
      qb = WLCox * (Vfb + Phi - Vth0 + (1.0 - A) * Vgs_Vth * Args1);
      cggb = WLCox * (1.0 - Args1);
      cgdb = 0;
      const cgbb = WLCox * Args1 * (dVthdVbs + Vgs_Vth * dAdVbs / A);
      cgsb = -(cggb + cgdb + cgbb);
      cbgb = WLCox * (Args1 - 1.0 / 3.0);
      cbdb = 0;
      const cbbb = -WLCox * ((2.0 / 3.0 + Args1) * dVthdVbs + Vgs_Vth * Args1 * dAdVbs / A);
      cbsb = -(cbgb + cbdb + cbbb);
      if (model.chargePartition) {
        qd = 0;
        cdgb = 0; cddb = 0; cdsb = 0;
      } else {
        const co4v15 = 4 / 15;
        qd = -co4v15 * WLCox * Vgs_Vth;
        cdgb = -co4v15 * WLCox;
        cddb = 0;
        const cdbb = co4v15 * WLCox * dVthdVbs;
        cdsb = -(cdgb + cddb + cdbb);
      }
    }
  }

  out.gm = Math.max(gm, 0);
  out.gds = Math.max(gds, 0);
  out.gmbs = Math.max(gmbs, 0);
  out.qg = qg;
  out.qb = qb;
  out.qd = qd;
  out.cggb = cggb;
  out.cgdb = cgdb;
  out.cgsb = cgsb;
  out.cbgb = cbgb;
  out.cbdb = cbdb;
  out.cbsb = cbsb;
  out.cdgb = cdgb;
  out.cddb = cddb;
  out.cdsb = cdsb;
  out.cdrain = Math.max(DrainCurrent, 0);
  out.von = Von;
  out.vdsat = VdsSat;
}

/** Build a BSIM1 device on [drain', gate, source', bulk] for a resolved model card. */
export function createBSIM1(
  deviceName: string,
  nodes: number[],
  model: BSIM1Model,
  instanceParams: Readonly<Record<string, number | undefined>> | undefined,
): ClassicBsimMosfet {
  const instance = resolveClassicBsimInstance('BSIM1', deviceName, instanceParams);
  return new ClassicBsimMosfet(deviceName, nodes, bsim1Setup(deviceName, model, instance), instance);
}

export function bsim1Setup(deviceName: string, model: BSIM1Model, instance: ClassicBsimInstance): ClassicBsimSetup {
  const p = model.params;
  const get = (key: string) => p[key] ?? 0;
  assertClassicBsimGeometry('B1', deviceName, model.name, instance, get('DL'), get('DW'));
  const size = bsim1Size(model, instance);
  const effectiveWidth = instance.W - get('DW') * 1e-6;
  return {
    kind: 'BSIM1',
    polarity: model.polarity,
    vt0: size.vt0,
    deltaL: get('DL'),
    jctSatCurDensity: get('JS'),
    unitAreaJctCap: get('CJ'),
    unitLengthSidewallJctCap: get('CJSW'),
    bulkJctPotential: model.bulkJctPotential,
    sidewallJctPotential: model.sidewallJctPotential,
    bulkJctBotGradingCoeff: get('MJ'),
    bulkJctSideGradingCoeff: get('MJSW'),
    cgso: get('CGSO'),
    cgdo: get('CGDO'),
    cgbo: get('CGBO'),
    // b1temp.c: B1GDoverlapCap/B1GSoverlapCap use the effective width, B1GBoverlapCap the drawn length.
    acOverlap: {
      gd: effectiveWidth * get('CGDO'),
      gs: effectiveWidth * get('CGSO'),
      gb: instance.L * get('CGBO'),
    },
    evaluate: (vds, vbs, vgs, chargeNeeded, out) =>
      bsim1Evaluate(model, size, instance, vds, vbs, vgs, chargeNeeded, out),
  };
}
