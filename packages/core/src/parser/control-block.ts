import { ParseError } from '../errors.js';

/**
 * ngspice `.control` … `.endc` contract.
 *
 * spice-ts does not interpret the ngspice control language. A control block is
 * accepted only when every command in it is either `run` (execute the deck's
 * dot-card analyses, which `simulate()` always does) or output-only: it formats,
 * displays or exits after already-computed vectors and cannot change any
 * simulated value. spice-ts returns every computed vector through its result
 * API, so these commands are recognized and not executed.
 *
 * Every other command (analyses such as `op`/`ac`/`tran`, `let`, `set`,
 * `alter`, `meas`, control flow, circuit management, file output, …) could add,
 * change or derive results, so it is rejected with a structured
 * {@link ParseError} instead of being silently dropped.
 */
const OUTPUT_ONLY_CONTROL_COMMANDS = new Set([
  'ASCIIPLOT', 'DISPLAY', 'ECHO', 'EXIT', 'LISTING', 'PLOT', 'PRINT', 'QUIT',
]);

const CONTROL_CONTRACT =
  "only bare 'run' and the output-only commands "
  + `${[...OUTPUT_ONLY_CONTROL_COMMANDS].map(command => `'${command.toLowerCase()}'`).join(', ')} `
  + 'are accepted; spice-ts does not interpret ngspice control-language commands that could change results';

/** Validate one command line inside a `.control` block. */
export function validateControlCommand(tokens: string[], lineNumber: number, context: string): void {
  const command = tokens[0].toUpperCase();
  if (command === 'RUN' && tokens.length === 1) return;
  if (OUTPUT_ONLY_CONTROL_COMMANDS.has(command)) return;
  throw new ParseError(
    `Unsupported .control command '${tokens[0]}': ${CONTROL_CONTRACT}`,
    lineNumber,
    context,
  );
}
