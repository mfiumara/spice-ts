import type { ModelParams } from '../types.js';

/**
 * ngspice MES (Z-card, `NMF` LEVEL=1 or no LEVEL): the Statz et al. GaAs
 * MESFET model. Mirrors ngspice-47 `messetup.c` defaults, `mestemp.c` and
 * `MESload()` / `qggnew()` in `mesload.c`.
 *
 * MES has no temperature dependence in ngspice: every junction uses
 * CONSTvt0 (kT/q at 27 C). AREA scales BETA, IS, CGS, CGD and the RD/RS
 * conductances. KF/AF only enter noise analysis.
 */
export interface MESModel {
  LEVEL: 1;
  VTO: number;
  ALPHA: number;
  BETA: number;
  LAMBDA: number;
  B: number;
  RD: number;
  RS: number;
  CGS: number;
  CGD: number;
  PB: number;
  IS: number;
  FC: number;
  KF: number;
  AF: number;
}

export interface MESInstanceParams {
  AREA: number;
}

export interface MESEvaluation {
  drainCurrent: number;
  /** dId/dVgs of the signed drain current (negative in inverse mode, as in MESload). */
  gm: number;
  /** dId/dVds of the signed drain current (ngspice MESload gds). */
  gds: number;
  gateSourceCurrent: number;
  gateSourceConductance: number;
  gateDrainCurrent: number;
  gateDrainConductance: number;
}

export interface MESGateCharge {
  /** qggnew charge at (vgs, vgd). */
  charge: number;
  capGS: number;
  capGD: number;
}

const MODEL_PARAMETERS = new Set([
  'LEVEL', 'VTO', 'VT0', 'ALPHA', 'BETA', 'LAMBDA', 'B', 'RD', 'RS', 'CGS', 'CGD',
  'PB', 'IS', 'FC', 'KF', 'AF',
]);

// ngspice-47 include/ngspice/const.h and main.c: CONSTvt0 = k * REFTEMP / q.
const CHARGE = 1.6021766208e-19;
const BOLTZMANN = 1.38064852e-23;
const VT0 = BOLTZMANN * 300.15 / CHARGE;
const E = Math.E;
/** ngspice CKTgmin default, added to both gate junctions by MESload. */
export const MES_JUNCTION_GMIN = 1e-12;

export function resolveMESModel(model: ModelParams): MESModel {
  // ngspice maps both nmf and nhfet cards at LEVEL 0/1 to MES (type NMF).
  if (model.type !== 'NMF' && model.type !== 'NHFET') {
    throw new Error(`Unsupported MES model type: '${model.type}'`);
  }
  for (const name of Object.keys(model.params)) {
    if (!MODEL_PARAMETERS.has(name)) {
      throw new Error(`Unsupported NMF level-1 model parameter: '${name}'`);
    }
  }
  const p = model.params;
  if (p.VT0 !== undefined && p.VTO !== undefined) {
    throw new Error("NMF level-1 model may specify only one of 'VT0' and 'VTO'");
  }
  const resolved: MESModel = {
    LEVEL: 1,
    VTO: p.VT0 ?? p.VTO ?? -2,
    ALPHA: p.ALPHA ?? 2,
    BETA: p.BETA ?? 2.5e-3,
    LAMBDA: p.LAMBDA ?? 0,
    B: p.B ?? 0.3,
    RD: p.RD ?? 0,
    RS: p.RS ?? 0,
    CGS: p.CGS ?? 0,
    CGD: p.CGD ?? 0,
    PB: p.PB ?? 1,
    IS: p.IS ?? 1e-14,
    FC: p.FC ?? 0.5,
    KF: p.KF ?? 0,
    AF: p.AF ?? 1,
  };
  if (resolved.RD < 0 || resolved.RS < 0 || resolved.CGS < 0 || resolved.CGD < 0
    || !(resolved.ALPHA > 0) || !(resolved.PB > 0) || !(resolved.IS > 0)) {
    throw new Error('Invalid NMF level-1 model parameter value');
  }
  return resolved;
}

export function resolveMESInstance(params: Record<string, number> = {}): MESInstanceParams {
  for (const name of Object.keys(params)) {
    if (name !== 'AREA') throw new Error(`Unsupported NMF level-1 instance parameter: '${name}'`);
  }
  const instance = { AREA: params.AREA ?? 1 };
  if (!(instance.AREA > 0)) throw new Error('NMF level-1 instance AREA must be positive');
  return instance;
}

/** Series RD/RS of one instance: ngspice loads MESdrainConduct * area. */
export function mesSeriesResistances(model: MESModel, instance: MESInstanceParams) {
  return { RD: model.RD / instance.AREA, RS: model.RS / instance.AREA };
}

