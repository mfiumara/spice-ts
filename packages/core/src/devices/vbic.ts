import type { DeviceModel, StampContext } from './device.js';

const VT = 1.380662e-23 * 300.15 / 1.602189e-19;
const GMIN = 1e-12;
const ACTIVE_PARAMETERS = [
  'IS', 'IBEI', 'IBEN', 'IBCI', 'IBCN', 'ISP',
  'RCX', 'RCI', 'RBX', 'RBI', 'RE', 'RS', 'RBP',
  'VEF', 'VER', 'IKF', 'IKR', 'IKP', 'VO', 'GAMM', 'HRCF', 'AVC1', 'AVC2',
] as const;
const DC_INERT_PARAMETERS = [
  'CJE', 'CJC', 'CJEP', 'CJCP', 'QCO', 'TF', 'TR', 'TD', 'ITF', 'XTF', 'RTH',
] as const;
const SUPPORTED_PARAMETERS = new Set<string>([
  'LEVEL', ...ACTIVE_PARAMETERS, ...DC_INERT_PARAMETERS,
]);

type ActiveParameter = typeof ACTIVE_PARAMETERS[number];
type InertParameter = typeof DC_INERT_PARAMETERS[number];

export interface VBICParams extends Record<ActiveParameter | InertParameter, number> {
  LEVEL: 4;
  polarity: 1 | -1;
}

const DEFAULTS: VBICParams = {
  LEVEL: 4,
  polarity: 1,
  IS: 1e-16,
  IBEI: 1e-18,
  IBEN: 0,
  IBCI: 1e-16,
  IBCN: 0,
  ISP: 0,
  RCX: 0,
  RCI: 0.1,
  RBX: 0,
  RBI: 0.1,
  RE: 0,
  RS: 0,
  RBP: 0.1,
  VEF: 0,
  VER: 0,
  IKF: 0,
  IKR: 0,
  IKP: 0,
  VO: 0,
  GAMM: 0,
  HRCF: 1,
  AVC1: 0,
  AVC2: 0,
  CJE: 0,
  CJC: 0,
  CJEP: 0,
  CJCP: 0,
  QCO: 0,
  TF: 0,
  TR: 0,
  TD: 0,
  ITF: 0,
  XTF: 0,
  RTH: 0,
};

/** Resolve the bounded, isothermal VBIC 1.2 DC subset used by NPN LEVEL=4. */
export function resolveVBICParams(
  supplied: Record<string, number>,
  polarity: number,
): VBICParams {
  for (const name of Object.keys(supplied)) {
    if (!SUPPORTED_PARAMETERS.has(name)) {
      throw new Error(`Unsupported bounded VBIC DC model parameter: '${name}'`);
    }
  }
  if ((supplied.LEVEL ?? 4) !== 4) {
    throw new Error(`Unsupported bounded VBIC model level: ${supplied.LEVEL}`);
  }
  if (polarity !== 1) {
    throw new Error('Unsupported bounded VBIC polarity: only NPN LEVEL=4 is supported');
  }
  const resolved = { ...DEFAULTS, ...supplied, LEVEL: 4, polarity: 1 } as VBICParams;
  for (const name of [...ACTIVE_PARAMETERS, ...DC_INERT_PARAMETERS]) {
    if (!Number.isFinite(resolved[name])) {
      throw new Error(`Invalid bounded VBIC DC model parameter: '${name}'`);
    }
  }
  for (const name of [
    'IS', 'IBEI', 'IBEN', 'IBCI', 'IBCN', 'ISP',
    'RCX', 'RBX', 'RE', 'RS', 'VEF', 'VER', 'IKF', 'IKR', 'IKP',
    'VO', 'GAMM', 'AVC1', 'AVC2', ...DC_INERT_PARAMETERS,
  ] as const) {
    if (resolved[name] < 0) throw new Error(`Invalid bounded VBIC DC model parameter: '${name}'`);
  }
  for (const name of ['RCI', 'RBI', 'RBP', 'HRCF'] as const) {
    if (resolved[name] <= 0) throw new Error(`Invalid bounded VBIC DC model parameter: '${name}'`);
  }
  return resolved;
}

class Dual {
  constructor(readonly value: number, readonly derivative: Float64Array) {}

  static constant(value: number, size: number): Dual {
    return new Dual(value, new Float64Array(size));
  }

  static variable(value: number, size: number, index: number): Dual {
    const derivative = new Float64Array(size);
    derivative[index] = 1;
    return new Dual(value, derivative);
  }
}

function map(a: Dual, value: number, slope: number): Dual {
  return new Dual(value, Float64Array.from(a.derivative, derivative => derivative * slope));
}

function add(a: Dual, b: Dual): Dual {
  return new Dual(a.value + b.value, Float64Array.from(a.derivative, (value, i) => value + b.derivative[i]));
}

function sub(a: Dual, b: Dual): Dual {
  return new Dual(a.value - b.value, Float64Array.from(a.derivative, (value, i) => value - b.derivative[i]));
}

