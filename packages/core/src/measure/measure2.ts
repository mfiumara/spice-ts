/**
 * Port of ngspice-47 `get_measure2()` and its helpers
 * (src/frontend/com_measure2.c). Line references in comments are to that file
 * in the ngspice-47 release tarball.
 *
 * The port keeps ngspice's quirks on purpose, because they decide which
 * numbers a deck reports: AVG/MIN/MAX/PP do not interpolate their window
 * (lines 767-967), RMS/INTEG do and integrate with Simpson's 3/8 and 1/3
 * rules where segment widths match (lines 976-1172), a `.dc` measure restarts
 * edge detection whenever the inner sweep returns to its first value
 * (lines 495-521), and parameter words are cut by C `strtok`, which edits the
 * word in place for later parsing passes.
 *
 * One deliberate exception: a WHEN crossing between the first two points of
 * the plot is measured (ngspice-47 counts but drops it, ngspice ticket #574;
 * spice-ts #811), see measureWhen.
 */
import type { ControlVector } from '../parser/control/vector.js';
import { ftNumparse, inpEvaluate } from './numparse.js';

/** The plot a measurement reads (ngspice `plot_cur`). */
export interface MeasurePlot {
  /** ngspice plot type name: `tran`, `ac`, `dc`, `sp`, `op`, ... */
  readonly type: string;
  /** Plot scale (`time`, `frequency`, `v-sweep`, ...). */
  readonly scale: ControlVector | undefined;
  /** ngspice `vec_get`: the vector of that name in this plot, or undefined. */
  vector(name: string): ControlVector | undefined;
}

/** What `get_measure2` returns: the value plus what ngspice prints next to it. */
export type MeasureOutcome =
  | {
    ok: true;
    value: number;
    trig?: number;
    targ?: number;
    at?: number;
    with?: number;
    from?: number;
    to?: number;
  }
  | { ok: false; error: string };

const MEASURE_DEFAULT = -1;
const MEASURE_LAST_TRANSITION = -2;
const UNSET = 1e99;

type FunctionType =
  | 'delay' | 'find' | 'when' | 'avg' | 'min' | 'max' | 'rms' | 'pp' | 'integ' | 'deriv'
  | 'err' | 'err1' | 'err2' | 'err3' | 'min_at' | 'max_at';

/** measure_function_type, lines 207-257. */
function functionType(word: string): FunctionType | undefined {
  switch (unquote(word).toLowerCase()) {
    case 'delay': case 'trig': case 'targ': return 'delay';
    case 'find': return 'find';
    case 'when': return 'when';
    case 'avg': return 'avg';
    case 'min': return 'min';
    case 'max': return 'max';
    case 'min_at': return 'min_at';
    case 'max_at': return 'max_at';
    case 'rms': return 'rms';
    case 'pp': return 'pp';
    case 'integ': return 'integ';
    case 'deriv': return 'deriv';
    case 'err': return 'err';
    case 'err1': return 'err1';
    case 'err2': return 'err2';
    case 'err3': return 'err3';
    default: return undefined;
  }
}

/** The MEASURE struct (lines 29-49). TMALLOC zero-fills, so unset fields start at 0. */
interface Measure {
  analysis: string;
  vec?: string;
  vec2?: string;
  vectype: string;
  vectype2: string;
  rise: number;
  fall: number;
  cross: number;
  val: number;
  td: number;
  from: number;
  to: number;
  at: number;
  measured: number;
  measuredAt: number;
}

function newMeasure(analysis: string): Measure {
  return {
    analysis, vectype: '', vectype2: '', rise: 0, fall: 0, cross: 0, val: 0, td: 0,
    from: 0, to: 0, at: 0, measured: 0, measuredAt: 0,
  };
}

