import type { DeviceModel, StampContext } from './device.js';

export interface JFETParams {
  LEVEL: number;
  VTO: number;
  BETA: number;
  LAMBDA: number;
  RD: number;
  RS: number;
  CGS: number;
  CGD: number;
  PB: number;
  IS: number;
  B: number;
  FC: number;
  KF: number;
  AF: number;
  DELTA: number;
  /** ngspice-47 warns that THETA is unrecognized and ignores it. */
  THETA: number;
}

export const NJF_LEVEL1_PARAMETERS = new Set<keyof JFETParams>([
  'LEVEL', 'VTO', 'BETA', 'LAMBDA', 'RD', 'RS', 'CGS', 'CGD',
  'PB', 'IS', 'B', 'FC', 'KF', 'AF',
]);

export const NJF_LEVEL2_PARAMETERS = new Set<keyof JFETParams>([
  'LEVEL', 'VTO', 'BETA', 'LAMBDA', 'DELTA', 'THETA', 'RD', 'RS',
  'CGS', 'CGD', 'PB', 'IS', 'FC', 'KF', 'AF',
]);

const THERMAL_VOLTAGE = 0.02585;
const GMIN = 1e-12;

export function resolveNJFETParams(params: Record<string, number>): JFETParams {
  const level = params.LEVEL ?? 1;
  if (level !== 1 && level !== 2) throw new Error(`Unsupported NJF model level: ${level}`);

  const supported = level === 1 ? NJF_LEVEL1_PARAMETERS : NJF_LEVEL2_PARAMETERS;
  for (const name of Object.keys(params)) {
    if (!supported.has(name as keyof JFETParams)) {
      throw new Error(`Unsupported NJF level-${level} model parameter: '${name}'`);
    }
  }

  const resolved: JFETParams = {
    LEVEL: level,
    VTO: params.VTO ?? -2,
    BETA: params.BETA ?? 1e-4,
    LAMBDA: params.LAMBDA ?? 0,
    RD: params.RD ?? 0,
    RS: params.RS ?? 0,
    CGS: params.CGS ?? 0,
    CGD: params.CGD ?? 0,
    PB: params.PB ?? 1,
    IS: params.IS ?? 1e-14,
    B: params.B ?? 1,
    FC: params.FC ?? 0.5,
    KF: params.KF ?? 0,
    AF: params.AF ?? 1,
    DELTA: params.DELTA ?? 0,
    THETA: params.THETA ?? 0,
  };

  if (resolved.BETA < 0 || resolved.RD < 0 || resolved.RS < 0
    || resolved.CGS < 0 || resolved.CGD < 0 || resolved.PB <= 0
    || resolved.IS <= 0 || resolved.FC <= 0 || resolved.FC >= 1
    || resolved.DELTA < 0) {
    throw new Error(`Invalid NJF level-${level} model parameter value`);
  }
  return resolved;
}

export class JFET implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = true;
  readonly params: JFETParams;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    params: Record<string, number>,
  ) {
    this.params = resolveNJFETParams(params);
  }

  stamp(ctx: StampContext): void {
    let nD = this.nodes[0];
    const nG = this.nodes[1];
    let nS = this.nodes[2];
    const vD = nD >= 0 ? ctx.getVoltage(nD) : 0;
    const vG = nG >= 0 ? ctx.getVoltage(nG) : 0;
    const vS = nS >= 0 ? ctx.getVoltage(nS) : 0;

    this.stampGateJunction(ctx, nG, this.nodes[0], vG - vD);
    this.stampGateJunction(ctx, nG, this.nodes[2], vG - vS);

    let vGS = vG - vS;
    let vDS = vD - vS;
    if (vDS < 0) {
      [nD, nS] = [nS, nD];
      vGS -= vDS;
      vDS = -vDS;
    }

    const { current, gm, gds } = channelCurrent(vGS, vDS, this.params);
    const ieq = current - gm * vGS - gds * vDS;

    if (nD >= 0) {
      if (nG >= 0) ctx.stampG(nD, nG, gm);
      ctx.stampG(nD, nD, gds);
      if (nS >= 0) ctx.stampG(nD, nS, -(gm + gds));
      ctx.stampB(nD, -ieq);
    }
    if (nS >= 0) {
      if (nG >= 0) ctx.stampG(nS, nG, -gm);
      if (nD >= 0) ctx.stampG(nS, nD, -gds);
      ctx.stampG(nS, nS, gm + gds);
      ctx.stampB(nS, ieq);
    }
  }

  stampDynamic(ctx: StampContext): void {
    const [nD, nG, nS] = this.nodes;
    const vD = nD >= 0 ? ctx.getVoltage(nD) : 0;
    const vG = nG >= 0 ? ctx.getVoltage(nG) : 0;
    const vS = nS >= 0 ? ctx.getVoltage(nS) : 0;
    this.stampJunctionCapacitance(ctx, nG, nD, vG - vD, this.params.CGD);
    this.stampJunctionCapacitance(ctx, nG, nS, vG - vS, this.params.CGS);
  }

  private stampGateJunction(
    ctx: StampContext,
    anode: number,
    cathode: number,
    voltage: number,
  ): void {
    const exponential = Math.exp(Math.min(voltage / THERMAL_VOLTAGE, 40));
    const current = this.params.IS * (exponential - 1) + GMIN * voltage;
    const conductance = this.params.IS * exponential / THERMAL_VOLTAGE + GMIN;
    const ieq = current - conductance * voltage;
    stampTwoTerminal(ctx, anode, cathode, conductance, ieq);
  }

  private stampJunctionCapacitance(
    ctx: StampContext,
    anode: number,
    cathode: number,
    voltage: number,
    zeroBiasCapacitance: number,
  ): void {
    if (zeroBiasCapacitance === 0) return;
    const { PB, FC } = this.params;
    const capacitance = voltage < FC * PB
      ? zeroBiasCapacitance / Math.sqrt(1 - voltage / PB)
      : zeroBiasCapacitance / Math.sqrt(1 - FC)
        * (1 + (voltage - FC * PB) / (2 * PB * (1 - FC)));
    stampCapacitance(ctx, anode, cathode, capacitance);
  }
}

