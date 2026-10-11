import { ParseError } from '../errors.js';

/**
 * ngspice `.control` … `.endc` contract.
 *
 * spice-ts does not interpret the ngspice control language. It accepts a bounded
 * subset of commands whose effect it reproduces exactly:
 *
 * - The analysis commands `op`, `dc`, `tran` and `ac` (#489). They take the same
 *   arguments as the dot cards and are mapped onto the same analyses, so a deck
 *   that runs `tran 1n 1u` from `.control` behaves like one with `.tran 1n 1u`.
 *   A simulation result holds one vector set per analysis type, so a type may be
 *   requested only once per deck (dot card or control command); a repeat is
 *   rejected rather than silently overwriting the earlier vectors.
 * - Bare `run`, which executes the deck's dot-card analyses (which `simulate()`
 *   always does).
 * - Output-only commands: they format, display, report or exit after
 *   already-computed vectors and cannot change any simulated value. spice-ts
 *   returns every computed vector through its result API, so these are
 *   recognized and not executed. `set` counts as output-only only for the
 *   plot-styling variables matched by {@link PLOT_STYLE_SETTING}.
 *
 * Every other command (`let`, other `set` variables, `alter`, `meas`,
 * `linearize`, `fft`, `reset`, other analyses, control flow, circuit
 * management, file output, …) could add, change or derive results, so it is
 * rejected with a structured {@link ParseError} naming the command instead of
 * being silently dropped.
 */
const OUTPUT_ONLY_CONTROL_COMMANDS = new Set([
  'ASCIIPLOT', 'DISPLAY', 'ECHO', 'EXIT', 'LISTING', 'PLOT', 'PRINT', 'QUIT', 'RUSAGE', 'SETTYPE',
]);

/** Control analysis commands and the dot card each one maps onto. */
const CONTROL_ANALYSIS_COMMANDS = new Map([
  ['OP', '.OP'], ['DC', '.DC'], ['TRAN', '.TRAN'], ['AC', '.AC'],
]);

/** `set` arguments that only style plots (`set color0=white`, `set xbrushwidth=3`). */
const PLOT_STYLE_SETTING = /^(?:color\d+|xbrushwidth|xgridwidth)=\S+$/i;

const CONTROL_CONTRACT =
  "only the analysis commands 'op', 'dc', 'tran', 'ac', bare 'run', 'set' of the plot-styling variables "
  + "'colorN', 'xbrushwidth', 'xgridwidth' and the output-only commands "
  + `${[...OUTPUT_ONLY_CONTROL_COMMANDS].map(command => `'${command.toLowerCase()}'`).join(', ')} `
  + 'are accepted; spice-ts does not interpret ngspice control-language commands that could change results';

/** How spice-ts handles one accepted `.control` command. */
export type ControlCommand =
  | { kind: 'ignored' }
  /** An analysis command, rewritten as the tokens of its equivalent dot card. */
  | { kind: 'analysis'; analysisType: 'op' | 'dc' | 'tran' | 'ac'; dotCardTokens: string[] };

/**
 * Classify one command line inside a `.control` block.
 *
 * @throws {@link ParseError} naming the command when it is outside the accepted subset
 */
export function classifyControlCommand(tokens: string[], lineNumber: number, context: string): ControlCommand {
  const command = tokens[0].toUpperCase();
  const dotCard = CONTROL_ANALYSIS_COMMANDS.get(command);
  if (dotCard !== undefined) {
    return {
      kind: 'analysis',
      analysisType: command.toLowerCase() as 'op' | 'dc' | 'tran' | 'ac',
      dotCardTokens: [dotCard, ...tokens.slice(1)],
    };
  }
  if (command === 'RUN' && tokens.length === 1) return { kind: 'ignored' };
  if (command === 'SET' && isPlotStyleSetting(tokens.slice(1))) return { kind: 'ignored' };
  if (OUTPUT_ONLY_CONTROL_COMMANDS.has(command)) return { kind: 'ignored' };
  throw new ParseError(
    `Unsupported .control command '${tokens[0]}': ${CONTROL_CONTRACT}`,
    lineNumber,
    context,
  );
}

function isPlotStyleSetting(args: string[]): boolean {
  return PLOT_STYLE_SETTING.test(args.join(''));
}

/** Structured error for a control analysis whose type the deck already requests. */
export function repeatedControlAnalysisError(analysisType: string, lineNumber: number, context: string): ParseError {
  return new ParseError(
    `Unsupported repeated '${analysisType}' analysis in .control: spice-ts returns one result per analysis type, `
    + 'so each of op/dc/tran/ac may be requested once per deck (dot card or control command)',
    lineNumber,
    context,
  );
}
