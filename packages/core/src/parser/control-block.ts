import { tokenizeNetlist } from './tokenizer.js';
import type { ControlScript } from './control/script.js';

/**
 * ngspice `.control` … `.endc` contract.
 *
 * A deck's control blocks are parsed into a {@link ControlScript}. Scripts made
 * only of straight-line analysis commands are lowered onto dot cards here; every
 * other script is executed by the control-language interpreter when the deck is
 * simulated (`parser/control/interpreter.ts`).
 *
 * Lowering (#489): the analysis commands `op`, `dc`, `tran` and `ac` take the
 * same arguments as the dot cards and are mapped onto the same analyses, so a
 * deck that runs `tran 1n 1u` from `.control` behaves like one with
 * `.tran 1n 1u`. Bare `run`, output-only commands and plot-styling `set`
 * variables (`colorN`, `xbrushwidth`, `xgridwidth`) do not change any result.
 * A script is lowered only when each analysis type appears once across the
 * control commands and the dot cards, so one result field holds one analysis.
 */
const LOWERED_OUTPUT_COMMANDS = new Set([
  'asciiplot', 'display', 'echo', 'exit', 'listing', 'plot', 'print', 'quit', 'rusage', 'settype',
]);

const LOWERED_ANALYSIS_COMMANDS = new Map([
  ['op', '.OP'], ['dc', '.DC'], ['tran', '.TRAN'], ['ac', '.AC'],
]);

/** `set` arguments that only style plots (`set color0=white`, `set xbrushwidth=3`). */
const PLOT_STYLE_SETTING = /^(?:color\d+|xbrushwidth|xgridwidth)=\S+$/i;

/** One lowered control analysis: the tokens of its equivalent dot card. */
export interface LoweredControlAnalysis {
  analysisType: 'op' | 'dc' | 'tran' | 'ac';
  dotCardTokens: string[];
  lineNumber: number;
  context: string;
}

/**
 * Lower a straight-line control script onto dot-card analyses, or return null
 * when the script needs the interpreter.
 *
 * @param dotAnalysisTypes - Analysis types the deck's dot cards already request
 */
export function lowerControlScript(
  script: ControlScript,
  dotAnalysisTypes: ReadonlySet<string>,
): LoweredControlAnalysis[] | null {
  const lowered: LoweredControlAnalysis[] = [];
  const types = new Set(dotAnalysisTypes);
  for (const statement of script.statements) {
    if (statement.kind !== 'command') return null;
    const { name, line } = statement;
    if (/[$`{]/.test(line.text)) return null;
    const dotCard = LOWERED_ANALYSIS_COMMANDS.get(name);
    if (dotCard !== undefined) {
      if (types.has(name)) return null;
      types.add(name);
      const tokens = tokenizeNetlist(line.text)[0]?.tokens ?? [];
      lowered.push({
        analysisType: name as LoweredControlAnalysis['analysisType'],
        dotCardTokens: [dotCard, ...tokens.slice(1)],
        lineNumber: line.lineNumber,
        context: line.text,
      });
      continue;
    }
    if (name === 'run' && line.text.trim().toLowerCase() === 'run') continue;
    if (name === 'set' && isPlotStyleSetting(line.text.slice(3))) continue;
    if (LOWERED_OUTPUT_COMMANDS.has(name)) continue;
    return null;
  }
  return lowered;
}

/**
 * True when a `set` line only styles plots: it has at least one assignment and
 * every assignment is a plot-styling variable.
 */
function isPlotStyleSetting(args: string): boolean {
  const assignments = args.replace(/\s*=\s*/g, '=').trim().split(/\s+/).filter(Boolean);
  return assignments.length > 0 && assignments.every(assignment => PLOT_STYLE_SETTING.test(assignment));
}
