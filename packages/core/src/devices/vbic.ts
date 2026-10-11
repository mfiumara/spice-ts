import { InvalidCircuitError } from '../errors.js';
import type { DeviceModel, StampContext } from './device.js';

const VT = 1.380662e-23 * 300.15 / 1.602189e-19;
const GMIN = 1e-12;
const ACTIVE_PARAMETERS = [
  'IS', 'IBEI', 'IBEN', 'IBCI', 'IBCN', 'ISP',
  'RCX', 'RCI', 'RBX', 'RBI', 'RE', 'RS', 'RBP',
  'VEF', 'VER', 'IKF', 'IKR', 'IKP', 'VO', 'GAMM', 'HRCF', 'AVC1', 'AVC2',
] as const;
/**
 * Charge-storage and excess-phase parameters: inert at DC, active in the
 * small-signal (.ac/.pz) linearization. RTH stays electrically inert: a
 * four-terminal instance has no thermal terminal, so ngspice ties the thermal
 * node to ground and self-heating cannot change any node voltage.
 */
const DC_INERT_PARAMETERS = [
  'CJE', 'CJC', 'CJEP', 'CJCP', 'QCO', 'TF', 'TR', 'TD', 'ITF', 'XTF', 'RTH',
] as const;
const SUPPORTED_PARAMETERS = new Set<string>([
  'LEVEL', ...ACTIVE_PARAMETERS, ...DC_INERT_PARAMETERS,
]);
/** VBIC 1.2 defaults for parameters outside the bounded subset (ngspice vbicsetup.c). */
const PE = 0.75;
const ME = 0.33;
const PC = 0.75;
const MC = 0.33;
const PS = 0.75;
const MS = 0.33;

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
      throw new InvalidCircuitError(`Unsupported bounded VBIC DC model parameter: '${name}'`);
    }
  }
  if ((supplied.LEVEL ?? 4) !== 4) {
    throw new InvalidCircuitError(`Unsupported bounded VBIC model level: ${supplied.LEVEL}`);
  }
  if (polarity !== 1) {
    throw new InvalidCircuitError('Unsupported bounded VBIC polarity: only NPN LEVEL=4 is supported');
  }
  const resolved = { ...DEFAULTS, ...supplied, LEVEL: 4, polarity: 1 } as VBICParams;
  for (const name of [...ACTIVE_PARAMETERS, ...DC_INERT_PARAMETERS]) {
    if (!Number.isFinite(resolved[name])) {
      throw new InvalidCircuitError(`Invalid bounded VBIC DC model parameter: '${name}'`);
    }
  }
  for (const name of [
    'IS', 'IBEI', 'IBEN', 'IBCI', 'IBCN', 'ISP',
    'RCX', 'RBX', 'RE', 'RS', 'VEF', 'VER', 'IKF', 'IKR', 'IKP',
    'VO', 'GAMM', 'AVC1', 'AVC2', ...DC_INERT_PARAMETERS,
  ] as const) {
    if (resolved[name] < 0) throw new InvalidCircuitError(`Invalid bounded VBIC DC model parameter: '${name}'`);
  }
  for (const name of ['RCI', 'RBI', 'RBP', 'HRCF'] as const) {
    if (resolved[name] <= 0) throw new InvalidCircuitError(`Invalid bounded VBIC DC model parameter: '${name}'`);
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

/** Per local node; derivatives are with respect to the {@link BRANCHES} voltages. */
interface Evaluation {
  /** Static currents leaving each device node. */
  residual: Dual[];
  /** Stored charge attached to each device node (ngspice vbicload charges). */
  charge: Dual[];
}

/** Local node order: seven VBIC nodes, then the excess-phase nodes when TD > 0. */
const CX = 0;
const CI = 1;
const BX = 2;
const BI = 3;
const EI = 4;
const BP = 5;
const SI = 6;
const XF1 = 7;
const XF2 = 8;

/**
 * Branch-voltage order of the model evaluation (ngspice vbicload.c): the six
 * pn junctions that DEVpnjlim limits, the three internal resistor branches,
 * then the excess-phase node voltages when TD > 0. ngspice treats these as
 * independent variables: each junction is limited on its own, so a limited
 * linearization point need not be a consistent set of node voltages.
 */
const BRANCHES: readonly (readonly [positive: number, negative: number])[] = [
  [BI, EI], // Vbei
  [BX, EI], // Vbex
  [BI, CI], // Vbci
  [BI, CX], // Vbcx
  [BX, BP], // Vbep
  [SI, BP], // Vbcp
  [CX, CI], // Vrci
  [BX, BI], // Vrbi
  [BP, CX], // Vrbp
];
const JUNCTION_COUNT = 6;
const NO_NODE = -1;
const EXCESS_PHASE_BRANCHES: readonly (readonly [number, number])[] = [[XF1, NO_NODE], [XF2, NO_NODE]];

/** ngspice-47 devsup.c DEVpnjlim. */
function pnjlim(voltage: number, previous: number, criticalVoltage: number): number {
  if (voltage > criticalVoltage && Math.abs(voltage - previous) > 2 * VT) {
    if (previous > 0) {
      const ratio = (voltage - previous) / VT;
      return ratio > 0
        ? previous + VT * (2 + Math.log(ratio - 2))
        : previous - VT * (2 + Math.log(2 - ratio));
    }
    return VT * Math.log(voltage / VT);
  }
  if (voltage < 0) {
    const minimum = previous > 0 ? -previous - 1 : 2 * previous - 1;
    return Math.max(voltage, minimum);
  }
  return voltage;
}

/**
 * Evaluate the isothermal VBIC 1.2 currents and charges at nominal temperature.
 * Charges follow ngspice vbic_4T_et_cf_fj with AJE/AJC/AJS <= 0, WBE = WSP = 1,
 * QTF = VTF = CBEO = CBCO = CCSO = 0. With TD > 0 the forward transport current
 * passes through ngspice's second-order excess-phase network (nodes xf1/xf2).
 */
function evaluate(voltages: readonly number[], params: VBICParams): Evaluation {
  const size = voltages.length;
  const nodeCount = size === BRANCHES.length ? XF1 : XF2 + 1;
  const excessPhase = nodeCount > XF2;
  const b = voltages.map((value, index) => Dual.variable(value, size, index));
  const [vbei, vbex, vbci, vbcx, vbep, vbcp, vrci, vrbi, vrbp] = b;
  const xf1 = b[BRANCHES.length];
  const xf2 = b[BRANCHES.length + 1];

  const ifi = diode(vbei, params.IS, 1);
  const iri = diode(vbci, params.IS, 1);
  const qdbe = depletionCharge(vbei, PE, ME);
  const qdbc = depletionCharge(vbci, PC, MC);
  const q1z = add(c(1, size), add(
    scale(qdbe, reciprocalOrZero(params.VER)),
    scale(qdbc, reciprocalOrZero(params.VEF)),
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
    sqrt(add(mul(sub(c(PC, size), vbci), sub(c(PC, size), vbci)), c(0.01, size))),
    sub(c(PC, size), vbci),
  ), 0.5);
  const avalanche = scale(mul(
    avalancheVoltage,
    exp(scale(pow(avalancheVoltage, MC - 1), -params.AVC2)),
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

  // ngspice: Iciei = Itxf - Itzr, with Itxf = V(xf2) when excess phase is on.
  const iciei = excessPhase ? sub(xf2, itzr) : transport;

  // Forward transit time with ITF/XTF bias dependence (QTF = VTF = 0).
  const forwardPositive = ifi.value > 0 ? 1 : 0;
  const relativeForward = scale(ifi, forwardPositive * reciprocalOrZero(params.ITF));
  const highCurrent = div(relativeForward, add(relativeForward, c(1, size)));
  const tff = scale(
    add(c(1, size), scale(
      add(c(params.ITF > 0 ? 0 : 1, size), mul(highCurrent, highCurrent)),
      params.XTF * forwardPositive,
    )),
    params.TF,
  );
  const qbe = add(scale(qdbe, params.CJE), div(mul(tff, ifi), qb));
  const qbc = add(add(scale(qdbc, params.CJC), scale(iri, params.TR)), scale(kbci, params.QCO));
  const qbcx = scale(kbcx, params.QCO);
  const qbep = add(scale(depletionCharge(vbep, PC, MC), params.CJEP), scale(ifp, params.TR));
  const qbcp = params.CJCP > 0 ? scale(depletionCharge(vbcp, PS, MS), params.CJCP) : c(0, size);

  const residual = Array.from({ length: nodeCount }, () => c(0, size));
  const charge = Array.from({ length: nodeCount }, () => c(0, size));
  const branch = (from: number, to: number, current: Dual): void => {
    residual[from] = add(residual[from], current);
    residual[to] = sub(residual[to], current);
  };
  const store = (from: number, to: number, stored: Dual): void => {
    charge[from] = add(charge[from], stored);
    charge[to] = sub(charge[to], stored);
  };
  // ngspice vbicload.c adds CKTgmin to Ibe, Ibex, Ibc, Ibep, Ibcp and to
  // Irci (via Vrci, Vbci and Vbcx). Ibep/Ibcp diode currents are zero in the
  // bounded subset (IBEIP/IBENP/IBCIP/IBCNP unsupported), leaving only gmin.
  branch(CX, CI, add(irci, scale(add(add(vrci, vbci), vbcx), GMIN)));
  branch(BX, BI, irbi);
  branch(BP, CX, irbp);
  branch(BI, EI, add(ibe, scale(vbei, GMIN)));
  branch(BX, EI, add(ibex, scale(vbex, GMIN)));
  branch(CI, EI, iciei);
  branch(BI, CI, add(ibc, scale(vbci, GMIN)));
  branch(BX, BP, scale(vbep, GMIN));
  branch(SI, BP, scale(vbcp, GMIN));
  branch(BX, SI, iccp);
  store(BI, EI, qbe);
  store(BI, CI, qbc);
  store(BI, CX, qbcx);
  store(BX, BP, qbep);
  store(SI, BP, qbcp);
  if (excessPhase) {
    residual[XF1] = sub(xf2, itzf);
    residual[XF2] = sub(xf2, xf1);
    charge[XF1] = scale(xf1, params.TD);
    charge[XF2] = scale(xf2, params.TD / 3);
  }
  return { residual, charge };
}

/** Number of device nodes: seven VBIC nodes plus xf1/xf2 when excess phase is on. */
export function vbicNodeCount(params: Pick<VBICParams, 'TD'>): number {
  return params.TD > 0 ? 9 : 7;
}

/** A bounded, nominal-temperature, four-terminal VBIC device (DC, AC, PZ). */
export class VBIC implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = true;
  readonly params: VBICParams;
  /** Local (positive, negative) node pair of each evaluation branch voltage. */
  private readonly branchTerminals: readonly (readonly [number, number])[];
  /** ngspice vbictemp.c tVcrit, from IS: shared by all six junctions. */
  private readonly criticalVoltage: number;
  /** Junction voltages linearized at the last load (ngspice CKTstate0). */
  private junctions: Float64Array | undefined;
  /** Whether the last stamp limited a junction (ngspice CKTnoncon). */
  private limited = false;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    supplied: Record<string, number>,
    polarity: number,
  ) {
    this.params = resolveVBICParams(supplied, polarity);
    const expected = vbicNodeCount(this.params);
    if (nodes.length !== expected) {
      throw new InvalidCircuitError(`Bounded VBIC device requires ${expected} internal nodes`);
    }
    this.branchTerminals = expected > XF1 ? [...BRANCHES, ...EXCESS_PHASE_BRANCHES] : BRANCHES;
    this.criticalVoltage = VT * Math.log(VT / (Math.SQRT2 * this.params.IS));
  }

  /** Branch voltages of the evaluation, in {@link BRANCHES} order. */
  private branchVoltages(ctx: StampContext): number[] {
    const voltage = (local: number): number => {
      const node = local === NO_NODE ? -1 : this.nodes[local];
      return node >= 0 ? ctx.getVoltage(node) : 0;
    };
    return this.branchTerminals.map(([positive, negative]) => voltage(positive) - voltage(negative));
  }

  /** Map branch-voltage derivatives onto the device's local node columns. */
  private nodeJacobian(quantity: Dual): Float64Array {
    const jacobian = new Float64Array(this.nodes.length);
    this.branchTerminals.forEach(([positive, negative], index) => {
      const derivative = quantity.derivative[index];
      jacobian[positive] += derivative;
      if (negative !== NO_NODE) jacobian[negative] -= derivative;
    });
    return jacobian;
  }

  /**
   * ngspice vbicload.c: the first load of an operating point (MODEINITJCT)
   * starts the junctions at tVcrit; every later load limits each junction
   * voltage on its own with DEVpnjlim against the voltage linearized at the
   * previous load (CKTstate0), and reports a limited iterate as unconverged.
   */
  private limitJunctions(voltages: number[]): void {
    const previous = this.junctions;
    if (previous === undefined) {
      const vcrit = this.criticalVoltage;
      voltages.fill(0);
      voltages[0] = vcrit; // Vbei
      voltages[1] = vcrit; // Vbex
      voltages[2] = -vcrit; // Vbci
      voltages[5] = -vcrit; // Vbcp = Vbc - Vbe
      this.junctions = Float64Array.from(voltages.slice(0, JUNCTION_COUNT));
      this.limited = true;
      return;
    }
    this.limited = false;
    for (let index = 0; index < JUNCTION_COUNT; index += 1) {
      const limited = pnjlim(voltages[index], previous[index], this.criticalVoltage);
      if (limited !== voltages[index]) this.limited = true;
      voltages[index] = limited;
      previous[index] = limited;
    }
  }

  limitedLastStamp(): boolean {
    return this.limited;
  }

  stamp(ctx: StampContext): void {
    const voltages = this.branchVoltages(ctx);
    this.limitJunctions(voltages);
    const { residual } = evaluate(voltages, this.params);
    for (let row = 0; row < this.nodes.length; row += 1) {
      const matrixRow = this.nodes[row];
      if (matrixRow < 0) continue;
      // Linearize about the limited branch voltages: I(v) ~ I(vl) + dI/dv (v - vl).
      let rhs = -residual[row].value;
      for (let index = 0; index < voltages.length; index += 1) {
        rhs += residual[row].derivative[index] * voltages[index];
      }
      const jacobian = this.nodeJacobian(residual[row]);
      for (let column = 0; column < this.nodes.length; column += 1) {
        const matrixColumn = this.nodes[column];
        // Stamp zero derivatives too so the first assembly pass locks the full
        // nonlinear Jacobian pattern used by later Newton iterations.
        if (matrixColumn >= 0) ctx.stampG(matrixRow, matrixColumn, jacobian[column]);
      }
      ctx.stampB(matrixRow, rhs);
    }
  }

  /**
   * Small-signal charge Jacobian dQ/dV at the operating point, the real-valued
   * counterpart of ngspice VBICacLoad/VBICpzLoad capacitive stamps. Only the
   * linearized AC and pole-zero analyses reach this: transient stays rejected.
   */
  stampDynamic(ctx: StampContext): void {
    const { charge } = evaluate(this.branchVoltages(ctx), this.params);
    for (let row = 0; row < this.nodes.length; row += 1) {
      const matrixRow = this.nodes[row];
      if (matrixRow < 0) continue;
      const jacobian = this.nodeJacobian(charge[row]);
      for (let column = 0; column < this.nodes.length; column += 1) {
        const matrixColumn = this.nodes[column];
        const capacitance = jacobian[column];
        if (matrixColumn >= 0 && capacitance !== 0) ctx.stampC(matrixRow, matrixColumn, capacitance);
      }
    }
  }
}
