import type { ModelParams } from '../types.js';

/**
 * Bounded ngspice MESA (Z-card, `NMF`) LEVEL=2 MESFET model.
 *
 * Mirrors ngspice-47 `mesatemp.c` and `mesa1()`/`MESAload()` in `mesaload.c`
 * at TEMP = TNOM = 27 C. Parameters that only matter at other temperatures,
 * need extra internal nodes (RG/RI/RF), belong to other levels, or enable
 * sidegating/high-frequency dispersion are rejected rather than ignored.
 */
export interface MESAInstanceParams {
  L: number;
  W: number;
}

export interface MESAModel {
  LEVEL: 2;
  VTO: number;
  LAMBDA: number;
  VS: number;
  RD: number;
  RS: number;
  RDI: number;
  RSI: number;
  /** Schottky barrier height in volts (ngspice stores PHIB * q). */
  PHIB: number;
  ASTAR: number;
  GGR: number;
  DEL: number;
  N: number;
  ETA: number;
  M: number;
  MC: number;
  ALPHA: number;
  SIGMA0: number;
  VSIGMAT: number;
  VSIGMA: number;
  MU: number;
  THETA: number;
  D: number;
  ND: number;
  DELTA: number;
  TC: number;
  ZETA: number;
  AG: number;
}

export interface MESAEvaluation {
  /** Intrinsic channel current from drain' to source' (signed). */
  drainCurrent: number;
  /** Forward-orientation transconductance, as stored by ngspice. */
  gm: number;
  /** Forward-orientation output conductance, as stored by ngspice. */
  gds: number;
  gateSourceCurrent: number;
  gateSourceConductance: number;
  gateDrainCurrent: number;
  gateDrainConductance: number;
  capGS: number;
  capGD: number;
}

const MODEL_PARAMETERS = new Set([
  'LEVEL', 'VTO', 'VT0', 'LAMBDA', 'VS', 'RD', 'RS', 'RDI', 'RSI', 'PHIB',
  'ASTAR', 'GGR', 'DEL', 'N', 'ETA', 'M', 'MC', 'ALPHA', 'SIGMA0', 'VSIGMAT',
  'VSIGMA', 'MU', 'THETA', 'D', 'ND', 'DELTA', 'TC', 'ZETA', 'AG',
]);

// ngspice-47 include/ngspice/const.h
const CHARGE = 1.6021766208e-19;
const BOLTZMANN = 1.38064852e-23;
const EPSILON_GAAS = 12.244 * 8.85418e-12;
const TEMPERATURE = 300.15;
const THERMAL_VOLTAGE = BOLTZMANN / CHARGE * TEMPERATURE;
/** ngspice CKTgmin default, added to both gate junctions by MESAload. */
export const MESA_JUNCTION_GMIN = 1e-12;

export function resolveMESAModel(model: ModelParams): MESAModel {
  if (model.type !== 'NMF') throw new Error(`Unsupported MESA model type: '${model.type}'`);
  const level = model.params.LEVEL ?? 2;
  if (level !== 2) throw new Error(`Unsupported NMF model level: ${level}`);
  for (const name of Object.keys(model.params)) {
    if (!MODEL_PARAMETERS.has(name)) {
      throw new Error(`Unsupported NMF level-2 model parameter: '${name}'`);
    }
  }
  if (model.params.VT0 !== undefined && model.params.VTO !== undefined) {
    throw new Error("NMF level-2 model may specify only one of 'VT0' and 'VTO'");
  }
  const p = model.params;
  const resolved: MESAModel = {
    LEVEL: 2,
    VTO: p.VTO ?? p.VT0 ?? -1.26,
    LAMBDA: p.LAMBDA ?? 0.045,
    VS: p.VS ?? 1.5e5,
    RD: p.RD ?? 0,
    RS: p.RS ?? 0,
    RDI: p.RDI ?? 0,
    RSI: p.RSI ?? 0,
    PHIB: p.PHIB ?? 0.5,
    ASTAR: p.ASTAR ?? 4e4,
    GGR: p.GGR ?? 40,
    DEL: p.DEL ?? 0.04,
    N: p.N ?? 1,
    ETA: p.ETA ?? 1.73,
    M: p.M ?? 2.5,
    MC: p.MC ?? 3,
    ALPHA: p.ALPHA ?? 0,
    SIGMA0: p.SIGMA0 ?? 0.081,
    VSIGMAT: p.VSIGMAT ?? 1.01,
    VSIGMA: p.VSIGMA ?? 0.1,
    MU: p.MU ?? 0.23,
    THETA: p.THETA ?? 0,
    D: p.D ?? 0.12e-6,
    ND: p.ND ?? 2e23,
    DELTA: p.DELTA ?? 5,
    TC: p.TC ?? 0,
    ZETA: p.ZETA ?? 1,
    AG: p.AG ?? 0,
  };
  if (resolved.RD < 0 || resolved.RS < 0 || resolved.RDI < 0 || resolved.RSI < 0
    || resolved.VS <= 0 || resolved.MU <= 0 || resolved.ETA <= 0 || resolved.N <= 0
    || resolved.M <= 0 || resolved.MC <= 0 || resolved.VSIGMA <= 0 || resolved.D <= 0
    || resolved.ND <= 0 || resolved.ASTAR < 0 || resolved.GGR < 0) {
    throw new Error('Invalid NMF level-2 model parameter value');
  }
  return resolved;
}

