import type { AnalysisDirective } from '../../types.js';
import type { MeasurementResult, SimulationResult } from '../../results.js';
import { getMeasure2, type MeasurePlot } from '../../measure/measure2.js';
import { gettokWords } from '../../measure/dot-measure.js';
import { inpEvaluate } from '../../measure/numparse.js';
import { tokenizeNetlist } from '../tokenizer.js';
import { ControlScriptError, ControlScriptExitError, UnsupportedControlCommandError } from './errors.js';
import type { ControlScript, ControlStatement } from './script.js';
import type { ControlSourceLine } from './source.js';
import {
  ExpressionError, UnsupportedExpressionFeature, evaluateVectorExpression, parseControlNumber, parseVectorExpression,
  type ExpressionEnvironment, type ExpressionNode,
} from './vector-expression.js';
import {
  complexVector, formatVector, isTrue, realVector, renamed, scalar, type ControlVector,
} from './vector.js';

/** One analysis the script ran, with the plot ngspice would have created for it. */
export interface ControlAnalysisRun {
  /** ngspice plot name, e.g. `tran1`, `dc3`, `noise2`. */
  plot: string;
  /** Analysis type (`op`, `dc`, `ac`, `tran`, `noise`, ...). */
  analysis: string;
  /** The result of that one analysis. */
  result: SimulationResult;
}

/** One solved analysis returned by the host. */
export interface ControlHostRun {
  directive: AnalysisDirective | { type: 'pz' };
  result: SimulationResult;
}

/**
 * What the interpreter needs from the simulator. Implemented in `simulate.ts`
 * against the deck's {@link Circuit}; every call that cannot be honoured throws
 * an {@link UnsupportedControlCommandError} itself.
 */
export interface ControlHost {
  /** Solve one analysis given as the tokens of its dot card (`['.TRAN', '1n', '1u']`). */
  runAnalysis(dotCardTokens: string[], line: ControlSourceLine): ControlHostRun;
  /** Solve the deck's own dot-card analyses (ngspice `run`). */
  runDeck(line: ControlSourceLine): ControlHostRun[];
  /** `alter`: set an instance parameter (`undefined` = the device's primary value). */
  alterInstance(device: string, parameter: string | undefined, values: number[], line: ControlSourceLine): void;
  /** `altermod`: set a `.model` parameter. */
  alterModel(model: string, parameter: string, value: number, line: ControlSourceLine): void;
  /** `@device[parameter]` / `@model[parameter]` input-parameter readout, or undefined when unavailable. */
  parameterVector(device: string, parameter: string): number[] | undefined;
  /** `option`/`set` of a simulator option: tokens as on a `.options` card. */
  setOptions(tokens: string[], line: ControlSourceLine): void;
}

export interface ControlScriptOutcome {
  /** Analyses in execution order. */
  runs: ControlAnalysisRun[];
  /** Lines printed by `echo`. */
  output: string[];
  /** True when the script ended with `quit`/`exit` (status 0): ngspice then skips the deck's own run. */
  quit: boolean;
  /** Every `meas` command the script ran, in order; ngspice prints a failed one and continues. */
  measurements: MeasurementResult[];
}

interface Plot {
  name: string;
  title: string;
  vectors: Map<string, ControlVector>;
  scale?: ControlVector;
  /** `save @device[param]` requests active when the plot was made: vectors spice-ts does not produce. */
  unproducedSaves: ReadonlySet<string>;
}

type VariableValue = string | string[] | true;

type Flow = 'next' | 'break' | 'continue';

class QuitSignal {
  constructor(readonly status: number, readonly line: ControlSourceLine) {}
}

const MAX_LOOP_ITERATIONS = 1_000_000;

/** `set` variables that ngspice forwards to the simulator as circuit options. */
const OPTION_VARIABLES = new Set([
  'temp', 'tnom', 'gmin', 'reltol', 'abstol', 'vntol', 'trtol', 'chgtol', 'pivtol', 'pivrel',
  'itl1', 'itl2', 'itl3', 'itl4', 'itl5', 'itl6', 'srcsteps', 'gminsteps', 'gminfactor', 'method', 'maxord',
  'noinit', 'noopiter', 'keepopinfo', 'rshunt', 'cshunt', 'xmu', 'bypass', 'defl', 'defw', 'defad', 'defas',
  'savecurrents', 'ramptime', 'seed',
]);

/** Front-end variables that change computed vectors in ways spice-ts does not reproduce. */
const RESULT_AFFECTING_VARIABLES: Record<string, string> = {
  sqrnoise: 'noise spectra in V^2/Hz are not produced',
  ngbehavior: 'compatibility modes change netlist interpretation',
  nobjthack: 'the BJT three-terminal hack is not implemented',
  notrnoise: 'transient noise switching is not implemented',
  rndseed: 'random-number seeding is not implemented',
  xtrtol: 'XSPICE truncation tolerance is not implemented',
  nosubckt: 'disabling subcircuit expansion is not implemented',
  dpolydegree: 'polynomial interpolation settings are not implemented',
  polydegree: 'polynomial interpolation settings are not implemented',
  polysteps: 'polynomial interpolation settings are not implemented',
  interp: 'raw-file interpolation is not implemented',
  specwindow: 'spectral windows are not implemented',
  specwindoworder: 'spectral windows are not implemented',
  strict_errorhandling: 'ngspice error-handling modes are not implemented',
};

