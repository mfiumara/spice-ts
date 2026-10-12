import type { ConvergenceTolerances, DeviceModel, StampContext } from './device.js';
import {
  BehavioralRangeError,
  type BehavioralEnvironment,
  type BehavioralInstanceParams,
  type CompiledBehavioralExpression,
} from '../parser/behavioral-expression.js';
import { InvalidCircuitError } from '../errors.js';

/** ngspice ASRC nominal temperature (300.15 K) in Celsius. */
const NOMINAL_TEMPERATURE = 27;

/**
 * State shared by the ngspice `B` source forms (ASRC): control-node
 * voltages, the expression gradient, the simulator environment and the
 * `tc1`/`tc2` temperature factor of asrcload.c.
 *
 * `nodes` is `[positive, negative, ...controlNodes]`, where the control nodes
 * are indexed like `expression.nodes`.
 */
export abstract class BehavioralSource implements DeviceModel {
  abstract readonly branches: number[];
  readonly isNonlinear = true;
  /** asrcload.c applies no limiting and ngspice no node damping. */
  readonly undampedNodes = true;
  protected readonly voltages: Float64Array;
  protected readonly gradient: Float64Array;
  private readonly environment: BehavioralEnvironment = {
    time: 0, transient: false, temperature: NOMINAL_TEMPERATURE,
  };
  /** ASRC `factor`: 1 + tc1*dT + tc2*dT^2, or its reciprocal with reciproctc=1. */
  protected factor = 1;
  /** Expression value at the last linearisation (ngspice ASRCprev_value). */
  private previousValue = 0;
  /** Branch indices of the `i()` sources, indexed like `expression.sources` (-1 until bound). */
  private readonly controlBranches: number[];
  /** MNA node count of the last stamp: branch unknown b sits at column numNodes + b. */
  private numNodes = 0;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    readonly expression: CompiledBehavioralExpression,
    readonly params: BehavioralInstanceParams = {},
  ) {
    const controls = expression.nodes.length + expression.sources.length;
    // `voltages` holds every control value: node voltages, then branch currents.
    this.voltages = new Float64Array(controls);
    this.gradient = new Float64Array(controls);
    this.controlBranches = expression.sources.map(() => -1);
    this.setTemperature(NOMINAL_TEMPERATURE);
  }

  abstract stamp(ctx: StampContext): void;

  /**
   * Bind the `i()` sources (ngspice PT_CURRENT via CKTfndBranch) to their
   * MNA branch indices, in `expression.sources` order.
   */
  bindControlBranches(branches: readonly number[]): void {
    branches.forEach((branch, i) => { this.controlBranches[i] = branch; });
  }

  /**
   * MNA column of control `i` (a node voltage or a branch current), or -1
   * for ground. Valid after {@link evaluate}.
   */
  protected controlColumn(i: number): number {
    const nodeCount = this.expression.nodes.length;
    return i < nodeCount ? this.nodes[i + 2] : this.numNodes + this.controlBranch(i - nodeCount);
  }

  private controlBranch(source: number): number {
    const branch = this.controlBranches[source];
    if (branch < 0) {
      throw new InvalidCircuitError(
        `B-source '${this.name}': i(${this.expression.sources[source]}) is not bound to a source branch`,
      );
    }
    return branch;
  }

  setTemperature(value: number): void {
    this.environment.temperature = value;
    const { tc1 = 0, tc2 = 0, temp, dtemp = 0 } = this.params;
    // asrctemp.c: an instance temp= replaces the circuit temperature and dtemp.
    const difference = (temp ?? value + dtemp) - NOMINAL_TEMPERATURE;
    const factor = 1 + tc1 * difference + tc2 * difference * difference;
    this.factor = this.params.reciproctc ? 1 / factor : factor;
  }

  getTemperature(): number {
    return this.environment.temperature;
  }

  /** Expression value at the last linearisation: ngspice ASRCprev_value, the `@b[i]` readout of the I= form. */
  get lastValue(): number {
    return this.previousValue;
  }

  /** Evaluate the expression at the present solution, filling `voltages` and `gradient`. */
  protected evaluate(ctx: StampContext): number {
    const nodeCount = this.expression.nodes.length;
    for (let i = 0; i < nodeCount; i++) {
      const node = this.nodes[i + 2];
      this.voltages[i] = node >= 0 ? ctx.getVoltage(node) : 0;
    }
    for (let i = nodeCount; i < this.voltages.length; i++) {
      this.voltages[i] = ctx.getCurrent(this.controlBranch(i - nodeCount));
    }
    this.numNodes = ctx.numNodes;
    this.environment.time = ctx.time;
    this.environment.transient = ctx.dt > 0;
    this.previousValue = this.evaluateExpression();
    return this.previousValue;
  }

  /**
   * ngspice ASRCconvTest: the expression evaluated at the new Newton solution
   * must match the value it was linearised at, within RELTOL plus VNTOL
   * (V= form) or ABSTOL (I= form).
   */
  convergenceTest(solution: Float64Array, tolerances: ConvergenceTolerances): boolean {
    for (let i = 0; i < this.voltages.length; i++) {
      const column = this.controlColumn(i);
      this.voltages[i] = column >= 0 ? solution[column] : 0;
    }
    const value = this.evaluateExpression();
    const previous = this.previousValue;
    const floor = this.branches.length > 0 ? tolerances.vntol : tolerances.abstol;
    return Math.abs(previous - value) <= tolerances.reltol * Math.max(Math.abs(value), Math.abs(previous)) + floor;
  }

  private evaluateExpression(): number {
    try {
      return this.expression.evaluate(this.voltages, this.gradient, this.environment);
    } catch (error) {
      if (error instanceof BehavioralRangeError) {
        throw new InvalidCircuitError(`B-source '${this.name}': ${error.message}`);
      }
      throw error;
    }
  }
}