function channelCurrent(
  vGS: number,
  vDS: number,
  params: JFETParams,
): { current: number; gm: number; gds: number } {
  if (params.LEVEL === 2) return parkerSkellernCurrent(vGS, vDS, params);

  const overdrive = vGS - params.VTO;
  if (overdrive <= 0) return { current: 0, gm: 0, gds: 0 };

  const betaPrime = params.BETA * (1 + params.LAMBDA * vDS);
  const bFactor = (1 - params.B) / (params.PB - params.VTO);

  if (overdrive >= vDS) {
    const aPart = 2 * params.B + 3 * bFactor * (overdrive - vDS);
    const cPart = vDS * (
      vDS * (bFactor * vDS - params.B) + overdrive * aPart
    );
    return {
      current: betaPrime * cPart,
      gm: betaPrime * vDS * (aPart + 3 * bFactor * overdrive),
      gds: betaPrime * (overdrive - vDS) * aPart
        + params.BETA * params.LAMBDA * cPart,
    };
  }

  const scaledBFactor = overdrive * bFactor;
  const cPart = overdrive * overdrive * (params.B + scaledBFactor);
  return {
    current: betaPrime * cPart,
    gm: betaPrime * overdrive * (2 * params.B + 3 * scaledBFactor),
    gds: params.LAMBDA * params.BETA * cPart,
  };
}

/**
 * Bounded DC subset of the Parker-Skellern model used by ngspice JFET2.
 *
 * This is the PSids Q-law path with the ngspice-47 defaults P=Q=2,
 * XI=1000, Z=1, MXI=VST=LFGAM=HFETA=HFGAM=0, followed by LAMBDA/BETA
 * scaling and DELTA self-heating reduction. THETA is deliberately absent:
 * ngspice-47 reports it as unrecognized and ignores it.
 *
 * Source: ngspice src/spicelib/devices/jfet2/psmodel.c, PSids().
 */
function parkerSkellernCurrent(
  vGS: number,
  vDS: number,
  params: JFETParams,
): { current: number; gm: number; gds: number } {
  const vGT = vGS - params.VTO;
  if (vGT <= 0) return { current: 0, gm: 0, gds: 0 };

  const xi = 1000;
  const z = 1;
  const xiWoo = xi * (params.PB - params.VTO);
  const za = Math.sqrt(1 + z) / 2;
  const vSatFactor = vGT / xiWoo;
  const vSat = vGT / (1 + vSatFactor);
  const aa = za * vDS + vSat / 2;
  const saturationTerm = vSat * vSat * z / 4;
  const rootPositive = Math.sqrt(aa * aa + saturationTerm);
  const rootNegative = Math.sqrt((aa - vSat) ** 2 + saturationTerm);
  const vDT = rootPositive - rootNegative;
  const dvdtDvds = za * (aa / rootPositive - (aa - vSat) / rootNegative);
  const dvdtDvgt = (vDT - vDS * dvdtDvds)
    * (1 + vSatFactor * vSatFactor) / (1 + vSatFactor) / vGT;

  const remaining = vGT - vDT;
  let gds = 2 * remaining;
  let current = vDT * remaining + vGT * vDT;
  let gm = 2 * vDT;
  gm += gds * dvdtDvgt;
  gds *= dvdtDvds;

  const betaScale = params.BETA * (1 + params.LAMBDA * vDS);
  gm *= betaScale;
  gds = params.BETA * params.LAMBDA * current + gds * betaScale;
  current *= betaScale;

  const powerFactor = 1 + params.DELTA * vDS * current;
  current /= powerFactor;
  const derivativeScale = 1 / (powerFactor * powerFactor);
  gm *= derivativeScale;
  gds = gds * derivativeScale - params.DELTA * current * current;

  return { current, gm, gds };
}

function stampTwoTerminal(
  ctx: StampContext,
  positive: number,
  negative: number,
  conductance: number,
  equivalentCurrent: number,
): void {
  if (positive >= 0) {
    ctx.stampG(positive, positive, conductance);
    ctx.stampB(positive, -equivalentCurrent);
  }
  if (negative >= 0) {
    ctx.stampG(negative, negative, conductance);
    ctx.stampB(negative, equivalentCurrent);
  }
  if (positive >= 0 && negative >= 0) {
    ctx.stampG(positive, negative, -conductance);
    ctx.stampG(negative, positive, -conductance);
  }
}

function stampCapacitance(
  ctx: StampContext,
  positive: number,
  negative: number,
  capacitance: number,
): void {
  if (positive >= 0) ctx.stampC(positive, positive, capacitance);
  if (negative >= 0) ctx.stampC(negative, negative, capacitance);
  if (positive >= 0 && negative >= 0) {
    ctx.stampC(positive, negative, -capacitance);
    ctx.stampC(negative, positive, -capacitance);
  }
}