/** ngspice `const` plot. */
function constantPlot(): Plot {
  const values: [string, number][] = [
    ['pi', Math.PI], ['e', Math.E], ['c', 299792458], ['kelvin', -273.15], ['echarge', 1.60219e-19],
    ['boltz', 1.38062e-23], ['planck', 6.62607e-34], ['yes', 1], ['no', 0], ['true', 1], ['false', 0],
  ];
  const vectors = new Map(values.map(([name, value]) => [name, scalar(value, name)]));
  vectors.set('i', complexVector('i', [0], [1]));
  return { name: 'const', title: 'Constant values', vectors, unproducedSaves: new Set() };
}

/**
 * Execute an ngspice `.control` script.
 *
 * Plots, vectors, variables and `define`d functions follow ngspice-47's front
 * end: analyses create plots named `<type><n>` (n from one counter, bumped only
 * on a name clash), unqualified names resolve in the current plot then in
 * `const`, and `plot.vector` reaches any plot. Errors stop the script with a
 * {@link ControlScriptError}; unsupported forms with an
 * {@link UnsupportedControlCommandError}.
 */
export function runControlScript(script: ControlScript, host: ControlHost): ControlScriptOutcome {
  return new ControlInterpreter(host).run(script);
}

class ControlInterpreter {
  private readonly plots: Plot[] = [constantPlot()];
  private current: Plot = this.plots[0];
  private plotNumber = 1;
  private readonly variables = new Map<string, VariableValue>([['batchmode', true]]);
  private readonly functions = new Map<string, { params: string[]; body: ExpressionNode }>();
  private readonly savedDeviceVectors = new Set<string>();
  private readonly runs: ControlAnalysisRun[] = [];
  private readonly output: string[] = [];
  private readonly measurements: MeasurementResult[] = [];
  /** inpcom.c `replaceno`: numbers the `vexprint<n>` vectors of `meas` operands. */
  private measureExpressionCount = 1;

  constructor(private readonly host: ControlHost) {}

  run(script: ControlScript): ControlScriptOutcome {
    try {
      this.block(script.statements);
    } catch (signal) {
      if (!(signal instanceof QuitSignal)) throw signal;
      if (signal.status !== 0) throw new ControlScriptExitError(signal.status, signal.line.lineNumber, this.output);
      return { runs: this.runs, output: this.output, quit: true, measurements: this.measurements };
    }
    return { runs: this.runs, output: this.output, quit: false, measurements: this.measurements };
  }

  // -------------------------------------------------------------------------
  // Statements

  private block(statements: ControlStatement[]): Flow {
    for (const statement of statements) {
      const flow = this.statement(statement);
      if (flow !== 'next') return flow;
    }
    return 'next';
  }

  private statement(statement: ControlStatement): Flow {
    switch (statement.kind) {
      case 'command':
        this.command(statement.name, statement.line);
        return 'next';
      case 'break':
      case 'continue':
        return statement.kind;
      case 'if':
        return this.block(this.condition(statement.condition, statement.line) ? statement.then : statement.otherwise);
      case 'while':
      case 'dowhile': {
        let iterations = 0;
        let first = statement.kind === 'dowhile';
        while (first || this.condition(statement.condition, statement.line)) {
          first = false;
          this.countIteration(++iterations, statement.line);
          if (this.block(statement.body) === 'break') break;
        }
        return 'next';
      }
      case 'repeat': {
        const text = this.substitute(statement.count, statement.line).trim();
        if (text === '') {
          throw new UnsupportedControlCommandError(
            'repeat', 'an unbounded repeat loop is not executed', statement.line.lineNumber, statement.line.text,
          );
        }
        const count = this.evaluate(text, statement.line).re[0];
        for (let iteration = 0; iteration < count; iteration++) {
          this.countIteration(iteration + 1, statement.line);
          if (this.block(statement.body) === 'break') break;
        }
        return 'next';
      }
      case 'foreach': {
        const values = splitWords(this.substitute(statement.values, statement.line)).map(unquote);
        for (const value of values) {
          this.variables.set(statement.variable.toLowerCase(), value);
          if (this.block(statement.body) === 'break') break;
        }
        return 'next';
      }
    }
  }

  private countIteration(iteration: number, line: ControlSourceLine): void {
    if (iteration > MAX_LOOP_ITERATIONS) {
      throw new ControlScriptError(`loop exceeded ${MAX_LOOP_ITERATIONS} iterations`, line.lineNumber, line.text);
    }
  }

  private condition(text: string, line: ControlSourceLine): boolean {
    const substituted = this.substitute(text, line).trim();
    if (substituted === '') throw new ControlScriptError('missing condition', line.lineNumber, line.text);
    return isTrue(this.evaluate(substituted, line));
  }