export function resolveMESAInstance(params: Record<string, number> = {}): MESAInstanceParams {
  for (const name of Object.keys(params)) {
    if (name !== 'L' && name !== 'W') {
      throw new Error(`Unsupported NMF level-2 instance parameter: '${name}'`);
    }
  }
  const instance = { L: params.L ?? 1e-6, W: params.W ?? 20e-6 };
  if (!(instance.L > 0) || !(instance.W > 0)) {
    throw new Error('NMF level-2 instance L and W must be positive');
  }
  return instance;
}

interface ChannelResult {
  drainCurrent: number;
  gm: number;
  gds: number;
  capGS: number;
  capGD: number;
}

/** ngspice `mesa1()` for vds >= 0. */
function mesa1(vgs: number, vds: number, model: MESAModel, instance: MESAInstanceParams): ChannelResult {
  const { L, W } = instance;
  const vt = THERMAL_VOLTAGE;
  const vpo = CHARGE * model.ND * model.D * model.D / 2 / EPSILON_GAAS;
  const etavth = model.ETA * vt;
  const n0 = EPSILON_GAAS * model.ETA * vt / CHARGE / model.D;
  const isatb0 = CHARGE * n0 * vt * W / L;
  const gchi0 = CHARGE * W / L;
  const betaInstance = 2 * EPSILON_GAAS * model.VS * model.ZETA * W / model.D;
  const cf = 0.5 * EPSILON_GAAS * W;
  const RS = model.RSI;
  const RD = model.RDI;
  const lambda = model.LAMBDA;

  const rt = RS + RD;
  const vgt0 = vgs - model.VTO;
  const s = Math.exp((vgt0 - model.VSIGMAT) / model.VSIGMA);
  const sigma = model.SIGMA0 / (1 + s);
  const vgt = vgt0 + sigma * vds;
  const mu = model.MU + model.THETA * vgt;
  const vl = model.VS / mu * L;
  const beta = betaInstance / (vpo + 3 * vl);
  const u = vgt / vt - 1;
  const t = Math.sqrt(model.DELTA * model.DELTA + u * u);
  const vgte = 0.5 * vt * (2 + u + t);
  const a = 2 * beta * vgte;
  const b = Math.exp(-vgt / etavth);
  const sqrt1 = vgte > vpo ? 0 : Math.sqrt(1 - vgte / vpo);
  const ns = 1 / (1 / model.ND / model.D / (1 - sqrt1) + 1 / n0 * b);
  if (ns < 1e-38) {
    return { drainCurrent: 0, gm: 0, gds: 0, capGS: cf, capGD: cf };
  }
  const gchi = gchi0 * mu * ns;
  const gch = gchi / (1 + gchi * rt);
  const f = Math.sqrt(1 + 2 * a * RS);
  const d = 1 + a * RS + f;
  const e = 1 + model.TC * vgte;
  const isata = a * vgte / (d * e);
  const isatb = isatb0 * mu * Math.exp(vgt / etavth);
  const isat = isata * isatb / (isata + isatb);
  const vsate = isat / gch;
  const vdse = vds * (1 + (vds / vsate) ** model.MC) ** (-1 / model.MC);
  const m = model.M + model.ALPHA * vgte;
  let g = (vds / vsate) ** m;
  const h = (1 + g) ** (1 / m);
  const delidgch0 = vds / h;
  const delidgch = delidgch0 * (1 + lambda * vds);
  const cdrain = gch * delidgch;

  let temp = vgt > vpo ? 0 : Math.sqrt(1 - vgt / vpo);
  const cgc = W * L * EPSILON_GAAS / (temp + b) / model.D;
  let c = (vsate - vdse) / (2 * vsate - vdse);
  c *= c;
  const capGS = cf + 2 / 3 * cgc * (1 - c);
  c = vsate / (2 * vsate - vdse);
  c *= c;
  const capGD = cf + 2 / 3 * cgc * (1 - c);

  temp = 1 + gchi * rt;
  const delgchgchi = 1 / (temp * temp);
  const delgchins = gchi0 * mu;
  const delnsvgt = ns * ns / n0 / etavth * b;
  const q = 1 - sqrt1;
  const delnsvgte = sqrt1 === 0 ? 0 : 0.5 * ns * ns / (vpo * model.ND * model.D * sqrt1 * q * q);
  const delvgtevgt = 0.5 * (1 + u / t);
  const delidvds0 = gch / h;
  const delidvds1 = vds !== 0 ? cdrain * (vds / vsate) ** (m - 1) / (vsate * (1 + g)) : 0;
  const delidvds = delidvds0 * (1 + 2 * lambda * vds) - delidvds1;
  const delidvsate = cdrain * g / (vsate * (1 + g));
  const delvsateisat = 1 / gch;
  let r = isata + isatb;
  r *= r;
  const delisatisata = isatb * isatb / r;
  const v = 1 + 1 / f;
  const ddevgte = 2 * beta * RS * v * e + d * model.TC;
  temp = d * d * e * e;
  const delisatavgte = (2 * a * d * e - a * vgte * ddevgte) / temp;
  const delisatabeta = 2 * vgte * vgte * (d * e - a * e * RS * v) / temp;
  const delisatisatb = isata * isata / r;
  const delvsategch = -vsate / gch;
  const dvgtvgs = 1 - model.SIGMA0 * vds * s / model.VSIGMA / ((1 + s) * (1 + s));
  temp = gchi0 * ns * model.THETA;
  const dgchivgt = delgchins * (delnsvgte * delvgtevgt + delnsvgt) + temp;
  const dvgtevds = delvgtevgt * sigma;
  const dgchivds = delgchins * (delnsvgte * dvgtevds + delnsvgt * sigma) + temp * sigma;
  temp = delisatabeta * 3 * beta * vl * model.THETA / (mu * (vpo + 3 * vl));
  const disatavgt = delisatavgte * delvgtevgt + temp;
  const disatavds = delisatavgte * dvgtevds + temp * sigma;
  const disatbvgt = isatb / etavth + isatb / mu * model.THETA;
  const p = delgchgchi * dgchivgt;
  const w = delgchgchi * dgchivds;
  const dvsatevgt = delvsateisat * (delisatisata * disatavgt + delisatisatb * disatbvgt) + delvsategch * p;
  const dvsatevds = delvsateisat * (delisatisata * disatavds + delisatisatb * disatbvgt * sigma)
    + delvsategch * w;
  let gmmadd = 0;
  let gdsmadd = 0;
  if (model.ALPHA !== 0) {
    gmmadd = vds === 0
      ? 0
      : cdrain * (Math.log(1 + g) / (m * m) - g * Math.log(vds / vsate) / (m * (1 + g)))
        * model.ALPHA * delvgtevgt;
    gdsmadd = gmmadd * sigma;
  }
  const gm1 = delidvsate * dvsatevgt;
  g = delidgch * p + gm1;
  const gm = (g + gmmadd) * dvgtvgs;
  const gds0 = delidvsate * dvsatevds + delidgch * w + gdsmadd;
  const gds = delidvds + gds0;
  return { drainCurrent: cdrain, gm, gds, capGS, capGD };
}