/**
 * ngspice `B` source with an `I=` expression (ASRC current form).
 *
 * The current flows from the positive node through the source to the
 * negative node. Each Newton iteration linearises the expression with its
 * ngspice partial derivatives with respect to the controlling node voltages.
 */
export class BehavioralCurrentSource extends BehavioralSource {
  readonly branches: number[] = [];

  stamp(ctx: StampContext): void {
    const [positive, negative] = this.nodes;
    const current = this.evaluate(ctx);
    const { factor } = this;
    let equivalent = current;
    for (let i = 0; i < this.gradient.length; i++) {
      const node = this.controlColumn(i);
      const slope = this.gradient[i];
      equivalent -= slope * this.voltages[i];
      if (node < 0) continue;
      if (positive >= 0) ctx.stampG(positive, node, slope * factor);
      if (negative >= 0) ctx.stampG(negative, node, -slope * factor);
    }
    if (positive >= 0) ctx.stampB(positive, -factor * equivalent);
    if (negative >= 0) ctx.stampB(negative, factor * equivalent);
  }
}

/**
 * ngspice `B` source with a `V=` expression (ASRC voltage form): an MNA
 * branch forcing V(n+) - V(n-) to the linearised expression. The branch
 * current flows from n+ through the source to n-, as for a `V` source.
 */
export class BehavioralVoltageSource extends BehavioralSource {
  readonly branches: number[];
  readonly algebraicNodes: readonly number[];

  constructor(
    name: string,
    nodes: number[],
    readonly branchIndex: number,
    expression: CompiledBehavioralExpression,
    params: BehavioralInstanceParams = {},
  ) {
    super(name, nodes, expression, params);
    this.branches = [branchIndex];
    // A grounded V= source fixes its output node to the expression value.
    const [positive, negative] = nodes;
    this.algebraicNodes = negative < 0 && positive >= 0 ? [positive] : [];
  }

  stamp(ctx: StampContext): void {
    const [positive, negative] = this.nodes;
    const branch = ctx.numNodes + this.branchIndex;
    const voltage = this.evaluate(ctx);
    const { factor } = this;

    if (positive >= 0) {
      ctx.stampG(positive, branch, 1);
      ctx.stampG(branch, positive, 1);
    }
    if (negative >= 0) {
      ctx.stampG(negative, branch, -1);
      ctx.stampG(branch, negative, -1);
    }
    let equivalent = voltage;
    for (let i = 0; i < this.gradient.length; i++) {
      const node = this.controlColumn(i);
      const slope = this.gradient[i];
      equivalent -= slope * this.voltages[i];
      if (node >= 0) ctx.stampG(branch, node, -slope * factor);
    }
    ctx.stampB(branch, factor * equivalent);
  }
}
