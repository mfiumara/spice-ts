/**
 * Base class for all spice-ts errors.
 */
export class SpiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpiceError';
  }
}

/**
 * Thrown when a netlist cannot be parsed due to syntax errors.
 *
 * Contains the line number and raw text of the offending line.
 */
export class ParseError extends SpiceError {
  constructor(
    message: string,
    /** 1-based line number where the error occurred */
    public readonly line: number,
    /** Raw text of the line that caused the error */
    public readonly context: string,
  ) {
    super(`Parse error at line ${line}: ${message}\n  ${context}`);
    this.name = 'ParseError';
  }
}

/**
 * Thrown when the circuit structure is invalid (e.g., no nodes or no analysis command).
 */
export class InvalidCircuitError extends SpiceError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCircuitError';
  }
}

/**
 * Thrown when the MNA system matrix is singular and cannot be solved.
 *
 * Typically indicates a topology error such as a voltage source loop
 * or a floating node.
 */
export class SingularMatrixError extends SpiceError {
  constructor(
    message: string,
    /** Node names involved in the singularity */
    public readonly involvedNodes: string[],
  ) {
    super(`Singular matrix: ${message} (nodes: ${involvedNodes.join(', ')})`);
    this.name = 'SingularMatrixError';
  }
}

/** Discriminator for {@link ConvergenceError} subclasses. */
export type ConvergenceFailureKind = 'nr-divergence' | 'lte-cascade' | 'dt-floor';

/**
 * Thrown when Newton-Raphson iteration fails to converge within the
 * allowed number of iterations, when LTE rejects too many steps in a row,
 * or when the adaptive timestep shrinks below the floor.
 *
 * Contains diagnostic information including the oscillating nodes,
 * the last two solution vectors, the timestep and GMIN value in effect,
 * and a `kind` discriminator identifying the failure mode.
 */
export class ConvergenceError extends SpiceError {
  public readonly kind: ConvergenceFailureKind;

  constructor(
    message: string,
    /** Simulation time at which convergence failed (undefined for DC) */
    public readonly time: number | undefined,
    /** Nodes that were oscillating at the time of failure */
    public readonly oscillatingNodes: string[],
    /** Solution vector from the last iteration */
    public readonly lastSolution: Float64Array,
    /** Solution vector from the second-to-last iteration */
    public readonly prevSolution: Float64Array,
    /** Failure mode discriminator. Defaults to `'nr-divergence'`. */
    kind: ConvergenceFailureKind = 'nr-divergence',
    /** Timestep in effect when the failure occurred (undefined for DC) */
    public readonly dt?: number,
    /** GMIN value in effect at the time of failure */
    public readonly gmin?: number,
  ) {
    super(
      `Convergence failed${time !== undefined ? ` at t=${time}` : ''}: ${message}` +
        (oscillatingNodes.length > 0 ? ` (oscillating nodes: ${oscillatingNodes.join(', ')})` : ''),
    );
    this.name = 'ConvergenceError';
    this.kind = kind;
  }
}

/**
 * Thrown during transient analysis when the adaptive timestep shrinks
 * below the minimum threshold (see `MIN_TIMESTEP` in `transient-driver.ts`).
 *
 * Subclass of {@link ConvergenceError} with `kind === 'dt-floor'`.
 */
export class TimestepTooSmallError extends ConvergenceError {
  constructor(
    /** Simulation time at which the error occurred */
    time: number,
    /** The timestep that was too small */
    public readonly timestep: number,
  ) {
    super(
      `Timestep too small: dt=${timestep}`,
      time, [], new Float64Array(0), new Float64Array(0),
      'dt-floor', timestep, undefined,
    );
    this.name = 'TimestepTooSmallError';
    // Override the message to preserve the old format verbatim so string
    // comparisons in consumer code keep working.
    this.message = `Timestep too small at t=${time}: dt=${timestep}`;
  }
}

/**
 * Thrown when a circular dependency is detected in `.include`/`.lib`
 * directives or subcircuit instantiation.
 */
export class CycleError extends SpiceError {
  constructor(
    /** The dependency chain that forms the cycle */
    public readonly chain: string[],
  ) {
    super(`Circular dependency detected: ${chain.join(' → ')}`);
    this.name = 'CycleError';
  }
}