/**
 * Evaluate the intrinsic MESA level-2 device at gate'-source' and gate'-drain'
 * voltages, exactly as ngspice MESAload does after voltage limiting.
 */
export function evaluateMESA(
  vgs: number,
  vgd: number,
  model: MESAModel,
  instance: MESAInstanceParams,
  gmin = MESA_JUNCTION_GMIN,
): MESAEvaluation {
  const vt = THERMAL_VOLTAGE;
  const vte = model.N * vt;
  const area = instance.L * instance.W;
  const csatf = 0.5 * model.ASTAR * TEMPERATURE * TEMPERATURE
    * Math.exp(-model.PHIB * CHARGE / (BOLTZMANN * TEMPERATURE)) * area;
  const ggrwl = model.GGR * area;

  let arg = -vgs * model.DEL / vt;
  let earg = Math.exp(arg);
  const evgs = Math.exp(vgs / vte);
  const gateSourceConductance = csatf * evgs / vte + ggrwl * earg * (1 - arg) + gmin;
  const gateSourceCurrent = csatf * (evgs - 1) + ggrwl * vgs * earg + gmin * vgs;

  arg = -vgd * model.DEL / vt;
  earg = Math.exp(arg);
  const evgd = Math.exp(vgd / vte);
  const gateDrainConductance = csatf * evgd / vte + ggrwl * earg * (1 - arg) + gmin;
  const gateDrainCurrent = csatf * (evgd - 1) + ggrwl * vgd * earg + gmin * vgd;

  const vds = vgs - vgd;
  const inverse = vds < 0;
  const channel = mesa1(inverse ? vgd : vgs, Math.abs(vds), model, instance);
  return {
    drainCurrent: inverse ? -channel.drainCurrent : channel.drainCurrent,
    gm: channel.gm,
    gds: channel.gds,
    gateSourceCurrent,
    gateSourceConductance,
    gateDrainCurrent,
    gateDrainConductance,
    capGS: inverse ? channel.capGD : channel.capGS,
    capGD: inverse ? channel.capGS : channel.capGD,
  };
}