  private command(name: string, line: ControlSourceLine): void {
    const text = this.substitute(line.text, line);
    const rest = text.slice(/^\s*[^\s=(]*/.exec(text)![0].length).trim();
    switch (name) {
      case 'op': case 'dc': case 'ac': case 'tran': case 'noise': {
        const tokens = tokenizeNetlist(text)[0]?.tokens ?? [];
        this.recordRun(this.host.runAnalysis([`.${name.toUpperCase()}`, ...tokens.slice(1)], line));
        return;
      }
      case 'run':
        if (rest !== '') {
          throw new UnsupportedControlCommandError('run', 'writing a raw file from run is not supported', line.lineNumber, line.text);
        }
        for (const run of this.host.runDeck(line)) this.recordRun(run);
        return;
      case 'let': return this.let(rest, line);
      case 'unlet':
        for (const word of splitWords(rest)) this.current.vectors.delete(word.toLowerCase());
        return;
      case 'set': return this.set(rest, line);
      case 'unset':
        for (const word of splitWords(rest)) this.variables.delete(word.toLowerCase());
        return;
      case 'define': return this.define(rest, line);
      case 'undefine':
        for (const word of splitWords(rest)) {
          for (const key of [...this.functions.keys()]) if (key.startsWith(`${word.toLowerCase()}/`)) this.functions.delete(key);
        }
        return;
      case 'alter': return this.alter(rest, line);
      case 'altermod': return this.altermod(rest, line);
      case 'option':
      case 'options':
        if (rest !== '') this.host.setOptions(splitWords(rest).map(unquote), line);
        return;
      case 'setplot': return this.setplot(rest, line);
      case 'destroy': return this.destroy(rest, line);
      case 'compose': return this.compose(rest, line);
      case 'strcmp': return this.strcmp(rest, line);
      case 'meas': return this.meas(rest, line);
      case 'setscale': {
        if (rest === '') return;
        this.current.scale = this.vector(rest, line);
        return;
      }
      case 'echo':
        this.output.push(withoutRedirection(splitWords(rest)).map(unquote).join(' '));
        return;
      case 'save':
        for (const word of splitWords(rest)) if (word.startsWith('@')) this.savedDeviceVectors.add(word.toLowerCase());
        return;
      case 'quit':
      case 'exit': {
        const status = rest === '' ? 0 : parseControlNumber(rest);
        if (status === undefined) throw new ControlScriptError(`invalid exit status '${rest}'`, line.lineNumber, line.text);
        throw new QuitSignal(status, line);
      }
      default:
        // Output-only commands (print, plot, write, wrdata, settype, rusage, ...).
        return;
    }
  }

  // -------------------------------------------------------------------------
  // Commands

  private let(rest: string, line: ControlSourceLine): void {
    const equals = assignmentIndex(rest);
    if (equals < 0) {
      throw new UnsupportedControlCommandError('let', 'let without an assignment (vector listing) is not supported', line.lineNumber, line.text);
    }
    const target = rest.slice(0, equals).trim();
    const expression = rest.slice(equals + 1).trim();
    rejectRedirection('let', expression, line);
    const value = this.evaluate(expression, line);
    const element = /^([^\s[\]]+)\s*\[(.+)\]$/.exec(target);
    if (element) {
      const name = element[1].toLowerCase();
      const plot = this.assignmentPlot(name);
      const existing = plot.vectors.get(name);
      if (!existing) throw new ControlScriptError(`no such vector '${element[1]}' to index`, line.lineNumber, line.text);
      const index = Math.trunc(this.evaluate(element[2], line).re[0]);
      if (!(index >= 0 && index < existing.re.length)) {
        throw new ControlScriptError(`index ${index} out of range for vector '${element[1]}'`, line.lineNumber, line.text);
      }
      const updated = renamed(existing, name);
      updated.re[index] = value.re[0];
      if (value.im || updated.im) {
        updated.im ??= new Float64Array(updated.re.length);
        updated.im[index] = value.im ? value.im[0] : 0;
      }
      plot.vectors.set(name, updated);
      return;
    }
    if (!/^[A-Za-z_][\w#.@:-]*$/.test(target)) {
      throw new ControlScriptError(`invalid vector name '${target}'`, line.lineNumber, line.text);
    }
    this.assignmentPlot(target.toLowerCase()).vectors.set(target.toLowerCase(), renamed(value, target));
  }

  /**
   * Plot a `let` writes to: the plot where the name already resolves (current
   * plot, then `const`), else the current plot. ngspice updates a `const`
   * vector in place even while an analysis plot is current.
   */
  private assignmentPlot(name: string): Plot {
    if (this.current.vectors.has(name)) return this.current;
    if (this.plots[0].vectors.has(name)) return this.plots[0];
    return this.current;
  }

  private set(rest: string, line: ControlSourceLine): void {
    const normalized = rest.replace(/\s*=\s*/g, '=');
    for (const word of splitWords(normalized)) {
      const separator = word.indexOf('=');
      const name = (separator < 0 ? word : word.slice(0, separator)).toLowerCase();
      const rawValue = separator < 0 ? undefined : word.slice(separator + 1);
      if (name === '') throw new ControlScriptError(`invalid set argument '${word}'`, line.lineNumber, line.text);
      const reason = RESULT_AFFECTING_VARIABLES[name];
      if (reason !== undefined) {
        throw new UnsupportedControlCommandError('set', `variable '${name}': ${reason}`, line.lineNumber, line.text);
      }
      if (OPTION_VARIABLES.has(name)) {
        this.host.setOptions([rawValue === undefined ? name : `${name}=${unquote(rawValue)}`], line);
        continue;
      }
      if (name === 'curplot') {
        const target = rawValue === undefined ? '' : unquote(rawValue);
        this.setplot(target, line);
        continue;
      }
      if (name === 'curplottitle') {
        this.current.title = rawValue === undefined ? '' : unquote(rawValue);
        continue;
      }
      if (rawValue === undefined) {
        this.variables.set(name, true);
      } else if (rawValue.startsWith('(') && rawValue.endsWith(')')) {
        this.variables.set(name, splitWords(rawValue.slice(1, -1)).map(unquote));
      } else {
        this.variables.set(name, unquote(rawValue));
      }
    }
  }

  private define(rest: string, line: ControlSourceLine): void {
    const match = /^([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(.+)$/.exec(rest);
    if (!match) {
      throw new UnsupportedControlCommandError('define', 'only define name(args) expression is supported', line.lineNumber, line.text);
    }
    rejectRedirection('define', match[3], line);
    const params = match[2].split(',').map(param => param.trim()).filter(Boolean);
    this.functions.set(`${match[1].toLowerCase()}/${params.length}`, { params, body: this.parse(match[3], line) });
  }

  private alter(rest: string, line: ControlSourceLine): void {
    const { target, parameter, valueText } = this.splitAlter('alter', rest, line);
    this.host.alterInstance(target, parameter, this.alterValues(valueText, line), line);
  }

  private altermod(rest: string, line: ControlSourceLine): void {
    const { target, parameter, valueText } = this.splitAlter('altermod', rest, line);
    if (parameter === undefined) {
      throw new UnsupportedControlCommandError('altermod', 'altermod needs a model parameter (altermod model param = value)', line.lineNumber, line.text);
    }
    const values = this.alterValues(valueText, line);
    if (values.length !== 1) {
      throw new ControlScriptError('altermod needs a single value', line.lineNumber, line.text);
    }
    this.host.alterModel(target, parameter, values[0], line);
  }

  private splitAlter(command: string, rest: string, line: ControlSourceLine): { target: string; parameter?: string; valueText: string } {
    const bracket = /^@([^\s[]+)\[([^\]]+)\]\s*=?\s*(.+)$/.exec(rest);
    if (bracket) return { target: bracket[1], parameter: bracket[2], valueText: bracket[3] };
    const equals = rest.indexOf('=');
    if (equals >= 0) {
      const left = rest.slice(0, equals).trim().split(/\s+/);
      const valueText = rest.slice(equals + 1).trim();
      if (left.length === 1 && left[0] !== '') return { target: left[0], valueText };
      if (left.length === 2) return { target: left[0], parameter: left[1], valueText };
    } else {
      const words = rest.split(/\s+/);
      if (words.length === 2) return { target: words[0], valueText: words[1] };
      if (words.length === 3) return { target: words[0], parameter: words[1], valueText: words[2] };
    }
    throw new UnsupportedControlCommandError(command, `unsupported ${command} form`, line.lineNumber, line.text);
  }

  private alterValues(valueText: string, line: ControlSourceLine): number[] {
    const trimmed = valueText.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      return splitWords(trimmed.slice(1, -1)).map(word => {
        const value = parseControlNumber(word);
        if (value === undefined) throw new ControlScriptError(`invalid number '${word}' in value list`, line.lineNumber, line.text);
        return value;
      });
    }
    const vector = this.evaluate(trimmed, line);
    if (vector.im && vector.im.some(value => value !== 0)) {
      throw new ControlScriptError('alter needs a real value', line.lineNumber, line.text);
    }
    return Array.from(vector.re);
  }

  private setplot(rest: string, line: ControlSourceLine): void {
    const name = rest.trim().toLowerCase();
    if (name === '') return;
    if (name === 'new') {
      this.current = this.newPlot('unknown', 'anonymous', undefined);
      return;
    }
    const plot = this.plots.find(candidate => candidate.name === name);
    if (!plot) throw new ControlScriptError(`no such plot '${rest.trim()}'`, line.lineNumber, line.text);
    this.current = plot;
  }

  private destroy(rest: string, line: ControlSourceLine): void {
    const names = splitWords(rest).map(word => word.toLowerCase());
    const doomed = names.length === 0
      ? [this.current]
      : names.includes('all')
        ? this.plots.filter(plot => plot.name !== 'const')
        : names.map(name => {
          const plot = this.plots.find(candidate => candidate.name === name);
          if (!plot) throw new ControlScriptError(`no such plot '${name}'`, line.lineNumber, line.text);
          return plot;
        });
    for (const plot of doomed) {
      if (plot.name === 'const') continue;
      this.plots.splice(this.plots.indexOf(plot), 1);
    }
    if (!this.plots.includes(this.current)) this.current = this.plots.at(-1)!;
  }

  private compose(rest: string, line: ControlSourceLine): void {
    const [target, ...words] = splitWords(rest.replace(/\s*=\s*/g, '='));
    if (!target) throw new ControlScriptError('compose needs a vector name', line.lineNumber, line.text);
    if (words[0]?.toLowerCase() === 'values') {
      const values = words.slice(1).map(word => this.evaluate(word, line));
      const complex = values.some(value => value.im !== undefined);
      const re = values.map(value => value.re[0]);
      const vector = complex
        ? complexVector(target, re, values.map(value => (value.im ? value.im[0] : 0)))
        : realVector(target, re);
      this.current.vectors.set(target.toLowerCase(), vector);
      return;
    }
    const params = new Map<string, number>();
    for (const word of words) {
      const [key, value] = word.split('=');
      if (value === undefined || !['start', 'stop', 'step', 'lin', 'len'].includes(key.toLowerCase())) {
        throw new UnsupportedControlCommandError('compose', `compose parameter '${word}' is not supported`, line.lineNumber, line.text);
      }
      params.set(key.toLowerCase() === 'len' ? 'lin' : key.toLowerCase(), this.evaluate(value, line).re[0]);
    }
    const start = params.get('start');
    const stop = params.get('stop');
    const step = params.get('step');
    const count = params.get('lin');
    let values: number[];
    if (start !== undefined && step !== undefined && count !== undefined && stop === undefined) {
      values = Array.from({ length: Math.trunc(count) }, (_, index) => start + index * step);
    } else if (start !== undefined && stop !== undefined && count !== undefined && step === undefined) {
      const points = Math.trunc(count);
      values = Array.from({ length: points }, (_, index) =>
        (points === 1 ? start : start + (index * (stop - start)) / (points - 1)));
    } else if (start !== undefined && stop !== undefined && step !== undefined && count === undefined) {
      if (step === 0) throw new ControlScriptError('compose step must be non-zero', line.lineNumber, line.text);
      const points = Math.trunc(Math.abs((stop - start) / step) + 1.5);
      values = Array.from({ length: points }, (_, index) => start + index * step);
    } else {
      throw new UnsupportedControlCommandError('compose', 'this compose parameter combination is not supported', line.lineNumber, line.text);
    }
    this.current.vectors.set(target.toLowerCase(), realVector(target, values));
  }

  private strcmp(rest: string, line: ControlSourceLine): void {
    const words = splitWords(rest).map(unquote);
    if (words.length !== 3) throw new ControlScriptError('strcmp needs a variable and two strings', line.lineNumber, line.text);
    const [name, left, right] = words;
    this.variables.set(name.toLowerCase(), String(left < right ? -1 : left > right ? 1 : 0));
  }

  /**
   * `meas`: ngspice-47 com_meas() (frontend/measure.c) after inpcom.c's
   * inp_meas_control() rewrite, which moves every `=` operand with an
   * arithmetic character into a temporary vector (`let vexprint<n> = operand`
   * before the command, `unlet` after). A failed measurement is recorded, not
   * thrown: ngspice prints it and runs on.
   */
  private meas(rest: string, line: ControlSourceLine): void {
    // ngspice reads the deck lower-cased and inpcom.c inp_remove_excess_ws drops the blanks around `=`.
    let text = rest.replace(/\s*=\s*/g, '=').toLowerCase();
    const temporaries: { plot: Plot; name: string }[] = [];
    let search = 0;
    for (let equals = findAssignment(text, search); equals >= 0; equals = findAssignment(text, search)) {
      const { token, end } = gettokAt(text, equals + 1);
      if (!/[+\-*/()<>?:|&^!%\\]/.test(token)) {
        search = end;
        continue;
      }
      search = equals + 1;
      const name = `vexprint${this.measureExpressionCount++}`;
      try {
        const plot = this.assignmentPlot(name);
        plot.vectors.set(name, renamed(this.evaluate(token, line), name));
        temporaries.push({ plot, name });
      } catch (error) {
        // ngspice prints the failed `let` and the measurement then misses the vector.
        if (!(error instanceof ControlScriptError)) throw error;
      }
      text = `${text.slice(0, equals)}=${name} ${text.slice(end)}`;
    }
    try {
      const result = this.measure(text.trim().split(/\s+/).filter(Boolean), line);
      if (result) this.measurements.push(result);
    } finally {
      for (const { plot, name } of temporaries) plot.vectors.delete(name);
    }
  }

  /** com_meas body: replace `=<single-valued vector>` by its value, measure, `let` the result. */
  private measure(words: string[], line: ControlSourceLine): MeasurementResult | undefined {
    if (words.length === 0) return undefined; // `meas` alone lists the vectors (com_display).
    const failed = (error: string): MeasurementResult => ({
      name: (words[1] ?? '').toLowerCase(), analysis: words[0].toLowerCase(), function: (words[2] ?? '').toLowerCase(),
      line: line.lineNumber, status: 'failed', error,
    });
    const value = (operand: string): string | undefined => {
      if (operand.toLowerCase() === 'last' || inpEvaluate(operand) !== undefined) return undefined;
      const vector = this.measureVector(operand);
      return vector && vector.re.length === 1 ? formatC(vector.re[0]) : undefined;
    };
    for (let index = 0; index < words.length; index++) {
      const word = words[index];
      if (word.endsWith('=')) {
        if (++index >= words.length) return failed(`meas failed due to missing token in meas ${words.join(' ')}`);
        words[index] = value(words[index]) ?? words[index];
      } else if (word.includes('=')) {
        const lhs = word.slice(0, word.indexOf('='));
        const replaced = value(word.slice(word.indexOf('=') + 1));
        if (replaced !== undefined) words[index] = `${lhs}=${replaced}`;
      }
    }
    if (words.length < 2) return failed('unspecified output var name');
    const outcome = getMeasure2(words, this.measurePlot());
    if (!outcome.ok) return failed(outcome.error);
    const name = words[1].toLowerCase();
    const { ok: _ok, value: measured, ...details } = outcome;
    // com_let(`%s = %e`): the vector holds the value printed with 7 significant digits.
    this.assignmentPlot(name).vectors.set(name, scalar(Number(formatC(measured)), name));
    return {
      name, analysis: words[0].toLowerCase(), function: words[2].toLowerCase(), line: line.lineNumber, status: 'ok',
      value: measured, ...details,
    };
  }

  /** The current plot as `get_measure2` reads it. */
  private measurePlot(): MeasurePlot {
    return { type: this.current.name, scale: this.current.scale, vector: name => this.measureVector(name) };
  }

  /** ngspice vec_get for a measurement: the name, `v(node)` as `node`, `i(dev)` as `dev#branch`. */
  private measureVector(rawName: string): ControlVector | undefined {
    const name = rawName.toLowerCase();
    const candidates = [name];
    const voltage = /^v\((.+)\)$/.exec(name);
    if (voltage) candidates.push(voltage[1]);
    const current = /^i\((.+)\)$/.exec(name);
    if (current) candidates.push(`${current[1]}#branch`);
    for (const candidate of candidates) {
      try {
        return this.lookup(candidate);
      } catch (error) {
        if (!(error instanceof ExpressionError || error instanceof UnsupportedExpressionFeature)) throw error;
      }
    }
    return undefined;
  }

  // -------------------------------------------------------------------------
  // Plots

  private newPlot(type: string, title: string, scale: ControlVector | undefined, unproducedSaves = new Set<string>()): Plot {
    while (this.plots.some(plot => plot.name === `${type}${this.plotNumber}`)) this.plotNumber++;
    const plot: Plot = { name: `${type}${this.plotNumber}`, title, vectors: new Map(), scale, unproducedSaves };
    if (scale) plot.vectors.set(scale.name, scale);
    this.plots.push(plot);
    return plot;
  }

  private recordRun(run: ControlHostRun): void {
    const saves = new Set(this.savedDeviceVectors);
    const type = run.directive.type;
    const { result } = run;
    if (type === 'noise' && result.noise) {
      const noise = result.noise;
      const frequency = realVector('frequency', noise.frequencies);
      const spectrum = this.newPlot('noise', 'Noise Spectral Density Curves', frequency, saves);
      spectrum.vectors.set('onoise_spectrum', realVector('onoise_spectrum', noise.outputNoiseDensity, frequency));
      spectrum.vectors.set('inoise_spectrum', realVector('inoise_spectrum', noise.inputNoiseDensity, frequency));
      this.runs.push({ plot: spectrum.name, analysis: type, result });
      const integrated = this.newPlot('noise', 'Integrated Noise', undefined, saves);
      if (noise.integratedOutputNoise !== undefined) {
        integrated.vectors.set('onoise_total', scalar(noise.integratedOutputNoise, 'onoise_total'));
      }
      if (noise.integratedInputNoise !== undefined) {
        integrated.vectors.set('inoise_total', scalar(noise.integratedInputNoise, 'inoise_total'));
      }
      this.current = integrated;
      return;
    }
    const plot = this.plotFor(run, saves);
    this.runs.push({ plot: plot.name, analysis: type, result });
    this.current = plot;
  }

  private plotFor(run: ControlHostRun, saves: Set<string>): Plot {
    const { directive, result } = run;
    switch (directive.type) {
      case 'op': {
        const plot = this.newPlot('op', 'Operating Point', undefined, saves);
        for (const [node, value] of result.dc?.voltages ?? []) plot.vectors.set(node.toLowerCase(), scalar(value, node));
        for (const [branch, value] of result.dc?.currents ?? []) {
          plot.vectors.set(`${branch.toLowerCase()}#branch`, scalar(value, `${branch}#branch`));
        }
        return plot;
      }
      case 'dc': {
        const sweep = result.dcSweep;
        const source = directive.source.toLowerCase();
        const scaleName = source === 'temp' ? 'temp-sweep' : `${source[0] === 'i' ? 'i' : source[0] === 'r' ? 'res' : 'v'}-sweep`;
        const scale = realVector(scaleName, sweep ? sweep.sweepValues : []);
        const plot = this.newPlot('dc', 'DC transfer characteristic', scale, saves);
        if (sweep) {
          for (const [node, values] of sweep.voltages) plot.vectors.set(node.toLowerCase(), realVector(node, values, scale));
          for (const [branch, values] of sweep.currents) {
            plot.vectors.set(`${branch.toLowerCase()}#branch`, realVector(`${branch}#branch`, values, scale));
          }
        }
        return plot;
      }
      case 'tran': {
        const transient = result.transient;
        const scale = realVector('time', transient ? transient.time : []);
        const plot = this.newPlot('tran', 'Transient Analysis', scale, saves);
        if (transient) {
          for (const [node, values] of transient.voltages) plot.vectors.set(node.toLowerCase(), realVector(node, values, scale));
          for (const [branch, values] of transient.currents) {
            plot.vectors.set(`${branch.toLowerCase()}#branch`, realVector(`${branch}#branch`, values, scale));
          }
        }
        return plot;
      }
      case 'ac': {
        const ac = result.ac;
        const scale = realVector('frequency', ac ? ac.frequencies : []);
        const plot = this.newPlot('ac', 'AC Analysis', scale, saves);
        const phasors = (name: string, values: { magnitude: number; phase: number }[]): ControlVector => complexVector(
          name,
          values.map(value => value.magnitude * Math.cos((value.phase * Math.PI) / 180)),
          values.map(value => value.magnitude * Math.sin((value.phase * Math.PI) / 180)),
          scale,
        );
        if (ac) {
          for (const [node, values] of ac.voltages) plot.vectors.set(node.toLowerCase(), phasors(node, values));
          for (const [branch, values] of ac.currents) {
            plot.vectors.set(`${branch.toLowerCase()}#branch`, phasors(`${branch}#branch`, values));
          }
        }
        return plot;
      }
      default:
        return this.newPlot(directive.type, directive.type, undefined, saves);
    }
  }

  // -------------------------------------------------------------------------
  // Vectors and expressions

  private environment(): ExpressionEnvironment {
    return {
      lookup: name => this.lookup(name),
      userFunction: (name, arity) => this.functions.get(`${name.toLowerCase()}/${arity}`),
      degrees: () => {
        const units = this.variables.get('units');
        return typeof units === 'string' && units.toLowerCase().startsWith('degree');
      },
    };
  }

  private lookup(rawName: string): ControlVector {
    const name = rawName.toLowerCase();
    const dot = name.indexOf('.');
    if (dot > 0) {
      const plot = this.plots.find(candidate => candidate.name === name.slice(0, dot));
      if (plot) return this.lookupIn(plot, name.slice(dot + 1), rawName);
    }
    const local = this.current.vectors.get(name);
    if (local) return local;
    const constant = this.plots[0].vectors.get(name);
    if (constant) return constant;
    return this.lookupIn(this.current, name, rawName);
  }

  private lookupIn(plot: Plot, name: string, rawName: string): ControlVector {
    const vector = plot.vectors.get(name);
    if (vector) return vector;
    if (name.startsWith('@')) {
      if (plot.unproducedSaves.has(name)) {
        throw new UnsupportedExpressionFeature(rawName, `saved device-parameter vector '${rawName}' is not produced by spice-ts analyses`);
      }
      const match = /^@([^[]+)\[([^\]]+)\]$/.exec(name);
      const values = match ? this.host.parameterVector(match[1], match[2]) : undefined;
      if (values === undefined) {
        throw new UnsupportedExpressionFeature(rawName, `device or model parameter '${rawName}' is not available to the spice-ts control language`);
      }
      return realVector(name, values);
    }
    throw new ExpressionError(`no such vector '${rawName}' in plot '${plot.name}'`);
  }

  private parse(text: string, line: ControlSourceLine): ExpressionNode {
    try {
      return parseVectorExpression(text);
    } catch (error) {
      throw this.wrap(error, line);
    }
  }

  private evaluate(text: string, line: ControlSourceLine): ControlVector {
    const tree = this.parse(text, line);
    try {
      return evaluateVectorExpression(tree, this.environment());
    } catch (error) {
      throw this.wrap(error, line);
    }
  }

  private vector(name: string, line: ControlSourceLine): ControlVector {
    try {
      return this.lookup(name.trim());
    } catch (error) {
      throw this.wrap(error, line);
    }
  }

  private wrap(error: unknown, line: ControlSourceLine): Error {
    if (error instanceof UnsupportedExpressionFeature) {
      return new UnsupportedControlCommandError(commandWord(line.text), error.message, line.lineNumber, line.text);
    }
    if (error instanceof ExpressionError) return new ControlScriptError(error.message, line.lineNumber, line.text);
    return error as Error;
  }

  // -------------------------------------------------------------------------
  // Variable substitution

  /**
   * ngspice variable substitution: `$name`, `{$name}`, `$&vector`, `$?name`,
   * `$#name`, and the plot variables `$curplot`, `$curplottitle`, `$plots`.
   * Nothing is substituted inside single quotes.
   */
  private substitute(text: string, line: ControlSourceLine): string {
    let output = '';
    let index = 0;
    let singleQuoted = false;
    while (index < text.length) {
      const character = text[index];
      if (character === "'") singleQuoted = !singleQuoted;
      if (singleQuoted) {
        output += character;
        index++;
        continue;
      }
      if (character === '{' && text[index + 1] === '$') {
        const close = text.indexOf('}', index);
        if (close > index) {
          output += this.substituteReference(text.slice(index + 1, close), line);
          index = close + 1;
          continue;
        }
      }
      if (character === '$') {
        const reference = /^\$(?:&[A-Za-z0-9_#@.]+(?:\([^)]*\))?(?:\[[^\]]*\])*|[?#][A-Za-z0-9_]+|[A-Za-z0-9_]+)/.exec(text.slice(index));
        if (reference) {
          output += this.substituteReference(reference[0], line);
          index += reference[0].length;
          continue;
        }
      }
      output += character;
      index++;
    }
    return output;
  }

  private substituteReference(reference: string, line: ControlSourceLine): string {
    if (reference.startsWith('$&')) {
      const digits = Number(this.variables.get('numdgt'));
      return formatVector(this.evaluate(reference.slice(2), line), Number.isInteger(digits) && digits > 0 ? digits : 6);
    }
    if (reference.startsWith('$?')) return this.variable(reference.slice(2)) === undefined ? '0' : '1';
    if (reference.startsWith('$#')) {
      const value = this.variable(reference.slice(2));
      return String(value === undefined ? 0 : Array.isArray(value) ? value.length : 1);
    }
    const name = reference.slice(1);
    const value = this.variable(name);
    if (value === undefined) throw new ControlScriptError(`'${name}': no such variable`, line.lineNumber, line.text);
    if (value === true) return '';
    return Array.isArray(value) ? value.join(' ') : value;
  }

  private variable(rawName: string): VariableValue | undefined {
    const name = rawName.toLowerCase();
    if (name === 'curplot') return this.current.name;
    if (name === 'curplottitle') return this.current.title;
    if (name === 'curplotname') return this.current.title;
    if (name === 'plots') return this.plots.map(plot => plot.name);
    return this.variables.get(name);
  }
}

// ---------------------------------------------------------------------------
// Word helpers

/** Split on whitespace outside double quotes and parentheses. */
function splitWords(text: string): string[] {
  const words: string[] = [];
  let word = '';
  let quoted = false;
  let depth = 0;
  for (const character of text) {
    if (character === '"') quoted = !quoted;
    if (!quoted && character === '(') depth++;
    if (!quoted && character === ')') depth = Math.max(0, depth - 1);
    if (!quoted && depth === 0 && /\s/.test(character)) {
      if (word !== '') words.push(word);
      word = '';
      continue;
    }
    word += character;
  }
  if (word !== '') words.push(word);
  return words;
}

function unquote(word: string): string {
  return word.replace(/"/g, '');
}

function commandWord(text: string): string {
  return (/^[^\s=(]+/.exec(text)?.[0] ?? '').toLowerCase();
}

/** Drop csh-style output redirection (`> file`, `>> file`) from an output command. */
function withoutRedirection(words: string[]): string[] {
  const kept: string[] = [];
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    if (/^>>?/.test(word)) {
      if (word === '>' || word === '>>') index++;
      continue;
    }
    kept.push(word);
  }
  return kept;
}

/**
 * ngspice's csh-like command lexer treats a whitespace-separated `<`, `>` or
 * `>>` word on a `let` or `define` line as I/O redirection, not as a
 * comparison (`abs(a-b)>err` is a comparison). spice-ts does not emulate the
 * redirection, so such lines are rejected.
 */
function rejectRedirection(command: string, text: string, line: ControlSourceLine): void {
  if (splitWords(text).some(word => word === '<' || word === '>' || word === '>>')) {
    throw new UnsupportedControlCommandError(
      command,
      `a separate '<' or '>' word on a ${command} line is csh-style redirection in ngspice and is not supported`,
      line.lineNumber,
      line.text,
    );
  }
}

/** inpcom.c find_assignment: the next `=` from `from` that is not part of `==`, `!=`, `<=` or `>=`. */
function findAssignment(text: string, from: number): number {
  for (let index = text.indexOf('=', from); index >= 0; index = text.indexOf('=', index + 1)) {
    if (text[index + 1] === '=') {
      index++;
      continue;
    }
    if (index > 0 && '!<>'.includes(text[index - 1])) continue;
    return index;
  }
  return -1;
}

/** misc/string.c gettok from `start`: the word and where the next one begins. */
function gettokAt(text: string, start: number): { token: string; end: number } {
  const [token = ''] = gettokWords(text.slice(start));
  let end = text.indexOf(token, start) + token.length;
  while (end < text.length && (/\s/.test(text[end]) || text[end] === ',')) end++;
  return { token, end };
}

/** C `printf("%e")`. */
function formatC(value: number): string {
  if (Number.isNaN(value)) return 'nan';
  if (!Number.isFinite(value)) return value > 0 ? 'inf' : '-inf';
  return value.toExponential(6).replace(/e([+-])(\d)$/, 'e$10$2');
}

/** Index of the `=` that separates a `let` target from its expression. */
function assignmentIndex(text: string): number {
  let depth = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '[' || character === '(') depth++;
    if (character === ']' || character === ')') depth--;
    if (character === '=' && depth === 0) return index;
  }
  return -1;
}
