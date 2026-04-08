export class SpiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpiceError';
  }
}

export class ParseError extends SpiceError {
  constructor(
    message: string,
    public readonly line: number,
    public readonly context: string,
  ) {
    super(`Parse error at line ${line}: ${message}\n  ${context}`);
    this.name = 'ParseError';
  }
}

export class InvalidCircuitError extends SpiceError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCircuitError';
  }
}

export class SingularMatrixError extends SpiceError {
  constructor(
    message: string,
    public readonly involvedNodes: string[],
  ) {
    super(`Singular matrix: ${message} (nodes: ${involvedNodes.join(', ')})`);
    this.name = 'SingularMatrixError';
  }
}

export class ConvergenceError extends SpiceError {
  constructor(
    message: string,
    public readonly time: number | undefined,
    public readonly oscillatingNodes: string[],
    public readonly lastSolution: Float64Array,
    public readonly prevSolution: Float64Array,
  ) {
    super(
      `Convergence failed${time !== undefined ? ` at t=${time}` : ''}: ${message}` +
        (oscillatingNodes.length > 0 ? ` (oscillating nodes: ${oscillatingNodes.join(', ')})` : ''),
    );
    this.name = 'ConvergenceError';
  }
}

export class TimestepTooSmallError extends SpiceError {
  constructor(
    public readonly time: number,
    public readonly timestep: number,
  ) {
    super(`Timestep too small at t=${time}: dt=${timestep}`);
    this.name = 'TimestepTooSmallError';
  }
}