function mul(a: Dual, b: Dual): Dual {
  return new Dual(a.value * b.value, Float64Array.from(a.derivative, (value, i) => value * b.value + a.value * b.derivative[i]));
}

function scale(a: Dual, factor: number): Dual {
  return map(a, a.value * factor, factor);
}

function div(a: Dual, b: Dual): Dual {
  const denominator = b.value * b.value;
  return new Dual(a.value / b.value, Float64Array.from(a.derivative, (value, i) =>
    (value * b.value - a.value * b.derivative[i]) / denominator));
}

function sqrt(a: Dual): Dual {
  const value = Math.sqrt(Math.max(a.value, Number.EPSILON));
  return map(a, value, 0.5 / value);
}

function log(a: Dual): Dual {
  const value = Math.max(a.value, Number.EPSILON);
  return map(a, Math.log(value), 1 / value);
}

function exp(a: Dual): Dual {
  const argument = Math.min(80, Math.max(-80, a.value));
  const value = Math.exp(argument);
  return map(a, value, a.value === argument ? value : 0);
}

function pow(a: Dual, exponent: number): Dual {
  const base = Math.max(a.value, Number.EPSILON);
  return map(a, Math.pow(base, exponent), exponent * Math.pow(base, exponent - 1));
}

function c(value: number, size: number): Dual {
  return Dual.constant(value, size);
}

function reciprocalOrZero(value: number): number {
  return value > 0 ? 1 / value : 0;
}

function junctionStepScale(
  proposedVoltage: number,
  previousVoltage: number,
  saturationCurrent: number,
): number {
  const delta = proposedVoltage - previousVoltage;
  if (delta === 0) return 1;
  const criticalVoltage = VT * Math.log(VT / (Math.sqrt(2) * saturationCurrent));
  let limited = proposedVoltage;
  if (proposedVoltage > criticalVoltage && Math.abs(delta) > 2 * VT) {
    if (previousVoltage > 0) {
      const argument = 1 + delta / VT;
      limited = argument > 0
        ? previousVoltage + VT * Math.log(argument)
        : criticalVoltage;
    } else {
      limited = VT * Math.log(proposedVoltage / VT);
    }
  } else if (proposedVoltage < 0) {
    const minimum = previousVoltage > 0
      ? -previousVoltage - 1
      : 2 * previousVoltage - 1;
    limited = Math.max(proposedVoltage, minimum);
  }
  return Math.min(1, Math.max(0, (limited - previousVoltage) / delta));
}

function diode(voltage: Dual, current: number, ideality: number): Dual {
  return scale(sub(exp(scale(voltage, 1 / (ideality * VT))), c(1, voltage.derivative.length)), current);
}

function depletionCharge(voltage: Dual, potential: number, grading: number): Dual {
  const size = voltage.derivative.length;
  const fc = 0.9;
  const delta = voltage.value - potential * fc;
  if (delta > 0) {
    const pw = Math.pow(1 - fc, -1 - grading);
    const constant = potential * (1 - pw * (1 - fc) * (1 - fc)) / (1 - grading);
    return add(c(constant, size), scale(
      mul(
        sub(voltage, c(potential * fc, size)),
        add(c(1 - fc, size), scale(sub(voltage, c(potential * fc, size)), 0.5 * grading / potential)),
      ),
      pw,
    ));
  }
  return scale(
    sub(c(1, size), pow(sub(c(1, size), scale(voltage, 1 / potential)), 1 - grading)),
    potential / (1 - grading),
  );
}

interface Evaluation {
  residual: Dual[];
}

