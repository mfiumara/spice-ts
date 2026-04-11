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

/**
 * Thrown when Newton-Raphson iteration fails to converge within the
 * allowed number of iterations.
 *
 * Contains diagnostic information including the oscillating nodes
 * and the last two solution vectors.
 */
export class ConvergenceError extends SpiceError {
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
  ) {
    super(
      `Convergence failed${time !== undefined ? ` at t=${time}` : ''}: ${message}` +
        (oscillatingNodes.length > 0 ? ` (oscillating nodes: ${oscillatingNodes.join(', ')})` : ''),
    );
    this.name = 'ConvergenceError';
  }
}

/**
 * Thrown during transient analysis when the adaptive timestep shrinks
 * below the minimum threshold (1e-18 s).
 */
export class TimestepTooSmallError extends SpiceError {
  constructor(
    /** Simulation time at which the error occurred */
    public readonly time: number,
    /** The timestep that was too small */
    public readonly timestep: number,
  ) {
    super(`Timestep too small at t=${time}: dt=${timestep}`);
    this.name = 'TimestepTooSmallError';
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
