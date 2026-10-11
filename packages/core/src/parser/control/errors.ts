import { ParseError, SpiceError } from '../../errors.js';

/**
 * Thrown for an ngspice control-language command (or a command form, function,
 * vector or variable) that spice-ts does not execute. Raised while parsing the
 * `.control` block when the command name alone decides it, and while running the
 * script when only the arguments do (for example `alter` on a device inside a
 * subcircuit). Never silently ignored.
 */
export class UnsupportedControlCommandError extends ParseError {
  /** Stable machine-readable error code. */
  readonly code = 'UNSUPPORTED_CONTROL_COMMAND';

  constructor(
    /** Control-language command name as written, e.g. `meas`. */
    public readonly command: string,
    /** Why this command (or this form of it) is not executed. */
    public readonly reason: string,
    line: number,
    context: string,
  ) {
    super(`Unsupported .control command '${command}': ${reason}`, line, context);
    this.name = 'UnsupportedControlCommandError';
  }
}

/**
 * Thrown when a supported control-language command fails while the script runs
 * (unknown vector, bad expression, index out of range, ...). ngspice prints such
 * errors and continues; spice-ts stops so a wrong result is never returned.
 */
export class ControlScriptError extends SpiceError {
  /** Stable machine-readable error code. */
  readonly code = 'CONTROL_SCRIPT_ERROR';

  constructor(
    message: string,
    /** 1-based line number of the control command */
    public readonly line: number,
    /** Text of the control command */
    public readonly context: string,
  ) {
    super(`Control script error at line ${line}: ${message}\n  ${context}`);
    this.name = 'ControlScriptError';
  }
}

/**
 * Thrown when a `.control` script ends with a non-zero `quit`/`exit` status,
 * which ngspice's own regression decks use to report a failed self-check.
 * ngspice exits with that status in batch mode, so spice-ts fails the run too.
 */
export class ControlScriptExitError extends SpiceError {
  /** Stable machine-readable error code. */
  readonly code = 'CONTROL_SCRIPT_EXIT';

  constructor(
    /** The status passed to `quit`/`exit`. */
    public readonly exitCode: number,
    /** 1-based line number of the `quit`/`exit` command */
    public readonly line: number,
    /** Lines the script printed with `echo` before exiting. */
    public readonly output: readonly string[],
  ) {
    const tail = output.slice(-5).map(text => `\n  ${text}`).join('');
    super(`.control script exited with status ${exitCode} at line ${line}${tail}`);
    this.name = 'ControlScriptExitError';
  }
}