function evaluate(voltages: number[], params: VBICParams): Evaluation {
  const size = voltages.length;
  const v = voltages.map((value, index) => Dual.variable(value, size, index));
  const [cx, ci, bx, bi, ei, bp, si] = v;
  const vbei = sub(bi, ei);
  const vbex = sub(bx, ei);
  const vbci = sub(bi, ci);
  const vbcx = sub(bi, cx);
  const vbep = sub(bx, bp);
  const vbcp = sub(si, bp);
  const vrci = sub(cx, ci);
  const vrbi = sub(bx, bi);
  const vrbp = sub(bp, cx);

  const ifi = diode(vbei, params.IS, 1);
  const iri = diode(vbci, params.IS, 1);
  const q1z = add(c(1, size), add(
    scale(depletionCharge(vbei, 0.75, 0.33), reciprocalOrZero(params.VER)),
    scale(depletionCharge(vbci, 0.75, 0.33), reciprocalOrZero(params.VEF)),
  ));
  const q1Offset = sub(q1z, c(1e-4, size));
  const q1 = add(scale(add(sqrt(add(mul(q1Offset, q1Offset), c(1e-8, size))), q1Offset), 0.5), c(1e-4, size));
  const q2 = add(scale(ifi, reciprocalOrZero(params.IKF)), scale(iri, reciprocalOrZero(params.IKR)));
  const qb = scale(add(q1, sqrt(add(mul(q1, q1), scale(q2, 4)))), 0.5);
  const itzf = div(ifi, qb);
  const itzr = div(iri, qb);
  const transport = sub(itzf, itzr);

  const ibe = add(diode(vbei, params.IBEI, 1), diode(vbei, params.IBEN, 2));
  const ibex = scale(add(diode(vbex, params.IBEI, 1), diode(vbex, params.IBEN, 2)), 0);
  const ibcj = add(diode(vbci, params.IBCI, 1), diode(vbci, params.IBCN, 2));
  const avalancheVoltage = scale(add(
    sqrt(add(mul(sub(c(0.75, size), vbci), sub(c(0.75, size), vbci)), c(0.01, size))),
    sub(c(0.75, size), vbci),
  ), 0.5);
  const avalanche = scale(mul(
    avalancheVoltage,
    exp(scale(pow(avalancheVoltage, -0.67), -params.AVC2)),
  ), params.AVC1);
  const ibc = sub(ibcj, mul(sub(transport, ibcj), avalanche));

  const ifp = diode(vbep, params.ISP, 1);
  const irp = diode(vbcp, params.ISP, 1);
  const qbp = scale(add(c(1, size), sqrt(add(c(1, size), scale(ifp, 4 * reciprocalOrZero(params.IKP))))), 0.5);
  const iccp = div(sub(ifp, irp), qbp);

  const kbci = sqrt(add(c(1, size), scale(exp(scale(vbci, 1 / VT)), params.GAMM)));
  const kbcx = sqrt(add(c(1, size), scale(exp(scale(vbcx, 1 / VT)), params.GAMM)));
  const ratio = div(add(kbci, c(1, size)), add(kbcx, c(1, size)));
  const iohm = scale(add(vrci, scale(sub(sub(kbci, kbcx), log(ratio)), VT)), 1 / params.RCI);
  const derf = div(
    scale(iohm, params.RCI * reciprocalOrZero(params.VO)),
    add(c(1, size), scale(sqrt(add(mul(vrci, vrci), c(0.01, size))), 0.5 * reciprocalOrZero(params.VO) / params.HRCF)),
  );
  const irci = div(iohm, sqrt(add(c(1, size), mul(derf, derf))));
  const irbi = scale(mul(vrbi, qb), 1 / params.RBI);
  const irbp = scale(mul(vrbp, qbp), 1 / params.RBP);

  const residual = Array.from({ length: size }, () => c(0, size));
  const branch = (from: number, to: number, current: Dual): void => {
    residual[from] = add(residual[from], current);
    residual[to] = sub(residual[to], current);
  };
  branch(0, 1, irci);
  branch(2, 3, irbi);
  branch(5, 0, irbp);
  branch(3, 4, add(ibe, scale(vbei, GMIN)));
  branch(2, 4, ibex);
  branch(1, 4, transport);
  branch(3, 1, add(ibc, scale(vbci, GMIN)));
  branch(2, 6, iccp);
  return { residual };
}

/** A bounded, nominal-temperature, three-terminal VBIC DC device. */
export class VBIC implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = true;
  readonly params: VBICParams;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    supplied: Record<string, number>,
    polarity: number,
  ) {
    this.params = resolveVBICParams(supplied, polarity);
    if (nodes.length !== 7) throw new Error('Bounded VBIC DC device requires seven internal nodes');
  }

  limitNewtonStep(previous: Float64Array, candidate: Float64Array): number {
    const [cx, ci, bx, bi, ei, bp, si] = this.nodes;
    const voltage = (solution: Float64Array, node: number): number =>
      node >= 0 ? solution[node] : 0;
    const junction = (solution: Float64Array, positive: number, negative: number): number =>
      voltage(solution, positive) - voltage(solution, negative);
    const scale = (positive: number, negative: number, current: number): number =>
      junctionStepScale(
        junction(candidate, positive, negative),
        junction(previous, positive, negative),
        Math.max(current, Number.MIN_VALUE),
      );

    return Math.min(
      scale(bi, ei, this.params.IS),
      scale(bx, ei, this.params.IBEI + this.params.IBEN),
      scale(bi, ci, this.params.IS),
      scale(bi, cx, this.params.IBCI + this.params.IBCN),
      scale(bx, bp, this.params.ISP),
      scale(si, bp, this.params.ISP),
    );
  }

  stamp(ctx: StampContext): void {
    const voltages = this.nodes.map(node => node >= 0 ? ctx.getVoltage(node) : 0);
    const { residual } = evaluate(voltages, this.params);
    for (let row = 0; row < this.nodes.length; row += 1) {
      const matrixRow = this.nodes[row];
      if (matrixRow < 0) continue;
      let rhs = -residual[row].value;
      for (let column = 0; column < this.nodes.length; column += 1) {
        const derivative = residual[row].derivative[column];
        rhs += derivative * voltages[column];
        const matrixColumn = this.nodes[column];
        // Stamp zero derivatives too so the first assembly pass locks the full
        // nonlinear Jacobian pattern used by later Newton iterations.
        if (matrixColumn >= 0) ctx.stampG(matrixRow, matrixColumn, derivative);
      }
      ctx.stampB(matrixRow, rhs);
    }
  }
}