/** ngspice MESload gate diode (one junction). */
function gateJunction(v: number, csat: number, gmin: number): { current: number; conductance: number } {
  if (v <= -3 * VT0) {
    let arg = 3 * VT0 / (v * E);
    arg = arg * arg * arg;
    return { current: -csat * (1 + arg) + gmin * v, conductance: csat * 3 * arg / v + gmin };
  }
  const ev = Math.exp(v / VT0);
  return { current: csat * (ev - 1) + gmin * v, conductance: csat * ev / VT0 + gmin };
}

/** ngspice MESload DC currents and conductances at gate-source'/gate-drain' voltages. */
export function evaluateMES(
  vgs: number,
  vgd: number,
  model: MESModel,
  instance: MESInstanceParams,
  gmin = MES_JUNCTION_GMIN,
): MESEvaluation {
  const beta = model.BETA * instance.AREA;
  const csat = model.IS * instance.AREA;
  const gs = gateJunction(vgs, csat, gmin);
  const gd = gateJunction(vgd, csat, gmin);
  const vds = vgs - vgd;
  const lambda = model.LAMBDA;
  let cdrain = 0;
  let gm = 0;
  let gds = 0;
  if (vds >= 0) {
    const vgst = vgs - model.VTO;
    if (vgst > 0) {
      const prod = 1 + lambda * vds;
      const betap = beta * prod;
      const denom = 1 + model.B * vgst;
      const invdenom = 1 / denom;
      if (vds >= 3 / model.ALPHA) {
        cdrain = betap * vgst * vgst * invdenom;
        gm = betap * vgst * (1 + denom) * invdenom * invdenom;
        gds = lambda * beta * vgst * vgst * invdenom;
      } else {
        const afact = 1 - model.ALPHA * vds / 3;
        const lfact = 1 - afact * afact * afact;
        cdrain = betap * vgst * vgst * invdenom * lfact;
        gm = betap * vgst * (1 + denom) * invdenom * invdenom * lfact;
        gds = beta * vgst * vgst * invdenom * (model.ALPHA * afact * afact * prod + lfact * lambda);
      }
    }
  } else {
    const vgdt = vgd - model.VTO;
    if (vgdt > 0) {
      const prod = 1 - lambda * vds;
      const betap = beta * prod;
      const denom = 1 + model.B * vgdt;
      const invdenom = 1 / denom;
      if (-vds >= 3 / model.ALPHA) {
        cdrain = -betap * vgdt * vgdt * invdenom;
        gm = -betap * vgdt * (1 + denom) * invdenom * invdenom;
        gds = lambda * beta * vgdt * vgdt * invdenom - gm;
      } else {
        const afact = 1 + model.ALPHA * vds / 3;
        const lfact = 1 - afact * afact * afact;
        cdrain = -betap * vgdt * vgdt * invdenom * lfact;
        gm = -betap * vgdt * (1 + denom) * invdenom * invdenom * lfact;
        gds = beta * vgdt * vgdt * invdenom * (model.ALPHA * afact * afact * prod + lfact * lambda) - gm;
      }
    }
  }
  return {
    drainCurrent: cdrain,
    gm,
    gds,
    gateSourceCurrent: gs.current,
    gateSourceConductance: gs.conductance,
    gateDrainCurrent: gd.current,
    gateDrainConductance: gd.conductance,
  };
}

/** ngspice `qggnew()`: Statz gate charge and its two capacitances. */
export function mesGateCharge(
  vgs: number,
  vgd: number,
  model: MESModel,
  instance: MESInstanceParams,
): MESGateCharge {
  const phib = model.PB;
  const vcap = 1 / model.ALPHA;
  const vto = model.VTO;
  const cgs = model.CGS * instance.AREA;
  const cgd = model.CGD * instance.AREA;
  const veroot = Math.sqrt((vgs - vgd) * (vgs - vgd) + vcap * vcap);
  const veff1 = 0.5 * (vgs + vgd + veroot);
  const veff2 = veff1 - veroot;
  const del = 0.2;
  const vnroot = Math.sqrt((veff1 - vto) * (veff1 - vto) + del * del);
  let vnew1 = 0.5 * (veff1 + vto + vnroot);
  const vnew3 = vnew1;
  const vmax = 0.5;
  let ext: number;
  if (vnew1 < vmax) {
    ext = 0;
  } else {
    vnew1 = vmax;
    ext = (vnew3 - vmax) / Math.sqrt(1 - vmax / phib);
  }
  const qroot = Math.sqrt(1 - vnew1 / phib);
  const charge = cgs * (2 * phib * (1 - qroot) + ext) + cgd * veff2;
  const par1 = 0.5 * (1 + (veff1 - vto) / vnroot);
  const cfact = (vgs - vgd) / veroot;
  const cplus = 0.5 * (1 + cfact);
  const cminus = cplus - cfact;
  return {
    charge,
    capGS: cgs / qroot * par1 * cplus + cgd * cminus,
    capGD: cgs / qroot * par1 * cminus + cgd * cplus,
  };
}