/** cp_unquote: drop surrounding double quotes. */
function unquote(word: string): string {
  return word.length >= 2 && word.startsWith('"') && word.endsWith('"') ? word.slice(1, -1) : word.replace(/^"/, '');
}

const ciprefix = (prefix: string, word: string): boolean => word.toLowerCase().startsWith(prefix);
const cieq = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * C `strtok(word, "=")` then `strtok(NULL, "=")`: the name, the value, and the
 * word as strtok leaves it (cut at the first `=` after the name).
 */
function strtokPair(word: string): { name?: string; value?: string; cut: string } {
  let index = 0;
  while (word[index] === '=') index++;
  if (index >= word.length) return { cut: word };
  let end = word.indexOf('=', index);
  if (end < 0) return { name: word.slice(index), cut: word };
  const name = word.slice(index, end);
  const cut = word.slice(0, end);
  let start = end + 1;
  while (word[start] === '=') start++;
  if (start >= word.length) return { name, cut };
  end = word.indexOf('=', start);
  return { name, value: word.slice(start, end < 0 ? undefined : end), cut };
}

/** correct_vec, lines 111-133: `vm(out)` -> vector `v(out)`, type `m`. */
function correctVec(meas: Measure): void {
  const vec = meas.vec;
  if (vec === undefined || vec[0] !== 'v' || !vec.includes('(')) return;
  if (vec[1] !== '(') {
    meas.vectype = vec[1];
    meas.vec = vec[0] + vec.slice(vec.indexOf('('));
  }
  const vec2 = meas.vec2;
  if (vec2 !== undefined && vec2[1] !== '(') {
    meas.vectype2 = vec2[1];
    meas.vec2 = vec2[0] + vec2.slice(vec2.indexOf('('));
  }
}

/** get_value, lines 137-162. */
function complexValue(meas: Measure, vector: ControlVector, index: number): number {
  const re = vector.re[index];
  const im = vector.im ? vector.im[index] : 0;
  switch (meas.vectype.toLowerCase()) {
    case 'm': return Math.hypot(re, im);
    case 'r': return re;
    case 'i': return im;
    // radtodeg() is the identity unless the control variable `units` is `degree`,
    // which a `.meas` card cannot set: the phase is in radians.
    case 'p': return Math.atan2(im, re);
    case 'd': return 20 * Math.log10(Math.hypot(re, im));
    default: return re;
  }
}

/** A value of `vector` as the analysis reads it: get_value for complex AC/SP data, else the real part. */
function sample(meas: Measure, vector: ControlVector, index: number, complexAnalysis: boolean): number {
  return complexAnalysis && vector.im ? complexValue(meas, vector, index) : vector.re[index];
}

/** measure_interpolate, lines 166-200 (x_or_y = 'y'). */
function interpolateY(scale: ControlVector, values: ControlVector, i: number, j: number, x: number, meas: Measure): number {
  const ac = cieq(meas.analysis, 'ac');
  const yi = ac ? complexValue(meas, values, i) : values.re[i];
  const yj = ac ? complexValue(meas, values, j) : values.re[j];
  const slope = (yj - yi) / (scale.re[j] - scale.re[i]);
  const intercept = yi - slope * scale.re[i];
  return slope * x + intercept;
}

const ulpView = new DataView(new ArrayBuffer(16));
const INT64_MIN = -(2n ** 63n);

/** ngspice AlmostEqualUlps (maths/misc/equality.c). */
function almostEqualUlps(a: number, b: number, maxUlps: number): boolean {
  if (a === b) return true;
  ulpView.setFloat64(0, a);
  ulpView.setFloat64(8, b);
  let aInt = ulpView.getBigInt64(0);
  let bInt = ulpView.getBigInt64(8);
  if (aInt < 0n) aInt = INT64_MIN - aInt;
  if (bInt < 0n) bInt = INT64_MIN - bInt;
  const difference = aInt > bInt ? aInt - bInt : bInt - aInt;
  return difference <= BigInt(maxUlps);
}

/**
 * Run one measurement on `plot`. `words` is the card after `.meas`/`meas`:
 * analysis, result name, function, then the function's words.
 */
export function getMeasure2(words: readonly string[], plot: MeasurePlot): MeasureOutcome {
  const wl = [...words];
  if (wl.length === 0) return { ok: false, error: 'no assignment found in command meas' };
  if (!plot.scale) return { ok: false, error: 'no vectors available' };
  if (!['tran', 'ac', 'dc', 'sp'].some(prefix => ciprefix(prefix, plot.type))) {
    return { ok: false, error: 'measure limited to tran, dc, sp, or ac analysis' };
  }

  const analysis = unquote(wl[0]);
  const name = wl.length > 1 ? unquote(wl[1]) : '(null)';
  if (wl.length > 2 && functionType(wl[2]) === undefined) {
    return { ok: false, error: `no such function as '${wl[2]}'` };
  }
  let targ = -1;
  let when = -1;
  for (let index = 3; index < wl.length; index++) {
    if (cieq(wl[index], 'targ')) targ = index;
    if (cieq(wl[index], 'when')) when = index;
  }
  if (wl.length < 3) return { ok: false, error: 'invalid num params' };
  const fn = wl[2];
  const type = functionType(fn)!;
  const failed = (clause: string, message: string): MeasureOutcome => ({
    ok: false, error: `measure  ${name}  ${fn}(${clause}) : ${message}`,
  });
  const context: ParseContext = { wl, plot };

  switch (type) {
    case 'delay': {
      // lines 1744-1841
      const trigMeas = newMeasure(analysis);
      const targMeas = newMeasure(analysis);
      const trigEnd = targ < 0 ? wl.length : targ;
      let error = parseTrigTarg(trigMeas, context, 3, trigEnd, 'trig');
      if (error) return failed('TRIG', error);
      if (trigMeas.rise === -1 && trigMeas.fall === -1 && trigMeas.cross === -1 && trigMeas.at === UNSET) {
        return failed('TRIG', 'at, rise, fall or cross must be given');
      }
      error = parseTrigTarg(targMeas, context, targ < 0 ? wl.length : targ + 1, wl.length, 'targ');
      if (error) return failed('TARG', error);
      if (targMeas.rise === -1 && targMeas.fall === -1 && targMeas.cross === -1 && targMeas.at === UNSET) {
        return failed('TARG', 'at, rise, fall or cross must be given');
      }
      if (trigMeas.from !== 0 && targMeas.from === 0) targMeas.from = trigMeas.from;
      else if (targMeas.from !== 0 && trigMeas.from === 0) trigMeas.from = targMeas.from;

      // get_measure2 ignores com_measure_when's status: a failed search leaves
      // the zero-filled m_measured, which then reads as a result of 0.
      if (trigMeas.at === UNSET) measureWhen(trigMeas, plot);
      else trigMeas.measured = trigMeas.at;
      if (Number.isNaN(trigMeas.measured)) return failed('TRIG', 'out of interval');
      if (targMeas.at === UNSET) measureWhen(targMeas, plot);
      else targMeas.measured = targMeas.at;
      if (Number.isNaN(targMeas.measured)) return failed('TARG', 'out of interval');
      return {
        ok: true, value: targMeas.measured - trigMeas.measured, targ: targMeas.measured, trig: trigMeas.measured,
      };
    }
    case 'find': {
      // lines 1842-1914
      const meas = newMeasure(analysis);
      const findMeas = newMeasure(analysis);
      let error = parseFind(meas, context, 3, when < 0 ? wl.length : when);
      if (error) return failed('FIND', error);
      if (meas.at === UNSET) {
        error = parseWhen(findMeas, context, when < 0 ? wl.length : when + 1);
        if (error) return failed('WHEN', error);
        measureWhen(findMeas, plot);
        if (Number.isNaN(findMeas.measured)) return failed('AT', 'out of interval');
        error = measureAt(meas, plot, findMeas.measured);
        if (error) return { ok: false, error };
        meas.at = findMeas.measured;
      } else {
        error = measureAt(meas, plot, meas.at);
        if (error) return { ok: false, error };
      }
      if (Number.isNaN(meas.measured)) return failed('AT', 'out of interval');
      return { ok: true, value: meas.measured };
    }
    case 'when': {
      // lines 1915-1952
      const meas = newMeasure(analysis);
      let error = parseWhen(meas, context, 3);
      if (error) return failed('WHEN', error);
      measureWhen(meas, plot);
      if (Number.isNaN(meas.measured)) return failed('WHEN', 'out of interval');
      return { ok: true, value: meas.measured };
    }
    case 'rms':
    case 'integ': {
      // lines 1953-1997
      const meas = newMeasure(analysis);
      let error = parseTrigTarg(meas, context, 3, wl.length, 'trig');
      if (error) return failed('TRIG', error);
      error = measureRmsIntegral(meas, plot, type);
      if (error) return { ok: false, error };
      if (Number.isNaN(meas.measured)) return failed('TRIG', 'out of interval');
      return { ok: true, value: meas.measured, from: meas.from, to: meas.to };
    }
    case 'avg': {
      // lines 1998-2043
      const meas = newMeasure(analysis);
      let error = parseTrigTarg(meas, context, 3, wl.length, 'trig');
      if (error) return failed('TRIG', error);
      error = measureMinMaxAvg(meas, plot, 'avg');
      if (error) return { ok: false, error };
      if (Number.isNaN(meas.measured)) return failed('TRIG', 'out of interval');
      if (meas.at === UNSET) meas.at = meas.from;
      return { ok: true, value: meas.measured, from: meas.at, to: meas.measuredAt };
    }
    case 'min':
    case 'max':
    case 'min_at':
    case 'max_at': {
      // lines 2044-2103
      const meas = newMeasure(analysis);
      let error = parseTrigTarg(meas, context, 3, wl.length, 'trig');
      if (error) return failed('TRIG', error);
      error = measureMinMaxAvg(meas, plot, type === 'min' || type === 'min_at' ? 'min' : 'max');
      if (error) return { ok: false, error };
      if (Number.isNaN(meas.measured)) return failed('TRIG', 'out of interval');
      if (type === 'min' || type === 'max') return { ok: true, value: meas.measured, at: meas.measuredAt };
      return { ok: true, value: meas.measuredAt, with: meas.measured };
    }
    case 'pp': {
      // lines 2104-2154
      const meas = newMeasure(analysis);
      let error = parseTrigTarg(meas, context, 3, wl.length, 'trig');
      if (error) return failed('TRIG', error);
      error = measureMinMaxAvg(meas, plot, 'min');
      if (error) return { ok: false, error };
      if (Number.isNaN(meas.measured)) return failed('TRIG', 'out of interval');
      const minimum = meas.measured;
      error = measureMinMaxAvg(meas, plot, 'max');
      if (error) return { ok: false, error };
      if (Number.isNaN(meas.measured)) return failed('TRIG', 'out of interval');
      return { ok: true, value: meas.measured - minimum, from: meas.from, to: meas.to };
    }
    default:
      // DERIV and ERR*: lines 2156-2166.
      return { ok: false, error: `measure  ${name} failed: function '${fn}' currently not supported` };
  }
}

interface ParseContext {
  /** The card words; `strtok` cuts them in place. */
  wl: string[];
  plot: MeasurePlot;
}

/** measure_valid_vector, lines 1257-1280. */
function validVector(name: string | undefined, plot: MeasurePlot): boolean {
  if (name === undefined) return true;
  if (/^\s*[+-]?\d+$/.test(name) || name === '') return false;
  return plot.vector(name) !== undefined;
}

/**
 * measure_parse_stdParams, lines 1290-1390: RISE/FALL/CROSS/VAL/TD/FROM/TO/AT
 * words from `start` up to `end`. Returns the error text or undefined.
 */
function parseStdParams(meas: Measure, context: ParseContext, start: number, end: number): string | undefined {
  const { wl } = context;
  let count = 0;
  let lastName: string | undefined;
  for (let index = start; index < end; index++) {
    const { name, value, cut } = strtokPair(wl[index]);
    wl[index] = cut;
    lastName = name;
    if (value === undefined) {
      if (name !== undefined && cieq(name, 'last')) {
        meas.cross = MEASURE_LAST_TRANSITION;
        meas.rise = -1;
        meas.fall = -1;
        count++;
        continue;
      }
      return 'bad syntax. equal sign missing ?';
    }
    let number: number;
    if (cieq(value, 'last')) number = MEASURE_LAST_TRANSITION;
    else {
      const parsed = ftNumparse(value);
      if (parsed === undefined) return `bad syntax, cannot evaluate right hand side of ${name}=${value}`;
      number = parsed;
    }
    switch (name!.toLowerCase()) {
      case 'rise': meas.rise = Math.floor(number + 0.5); meas.fall = -1; meas.cross = -1; break;
      case 'fall': meas.fall = Math.floor(number + 0.5); meas.rise = -1; meas.cross = -1; break;
      case 'cross': meas.cross = Math.floor(number + 0.5); meas.rise = -1; meas.fall = -1; break;
      case 'val': meas.val = number; break;
      case 'td': meas.td = number; break;
      case 'from': meas.from = number; break;
      case 'to': meas.to = number; break;
      case 'at': meas.at = number; break;
      default: return `no such parameter as '${name}'`;
    }
    count++;
  }
  if (count === 0) return lastName !== undefined ? `bad syntax of ${lastName}` : 'bad syntax of';
  if (!validVector(meas.vec, context.plot)) return `no such vector as '${meas.vec}'`;
  if (meas.vec2 !== undefined && !validVector(meas.vec2, context.plot)) return `no such vector as '${meas.vec2}'`;
  if (cieq(meas.analysis, 'dc') && meas.to < meas.from) [meas.from, meas.to] = [meas.to, meas.from];
  return undefined;
}

function resetLimits(meas: Measure): void {
  meas.vec = undefined;
  meas.vec2 = undefined;
  meas.cross = -1;
  meas.fall = -1;
  meas.rise = -1;
  meas.td = 0;
  meas.from = 0;
  meas.to = 0;
  meas.at = UNSET;
  // For DC, 0 can be inside the swept range, so the open window is +-1e99.
  if (cieq(meas.analysis, 'dc')) {
    meas.to = 1e99;
    meas.from = -1e99;
  }
}

const isComplexAnalysis = (meas: Measure): boolean => cieq(meas.analysis, 'ac') || cieq(meas.analysis, 'sp');

/** measure_parse_find, lines 1398-1465. */
function parseFind(meas: Measure, context: ParseContext, start: number, end: number): string | undefined {
  resetLimits(meas);
  meas.val = 1e99;
  const { wl } = context;
  let count = 0;
  for (let index = start; index < end; index++) {
    if (count === 0) {
      meas.vec = unquote(wl[index]);
      if (isComplexAnalysis(meas)) correctVec(meas);
    } else if (count === 1) {
      const { name, value, cut } = strtokPair(wl[index]);
      wl[index] = cut;
      if (value === undefined) return 'bad syntax of WHEN';
      if (name !== undefined && cieq(name, 'at')) {
        const at = ftNumparse(value);
        if (at === undefined) return 'bad syntax of WHEN';
        meas.at = at;
      } else return 'bad syntax of WHEN';
    } else {
      // With no stop word the C call runs to the end of the card, and the
      // loop then hands the same (already cut) words over again.
      const error = parseStdParams(meas, context, index, wl.length);
      if (error) return error;
    }
    count++;
  }
  return undefined;
}

/** measure_parse_when, lines 1473-1544. */
function parseWhen(meas: Measure, context: ParseContext, start: number): string | undefined {
  resetLimits(meas);
  meas.val = 1e99;
  const { wl, plot } = context;
  for (let index = start, count = 0; index < wl.length; index++, count++) {
    if (count > 0) return parseStdParams(meas, context, index, wl.length);
    const { name, value, cut } = strtokPair(wl[index]);
    wl[index] = cut;
    if (value === undefined) return 'bad syntax';
    meas.vec = name;
    if (isComplexAnalysis(meas)) correctVec(meas);
    if (validVector(value, plot)) {
      meas.vec2 = value;
      if (isComplexAnalysis(meas)) correctVec(meas);
    } else {
      if (hasArithmetic(value)) return `Expressions like ${value} are not supported.`;
      const parsed = inpEvaluate(value);
      if (!parsed || (parsed.rest !== '' && (!'avfc'.includes(parsed.rest[0]) || parsed.rest.length !== 1))) {
        return `Cannot evaluate ${parsed ? parsed.rest : value} `;
      }
      meas.val = parsed.value;
    }
  }
  return undefined;
}

/** str_has_arith_char2, lines 63-79. */
function hasArithmetic(text: string): boolean {
  const body = text[0] === '+' || text[0] === '-' ? text.slice(1) : text;
  return /[*/<>?:|&^!%\\]/.test(body);
}

/** measure_parse_trigtarg, lines 1552-1618. */
function parseTrigTarg(meas: Measure, context: ParseContext, start: number, end: number, clause: string): string | undefined {
  resetLimits(meas);
  const { wl, plot } = context;
  let count = 0;
  for (let index = start; index < end; index++, count++) {
    const word = wl[index];
    if (count === 0 && !ciprefix('at', word)) {
      meas.vec = unquote(word);
      if (isComplexAnalysis(meas)) correctVec(meas);
    } else if (ciprefix('at', word)) {
      const error = parseStdParams(meas, context, index, end);
      if (error) return error;
    } else {
      const error = parseStdParams(meas, context, index, end);
      if (error) return error;
      break;
    }
  }
  if (count === 0) return `bad syntax of '${clause}'`;
  if (!validVector(meas.vec, plot)) return `no such vector as '${meas.vec}'`;
  return undefined;
}

/** The plot's data for one measurement, or the ngspice error text. */
function lookup(meas: Measure, plot: MeasurePlot, name: string | undefined): ControlVector | string {
  const vector = name === undefined ? undefined : plot.vector(name);
  return vector ?? `no such vector as ${name}.`;
}

/** com_measure_when, lines 378-657. Sets `meas.measured` (NaN when not found). */
function measureWhen(meas: Measure, plot: MeasurePlot): string | undefined {
  const d = lookup(meas, plot, meas.vec);
  if (typeof d === 'string') return d;
  let d2: ControlVector | undefined;
  const hasD2 = meas.vec2 !== undefined;
  if (hasD2) {
    const found = lookup(meas, plot, meas.vec2);
    if (typeof found === 'string') return found;
    d2 = found;
  }
  const scale = plot.scale;
  if (!scale) return 'no scale vector.';
  const ac = cieq(meas.analysis, 'ac');
  const sp = cieq(meas.analysis, 'sp');
  const dc = cieq(meas.analysis, 'dc');
  const tran = !ac && !sp && !dc;
  if (tran && d.im) return 'no real data available for measurement (no tran simulation?)';

  let riseCnt = 0;
  let fallCnt = 0;
  let crossCnt = 0;
  let above = false;
  let prevValue = 0;
  let prevValue2 = 0;
  let prevScale = 0;
  let first = 0;
  let pending = false;
  let initMeasured = true;
  // True while `first === 1` comes from a .dc inner-sweep restart, where the
  // previous point belongs to the previous sweep and is not a neighbour.
  let restarted = false;

  for (let i = 0; i < d.re.length; i++) {
    const value = sample(meas, d, i, ac || sp);
    const scaleValue = scale.re[i];
    const value2 = d2 ? sample(meas, d2, i, ac || sp) : NaN;

    if (dc && i === 0) meas.td = scaleValue;
    if (tran && scaleValue < meas.td) continue;
    else if ((ac || sp) && scaleValue < 0) continue;

    if (dc) {
      if (scaleValue < meas.from || scaleValue > meas.to) continue;
    } else {
      if (scaleValue < meas.from) continue;
      if (meas.to !== 0 && scaleValue > meas.to) break;
    }

    // DC: the inner sweep jumped back to its first value.
    restarted = false;
    if (first > 1 && dc && meas.td === scaleValue) {
      first = 1;
      restarted = true;
    }

    const reference = hasD2 ? value2 : meas.val;
    const prevReference = hasD2 ? prevValue2 : meas.val;
    let firstIntervalCrossing = false;
    if (first === 1) {
      crossCnt = 0;
      if (value < reference) {
        above = false;
        if (prevValue >= prevReference) {
          fallCnt = 1;
          crossCnt = 1;
          if (meas.rise !== MEASURE_LAST_TRANSITION) firstIntervalCrossing = true;
        }
      } else {
        above = true;
        if (prevValue < prevReference) {
          riseCnt = 1;
          crossCnt = 1;
          if (meas.fall !== MEASURE_LAST_TRANSITION) firstIntervalCrossing = true;
        }
      }
      // Deliberate divergence from ngspice-47 (#811, ngspice ticket #574):
      // ngspice counts a crossing between the first two points of the plot
      // but never measures it, so `.dc v1 0 1 0.05` cannot find v(1)=0.05.
      // Measure it like any later crossing. A .dc restart is excluded: its
      // previous point is the end of the previous inner sweep.
      if (firstIntervalCrossing && !restarted) pending = true;
    }

    if (first > 1) {
      if (!above && value >= reference) {
        above = true;
        crossCnt++;
        riseCnt++;
        if (meas.fall !== MEASURE_LAST_TRANSITION) pending = true;
      } else if (above && value <= reference) {
        above = false;
        crossCnt++;
        fallCnt++;
        if (meas.rise !== MEASURE_LAST_TRANSITION) pending = true;
      }
    }

    if (first > 1 || pending) {
      const crossing = hasD2
        ? prevScale + ((prevValue2 - prevValue) * (scaleValue - prevScale)) / (value - prevValue - value2 + prevValue2)
        : prevScale + ((meas.val - prevValue) * (scaleValue - prevScale)) / (value - prevValue);
      if (crossCnt === meas.cross || riseCnt === meas.rise || fallCnt === meas.fall) {
        meas.measured = crossing;
        return undefined;
      }
      if (pending) {
        if (meas.cross === MEASURE_DEFAULT && meas.rise === MEASURE_DEFAULT && meas.fall === MEASURE_DEFAULT) {
          meas.measured = crossing;
          return undefined;
        } else if (
          meas.cross === MEASURE_LAST_TRANSITION || meas.rise === MEASURE_LAST_TRANSITION
          || meas.fall === MEASURE_LAST_TRANSITION
        ) {
          meas.measured = crossing;
          initMeasured = false;
        }
        pending = false;
      }
    }
    first++;
    prevValue = value;
    if (hasD2) prevValue2 = value2;
    prevScale = scaleValue;
  }
  if (initMeasured) meas.measured = NaN;
  return undefined;
}

/** measure_at, lines 665-758. */
function measureAt(meas: Measure, plot: MeasurePlot, at: number): string | undefined {
  if (meas.vec === undefined) return 'Syntax error in meas line, missing vector';
  const d = lookup(meas, plot, meas.vec);
  if (typeof d === 'string') return d;
  const scale = plot.scale;
  if (!scale) return 'no such vector time, frequency or dc.';
  const complex = isComplexAnalysis(meas);
  const dc = cieq(meas.analysis, 'dc');
  if (!complex && !dc && d.im) return 'no real data available for measurement (no tran simulation?)';
  let previousScale = 0;
  let previous = 0;
  for (let i = 0; i < d.re.length; i++) {
    const value = sample(meas, d, i, complex);
    const scaleValue = scale.re[i];
    if (i > 0 && previousScale <= at && scaleValue >= at) {
      meas.measured = previous + ((at - previousScale) * (value - previous)) / (scaleValue - previousScale);
      return undefined;
    } else if (dc && i > 0 && previousScale >= at && scaleValue <= at) {
      meas.measured = previous + ((at - previousScale) * (value - previous)) / (scaleValue - previousScale);
      return undefined;
    }
    previousScale = scaleValue;
    previous = value;
  }
  meas.measured = NaN;
  return undefined;
}

/** The scale vector AVG/MIN/MAX/RMS/INTEG read (lines 810-842 and 1015-1047). */
function analysisScale(meas: Measure, plot: MeasurePlot): ControlVector | string {
  if (isComplexAnalysis(meas)) {
    return plot.vector('frequency') ?? `meas ${meas.analysis} ...  no such scale vector as frequency.`;
  }
  if (cieq(meas.analysis, 'dc')) {
    return plot.vector('v-sweep') ?? plot.vector('i-sweep') ?? plot.vector('temp-sweep') ?? plot.vector('res-sweep')
      ?? `meas ${meas.analysis} ...  no such scale vector as v-sweep, i-sweep, temp-sweep, or res-sweep.`;
  }
  return plot.vector('time') ?? `meas ${meas.analysis} ...  no such scale vector as time.`;
}

/** measure_minMaxAvg, lines 767-967. */
function measureMinMaxAvg(meas: Measure, plot: MeasurePlot, kind: 'avg' | 'min' | 'max'): string | undefined {
  meas.measured = NaN;
  meas.measuredAt = NaN;
  if (meas.vec === undefined) return 'Syntax error in meas line';
  const d = lookup(meas, plot, meas.vec);
  if (typeof d === 'string') return d;
  const scale = analysisScale(meas, plot);
  if (typeof scale === 'string') return scale;
  if (d.re.length !== scale.re.length) {
    return `length of scale vector (${scale.name}) does not match length of data vector (${d.name}). Analysis is not possible.`;
  }
  const complex = cieq(meas.analysis, 'ac') || cieq(meas.analysis, 'sp');
  const dc = cieq(meas.analysis, 'dc');
  let first = false;
  let mValue = 0;
  let mValueAt = 0;
  let scaleValue = 0;
  let previous = 0;
  let previousScale = 0;
  let span = 0;
  for (let i = 0; i < d.re.length; i++) {
    const value = sample(meas, d, i, complex);
    scaleValue = scale.re[i];
    if (dc) {
      if (scaleValue < meas.from || scaleValue > meas.to) continue;
    } else {
      if (scaleValue < meas.from) continue;
      if (meas.to !== 0 && scaleValue > meas.to) break;
    }
    if (!first) {
      first = true;
      if (kind === 'avg') {
        mValue = 0;
        mValueAt = scaleValue;
        span = 0;
        previous = value;
        previousScale = scaleValue;
      } else {
        mValue = value;
        mValueAt = scaleValue;
      }
    } else if (kind === 'min') {
      if (value <= mValue) {
        mValue = value;
        mValueAt = scaleValue;
      }
    } else if (kind === 'max') {
      if (value >= mValue) {
        mValue = value;
        mValueAt = scaleValue;
      }
    } else {
      mValue += 0.5 * (value + previous) * (scaleValue - previousScale);
      span += scaleValue - previousScale;
      previous = value;
      previousScale = scaleValue;
    }
  }
  if (kind === 'avg') {
    meas.measured = mValue / (first ? span : 1);
    meas.measuredAt = scaleValue;
  } else {
    meas.measured = mValue;
    meas.measuredAt = mValueAt;
  }
  return undefined;
}

/** measure_rms_integral, lines 976-1172. */
function measureRmsIntegral(meas: Measure, plot: MeasurePlot, kind: 'rms' | 'integ'): string | undefined {
  meas.measured = NaN;
  meas.measuredAt = NaN;
  const d = lookup(meas, plot, meas.vec);
  if (typeof d === 'string') return d;
  const scale = analysisScale(meas, plot);
  if (typeof scale === 'string') return scale;
  const ac = cieq(meas.analysis, 'ac');
  const x: number[] = [];
  const y: number[] = [];
  let toValue = -1;
  let first = false;
  for (let i = 0; i < d.re.length; i++) {
    let value = ac ? sample(meas, d, i, true) : d.re[i];
    let xValue = scale.re[i];
    if (xValue < meas.from) continue;
    if (meas.to !== 0 && xValue > meas.to) {
      if (!almostEqualUlps(xValue, meas.to, 100)) {
        value = interpolateY(scale, d, i - 1, i, meas.to, meas);
        xValue = meas.to;
      }
      x.push(xValue);
      y.push(kind === 'rms' ? value * value : value);
      toValue = xValue;
      break;
    }
    if (!first) {
      if (meas.from !== 0 && i > 0 && !almostEqualUlps(xValue, meas.from, 100)) {
        value = interpolateY(scale, d, i - 1, i, meas.from, meas);
        xValue = meas.from;
      }
      meas.measuredAt = xValue;
      first = true;
    }
    x.push(xValue);
    y.push(kind === 'rms' ? value * value : value);
  }
  const size = x.length;
  // width[] and y[] come from zero-filled allocations; reads past the data see 0.
  const width = (index: number): number => (index < size - 1 ? x[index + 1] - x[index] : 0);
  const at = (index: number): number => (index < size ? y[index] : 0);
  let sum1 = 0;
  let sum2 = 0;
  let sum3 = 0;
  let i = 0;
  while (i < size - 1) {
    if (almostEqualUlps(width(i), width(i + 1), 100) && almostEqualUlps(width(i), width(i + 2), 100)) {
      sum1 += (3 * width(i) * (at(i) + 3 * (at(i + 1) + at(i + 2)) + at(i + 3))) / 8;
      i += 3;
    } else if (almostEqualUlps(width(i), width(i + 1), 100)) {
      sum2 += (width(i) * (at(i) + 4 * at(i + 1) + at(i + 2))) / 3;
      i += 2;
    } else {
      sum3 += (width(i) * (at(i) + at(i + 1))) / 2;
      i++;
    }
  }
  if (toValue < 0) toValue = scale.re[d.re.length - 1];
  meas.from = meas.measuredAt;
  meas.to = toValue;
  meas.measured = kind === 'rms'
    ? Math.sqrt((sum1 + sum2 + sum3) / (toValue - meas.measuredAt))
    : sum1 + sum2 + sum3;
  return undefined;
}
