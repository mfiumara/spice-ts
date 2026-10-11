#!/usr/bin/env tsx
/**
 * Deterministic ahkab -> SPICE3/ngspice translator for the corpus-d (ahkab test suite) fixtures
 * (issue #524, lane 1).
 *
 * Usage:
 *   pnpm exec tsx benchmarks/translate/ahkab-to-spice3.ts          # regenerate corpus-d-spice3
 *   pnpm exec tsx benchmarks/translate/ahkab-to-spice3.ts --check  # fail if committed output is stale
 *
 * Rules (from #524): the translation is purely syntactic and circuit-preserving. Every construct
 * the translator does not recognise, and every construct without an exact SPICE3/ngspice
 * equivalent, makes the fixture `unsupported-translation` with a reason. It never approximates.
 * The verbatim originals in benchmarks/corpus/corpus-d are only read, never written.
 *
 * The semantics mapped here were read from the pinned ahkab revision (netlist_parser.py,
 * time_functions.py, transient.py, ac.py, constants.py, diode.py, switch.py); the ngspice side from
 * ngspice-47 (vsrcload.c / isrcload.c for AM).
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const AHKAB_REVISION = '1e8939194b689909b8184ce7eba478b485ff9e3a';
/** Fixed modification date written into every translated header, so output is reproducible. */
export const TRANSLATION_DATE = '2026-10-11';
export const TRANSLATOR_PATH = 'benchmarks/translate/ahkab-to-spice3.ts';

export type TranslationResult =
  | { status: 'translated'; text: string; changes: string[] }
  | { status: 'unsupported-translation'; reasons: string[] };

/** ahkab `convert_units`: upper-cased number plus one exact multiplier (M is milli). */
export function ahkabValue(token: string): number {
  const text = token.trim().toUpperCase();
  let index = 0;
  while (index < text.length && /[0-9.+\-E]/.test(text[index])) index += 1;
  if (index === 0) throw new Error(`ahkab cannot parse value ${token}`);
  const numeric = Number(text.slice(0, index));
  if (!Number.isFinite(numeric)) throw new Error(`ahkab cannot parse value ${token}`);
  const multipliers: Record<string, number> = {
    '': 1, T: 1e12, G: 1e9, K: 1e3, M: 1e-3, U: 1e-6, N: 1e-9, P: 1e-12, F: 1e-15, MEG: 1e6, MIL: 25.4e-6,
  };
  const suffix = text.slice(index);
  if (!(suffix in multipliers)) throw new Error(`ahkab rejects multiplier ${suffix} in ${token}`);
  return suffix === '' ? numeric : numeric * multipliers[suffix];
}

/** SPICE3 number field: number, then a case-insensitive scale factor; trailing letters ignored. */
export function spiceValue(token: string): number {
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)([a-zA-Z]*)$/.exec(token.trim());
  if (!match) return Number.NaN;
  const numeric = Number(match[1]);
  const suffix = match[2].toUpperCase();
  const scales: Array<[string, number]> = [
    ['MEG', 1e6], ['MIL', 25.4e-6], ['T', 1e12], ['G', 1e9], ['K', 1e3], ['M', 1e-3], ['U', 1e-6],
    ['N', 1e-9], ['P', 1e-12], ['F', 1e-15],
  ];
  for (const [prefix, scale] of scales) {
    if (suffix.startsWith(prefix)) return numeric * scale;
  }
  return numeric;
}

interface TimeFunctionSpec {
  /** ahkab label, in ahkab positional order. */
  tokens: string[];
  required: string[];
}

/** `time_fun_specs` from ahkab time_functions.py at the pinned revision. */
const TIME_FUNCTIONS: Record<string, TimeFunctionSpec> = {
  sin: { tokens: ['vo', 'va', 'freq', 'td', 'theta'], required: ['vo', 'va', 'freq'] },
  exp: { tokens: ['v1', 'v2', 'td1', 'tau1', 'td2', 'tau2'], required: ['v1', 'v2', 'tau1'] },
  pulse: { tokens: ['v1', 'v2', 'td', 'tr', 'tf', 'pw', 'per'], required: ['v1', 'v2', 'tr', 'tf', 'pw', 'per'] },
  sffm: { tokens: ['vo', 'va', 'fc', 'mdi', 'fs', 'td'], required: ['vo', 'va', 'mdi', 'fs'] },
  am: { tokens: ['sa', 'oc', 'fm', 'fc', 'td'], required: ['sa', 'oc', 'fm', 'fc'] },
};

/** Tokens ahkab's source parsers consume after `type=<function>` (parse_elem_vsource). */
const FUNCTION_TOKEN_COUNT: Record<string, number> = { pulse: 7, exp: 6, sin: 5, sffm: 5, am: 5 };

interface ParsedFunction {
  kind: string;
  /** ahkab label -> original token. */
  values: Map<string, string>;
}

interface DeckState {
  changes: string[];
  reasons: string[];
  /** Initial-condition values given on C/L elements. */
  elementIcs: number[];
  /** Independent sources whose DC value or value at t=0 is not exactly zero. */
  nonZeroSourcesAtStart: string[];
  hasDiode: boolean;
}

function note(list: string[], message: string): void {
  if (!list.includes(message)) list.push(message);
}

function keyValue(token: string): [string, string] | null {
  const parts = token.split('=');
  return parts.length === 2 ? [parts[0].toLowerCase(), parts[1]] : null;
}

/** Keep the token if ahkab and SPICE3 read the same number, else write the ahkab value. */
function numberToken(token: string, state: DeckState): string {
  const value = ahkabValue(token);
  if (spiceValue(token) === value) return token;
  note(state.changes, `rewrote value ${token} as ${value} (SPICE3 reads the token differently)`);
  return String(value);
}

function parseTimeFunction(kind: string, tokens: string[], element: string, state: DeckState): ParsedFunction | null {
  const spec = TIME_FUNCTIONS[kind];
  const values = new Map<string, string>();
  const remaining = [...spec.tokens];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.startsWith('*')) break;
    const pair = keyValue(token);
    const label = pair ? pair[0] : spec.tokens[index];
    const value = pair ? pair[1] : token;
    if (!label || !remaining.includes(label)) {
      note(state.reasons, `${element}: ahkab rejects ${kind} parameter ${token}`);
      return null;
    }
    remaining.splice(remaining.indexOf(label), 1);
    values.set(label, value);
  }
  const missing = spec.required.filter(label => !values.has(label));
  if (missing.length > 0) {
    note(state.reasons, `${element}: ${kind} source is missing ${missing.join(', ')}`);
    return null;
  }
  return { kind, values };
}

/** Exact SPICE3/ngspice spelling of an ahkab time function, or null with a reason. */
function spiceFunction(fn: ParsedFunction, element: string, state: DeckState): { text: string; valueAtZero: number } | null {
  const get = (label: string): string | undefined => fn.values.get(label);
  const num = (label: string, fallback: number): number => {
    const token = get(label);
    return token === undefined ? fallback : ahkabValue(token);
  };
  const tok = (label: string, fallback: string): string => {
    const token = get(label);
    return token === undefined ? fallback : numberToken(token, state);
  };
  if (fn.kind === 'pulse') {
    const td = num('td', 0);
    const tr = num('tr', 0);
    const tf = num('tf', 0);
    const pw = num('pw', 0);
    const per = num('per', 0);
    // ahkab wraps the absolute time modulo PER before applying TD; SPICE3 wraps (t - TD). The
    // two waveforms coincide only when one full pulse fits inside the first period.
    if (td < 0 || tr <= 0 || tf <= 0 || per <= 0 || td + tr + pw + tf > per) {
      note(state.reasons, `${element}: ahkab PULSE timing (td=${td}, tr=${tr}, tf=${tf}, pw=${pw}, per=${per}) differs from SPICE3 PULSE`);
      return null;
    }
    note(state.changes, 'ahkab keyed `type=pulse v1= v2= td= tr= tf= pw= per=` written as positional SPICE3 PULSE(v1 v2 td tr tf pw per)');
    return {
      text: `PULSE(${tok('v1', '0')} ${tok('v2', '0')} ${tok('td', '0')} ${tok('tr', '0')} ${tok('tf', '0')} ${tok('pw', '0')} ${tok('per', '0')})`,
      valueAtZero: num('v1', 0),
    };
  }
  if (fn.kind === 'sin') {
    // ahkab sin(): vo + va*exp(-(t-td)*theta)*sin(2*pi*freq*(t-td)) for t >= td, vo before td
    // (phi is not settable from a netlist). Identical to SPICE3 SIN(VO VA FREQ TD THETA).
    note(state.changes, 'ahkab `type=sin` written as SPICE3 SIN(vo va freq td theta) (same formula, phase fixed at 0 in ahkab netlists)');
    return {
      text: `SIN(${tok('vo', '0')} ${tok('va', '0')} ${tok('freq', '0')} ${tok('td', '0')} ${tok('theta', '0')})`,
      valueAtZero: num('vo', 0),
    };
  }
  if (fn.kind === 'am') {
    if (get('td') === undefined) {
      note(state.reasons, `${element}: ahkab AM without td compares time against None; no SPICE3 equivalent`);
      return null;
    }
    // ahkab am(): 0 for t <= td, else sa*(oc + sin(2*pi*fm*(t-td)))*sin(2*pi*fc*(t-td)).
    // ngspice-47 AM(VO VMO VMA FM FC TD): 0 for t <= td, else
    // VO + (VMO + VMA*sin(2*pi*FM*(t-td)))*sin(2*pi*FC*(t-td)). Exact with VO=0, VMO=sa*oc, VMA=sa.
    const sa = num('sa', 0);
    const oc = num('oc', 0);
    const vmo = sa * oc;
    note(state.changes, 'ahkab `type=am sa oc fm fc td` written as ngspice AM(0 sa*oc sa fm fc td) (identical waveform; AM is an ngspice extension, not SPICE3f5)');
    return {
      text: `AM(0 ${String(vmo)} ${tok('sa', '0')} ${tok('fm', '0')} ${tok('fc', '0')} ${tok('td', '0')})`,
      valueAtZero: 0,
    };
  }
  note(state.reasons, `${element}: ahkab ${fn.kind.toUpperCase()} source translation is not implemented`);
  return null;
}

function translateSource(tokens: string[], state: DeckState): string | null {
  const element = tokens[0];
  const current = element[0].toLowerCase() === 'i';
  const dcLabel = current ? 'idc' : 'vdc';
  const acLabel = current ? 'iac' : 'vac';
  if (tokens.length < 3) {
    note(state.reasons, `${element}: malformed source`);
    return null;
  }
  let dc: string | undefined;
  let ac: string | undefined;
  let fn: ParsedFunction | null = null;
  for (let index = 3; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.startsWith('*')) break;
    const pair = keyValue(token);
    if (!pair) {
      note(state.reasons, `${element}: ahkab rejects source token ${token}`);
      return null;
    }
    const [label, raw] = pair;
    const value = raw.toLowerCase();
    if (label === 'type') {
      if (value === dcLabel || value === acLabel) continue;
      const count = FUNCTION_TOKEN_COUNT[value];
      if (count === undefined) {
        note(state.reasons, `${element}: unknown ahkab source type ${raw}`);
        return null;
      }
      if (fn) {
        note(state.reasons, `${element}: ahkab rejects a second time function`);
        return null;
      }
      fn = parseTimeFunction(value, tokens.slice(index + 1, index + 1 + count), element, state);
      if (!fn) return null;
      index += count;
    } else if (label === dcLabel) {
      dc = raw;
    } else if (label === acLabel) {
      ac = raw;
    } else {
      note(state.reasons, `${element}: unknown ahkab source parameter ${label}`);
      return null;
    }
  }
  if (dc === undefined) {
    // ahkab then has dc_value=None; its OP/DC meaning for such a source is not a netlist value.
    note(state.reasons, `${element}: ahkab source without ${dcLabel}= has no defined SPICE3 DC value`);
    return null;
  }
  const parts = [tokens[0], tokens[1], tokens[2], 'DC', numberToken(dc, state)];
  note(state.changes, `ahkab \`type=${dcLabel} ${dcLabel}=X\` written as SPICE3 \`DC X\``);
  if (ac !== undefined) {
    parts.push('AC', numberToken(ac, state));
    note(state.changes, `ahkab \`${acLabel}=X\` written as SPICE3 \`AC X\``);
  }
  let valueAtZero = ahkabValue(dc);
  if (fn) {
    const translated = spiceFunction(fn, element, state);
    if (!translated) return null;
    parts.push(translated.text);
    valueAtZero = translated.valueAtZero;
  }
  if (ahkabValue(dc) !== 0 || valueAtZero !== 0) state.nonZeroSourcesAtStart.push(element);
  return parts.join(' ');
}

function translatePassive(tokens: string[], original: string, state: DeckState): string | null {
  const element = tokens[0];
  const kind = element[0].toLowerCase();
  if (tokens.length < 4) {
    note(state.reasons, `${element}: malformed element`);
    return null;
  }
  const out = [tokens[0], tokens[1], tokens[2], numberToken(tokens[3], state)];
  for (const token of tokens.slice(4)) {
    const pair = keyValue(token);
    if ((kind === 'c' || kind === 'l') && pair?.[0] === 'ic') {
      state.elementIcs.push(ahkabValue(pair[1]));
      out.push(`ic=${numberToken(pair[1], state)}`);
    } else {
      note(state.reasons, `${element}: unsupported ahkab element parameter ${token}`);
      return null;
    }
  }
  const text = out.join(' ');
  return text === tokens.join(' ') ? original : text;
}

interface PendingTran {
  tstep: string;
  tstop: string;
  uic: number;
  method?: string;
}

function parseKeyed(
  tokens: string[],
  positional: Array<string | null>,
  allowed: string[],
  directive: string,
  state: DeckState,
): Map<string, string> | null {
  const values = new Map<string, string>();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.startsWith('*')) break;
    const pair = keyValue(token);
    const label = pair ? pair[0] : positional[index] ?? undefined;
    if (!label || !allowed.includes(label) || values.has(label)) {
      note(state.reasons, `${directive}: ahkab rejects parameter ${token}`);
      return null;
    }
    values.set(label, pair ? pair[1] : token);
  }
  return values;
}

function translateTran(tokens: string[], state: DeckState): PendingTran | null {
  // transient.py specs: tstep pos 0, tstop pos 1, uic pos 2; tstart, ic_label, method keyed only.
  const values = parseKeyed(tokens.slice(1), ['tstep', 'tstop', 'uic'], ['tstep', 'tstop', 'uic', 'tstart', 'ic_label', 'method'], '.tran', state);
  if (!values) return null;
  if (!values.has('tstep') || !values.has('tstop')) {
    note(state.reasons, '.tran: missing tstep or tstop');
    return null;
  }
  if (values.has('tstart') && ahkabValue(values.get('tstart') ?? '0') !== 0) {
    note(state.reasons, '.tran: non-zero ahkab tstart translation is not implemented');
    return null;
  }
  const uic = values.has('uic') ? Math.trunc(ahkabValue(values.get('uic') ?? '0')) : 0;
  if (uic === 3 || values.has('ic_label')) {
    note(state.reasons, '.tran: ahkab uic=3/ic_label (named .ic set) has no SPICE3 equivalent');
    return null;
  }
  return {
    tstep: numberToken(values.get('tstep') ?? '', state),
    tstop: numberToken(values.get('tstop') ?? '', state),
    uic,
    method: values.get('method')?.toLowerCase(),
  };
}

/**
 * ahkab's transient start state, mapped to SPICE3 only where the two are provably identical:
 *   uic=0: x(0)=0 (no OP). SPICE3 UIC with no element ICs is the same zero state.
 *   uic=2: OP, then element ICs override (dc_analysis.modify_x0_for_ic). When every independent
 *          source is 0 in DC and at t=0 and every element IC is 0, the OP is the zero state and
 *          equals SPICE3 UIC with those (zero) element ICs.
 *   uic=1: OP of the DC values; SPICE3 (no UIC) takes the OP at t=0; same only if the source
 *          values at t=0 equal their DC values, which is not checked here: unsupported.
 */
function tranLine(tran: PendingTran, state: DeckState): string | null {
  if (tran.uic === 0) {
    if (state.elementIcs.length > 0) {
      note(state.reasons, '.tran: ahkab uic=0 ignores element ICs while SPICE3 UIC applies them');
      return null;
    }
    note(state.changes, 'ahkab `.tran` uic=0 (start from x=0, no OP) written as SPICE3 `UIC` (no element ICs present, so both start from the zero state)');
    return `.tran ${tran.tstep} ${tran.tstop} UIC`;
  }
  if (tran.uic === 2) {
    if (state.nonZeroSourcesAtStart.length > 0 || state.elementIcs.some(value => value !== 0)) {
      note(state.reasons, '.tran: ahkab uic=2 (OP then element-IC override) has no SPICE3 equivalent unless the OP and all ICs are zero');
      return null;
    }
    note(state.changes, 'ahkab `.tran` uic=2 (OP, then element ICs) written as SPICE3 `UIC`: all sources are 0 in DC and at t=0 and all element ICs are 0, so both start from the zero state');
    return `.tran ${tran.tstep} ${tran.tstop} UIC`;
  }
  note(state.reasons, `.tran: ahkab uic=${tran.uic} has no exact SPICE3 equivalent here`);
  return null;
}

function methodOption(method: string | undefined, state: DeckState): string | null | undefined {
  if (method === undefined) return undefined; // ahkab default TRAP == SPICE3 default trapezoidal
  if (method === 'trap') {
    note(state.changes, 'ahkab `method=trap` written as `.options method=trap`');
    return '.options method=trap';
  }
  const gear = /^gear([2-6])$/.exec(method);
  if (gear) {
    note(
      state.changes,
      `ahkab \`method=${method}\` written as \`.options method=gear maxord=${gear[1]}\`: SPICE3/ngspice Gear is variable-order up to MAXORD while ahkab GEAR${gear[1]} is fixed-order. The circuit and the requested analysis are unchanged; the integration-error behaviour is not ahkab's`,
    );
    return `.options method=gear maxord=${gear[1]}`;
  }
  note(state.reasons, `.tran: ahkab integration method ${method} has no SPICE3 equivalent`);
  return null;
}

function translateAc(tokens: string[], state: DeckState): string | null {
  // ac.py specs: type pos 0 (LOG default), nsteps pos 1 (number of points, both ends included),
  // start pos 2, stop pos 3.
  const values = parseKeyed(tokens.slice(1), ['type', 'nsteps', 'start', 'stop'], ['type', 'nsteps', 'start', 'stop'], '.ac', state);
  if (!values) return null;
  const points = ahkabValue(values.get('nsteps') ?? 'NaN');
  const start = ahkabValue(values.get('start') ?? 'NaN');
  const stop = ahkabValue(values.get('stop') ?? 'NaN');
  const sweep = (values.get('type') ?? 'log').toLowerCase();
  if (sweep === 'lin' && Number.isInteger(points)) {
    return `.ac lin ${points} ${numberToken(values.get('start') ?? '', state)} ${numberToken(values.get('stop') ?? '', state)}`;
  }
  if (sweep === 'log') {
    const perDecade = (points - 1) / Math.log10(stop / start);
    if (Math.abs(perDecade - Math.round(perDecade)) < 1e-9) {
      return `.ac dec ${Math.round(perDecade)} ${numberToken(values.get('start') ?? '', state)} ${numberToken(values.get('stop') ?? '', state)}`;
    }
    note(
      state.reasons,
      `.ac: ahkab LOG sweep of ${points} points from ${start} to ${stop} Hz is ${perDecade.toPrecision(12)} points/decade; SPICE3 .ac dec needs an integer, so the frequency grid cannot be reproduced`,
    );
    return null;
  }
  note(state.reasons, `.ac: ahkab sweep ${sweep} with ${points} points has no SPICE3 equivalent`);
  return null;
}

function translatePlot(tokens: string[], state: DeckState): string | null {
  const analysis = tokens[1]?.toLowerCase();
  const outputs: string[] = [];
  for (const token of tokens.slice(2)) {
    if (token.startsWith('*')) break;
    const magnitude = /^\|([vi])\(([^()]+)\)\|$/i.exec(token);
    if (magnitude && analysis === 'ac') {
      outputs.push(`${magnitude[1].toLowerCase()}m(${magnitude[2]})`);
      note(state.changes, 'ahkab `|v(x)|` plot output written as SPICE3 `vm(x)`');
    } else if (/^[vi]\([^()]+\)$/i.test(token)) {
      outputs.push(token);
    } else {
      note(state.reasons, `.plot: ahkab output ${token} has no SPICE3 spelling`);
      return null;
    }
  }
  if (!analysis || !['tran', 'ac', 'dc'].includes(analysis) || outputs.length === 0) {
    note(state.reasons, `.plot: unsupported ahkab plot ${tokens.join(' ')}`);
    return null;
  }
  return `.plot ${analysis} ${outputs.join(' ')}`;
}

const DIRECTIVE_REASONS: Record<string, string> = {
  '.symbolic': 'ahkab .symbolic (symbolic small-signal analysis) has no SPICE3 equivalent',
  '.fft': 'ahkab .fft (np-point FFT of a transient result) has no exact SPICE3 equivalent; .four computes 9 harmonics of a given fundamental, a different output',
  '.pss': 'ahkab .pss (periodic steady state by shooting/brute force) has no SPICE3 equivalent',
  '.pz': 'ahkab .pz (circuit poles plus zeros from a named source to an output) is not translated: equivalence with SPICE3 .pz on a node-pair port has not been established',
  '.ic': 'ahkab named .ic sets (used through uic=3/ic_label) have no SPICE3 equivalent',
  '.dc': 'ahkab keyed .dc sweep translation is not implemented (every corpus-d .dc deck also uses the EKV model)',
  '.subckt': 'ahkab named-port subcircuit syntax translation is not implemented',
};

/** Split into logical lines: `+` continuations are joined (netlist_parser.py join_lines). */
function logicalLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (line.trimStart().startsWith('+') && out.length > 0) {
      out[out.length - 1] = `${out[out.length - 1]} ${line.trimStart().slice(1).trim()}`;
    } else {
      out.push(line);
    }
  }
  return out;
}

export function translateAhkabDeck(source: string, sourcePath: string): TranslationResult {
  const state: DeckState = { changes: [], reasons: [], elementIcs: [], nonZeroSourcesAtStart: [], hasDiode: false };
  const rawLines = source.replace(/\r\n/g, '\n').split('\n');
  const title = rawLines[0] ?? '';
  const body: string[] = [];
  let pendingTran: PendingTran | null = null;
  let tranIndex = -1;
  const options: string[] = [];
  let sawEnd = false;

  for (const rawLine of logicalLines(rawLines.slice(1))) {
    const line = rawLine.replace(/\s+$/, '');
    const trimmed = line.trim();
    if (trimmed === '') {
      body.push('');
      continue;
    }
    if (trimmed.startsWith('*')) {
      body.push(line);
      continue;
    }
    const allTokens = trimmed.split(/\s+/);
    const commentAt = allTokens.findIndex(token => token.startsWith('*'));
    const tokens = commentAt >= 0 ? allTokens.slice(0, commentAt) : allTokens;
    if (commentAt >= 0) {
      body.push(`* ${allTokens.slice(commentAt).join(' ').replace(/^\*\s*/, '')}`);
      note(state.changes, 'ahkab inline `*` comment moved to its own comment line');
    }
    const head = tokens[0].toLowerCase();
    const plain = commentAt >= 0 ? tokens.join(' ') : line;

    if (head.startsWith('.')) {
      if (head === '.end') {
        sawEnd = true;
        break;
      }
      if (head === '.op') {
        if (tokens.length > 1) note(state.reasons, `.op: ahkab option ${tokens.slice(1).join(' ')} has no SPICE3 equivalent`);
        else body.push('.op');
      } else if (head === '.tran') {
        const tran = translateTran(tokens, state);
        if (tran) {
          pendingTran = tran;
          tranIndex = body.length;
          body.push('<tran>');
          const option = methodOption(tran.method, state);
          if (option) options.push(option);
        }
      } else if (head === '.ac') {
        const ac = translateAc(tokens, state);
        if (ac) body.push(ac);
      } else if (head === '.plot') {
        const plot = translatePlot(tokens, state);
        if (plot) body.push(plot);
      } else if (head === '.model') {
        const kind = tokens[1]?.toLowerCase();
        const name = tokens[2];
        if (kind === 'diode' && name && tokens.length === 3) {
          body.push(`.model ${name} D`);
          note(state.changes, 'ahkab `.model diode <name>` (type before name) written as SPICE3 `.model <name> D`; the ahkab diode defaults IS=1e-14, N=1, RS=0, CJ0=0, TT=0, BV=inf, IBV=1e-3, EG=1.11, XTI=3 equal the SPICE3 defaults (ahkab VJ=0.7 vs SPICE3 1 V only enters through CJ0=0)');
        } else if (kind === 'ekv') {
          note(state.reasons, 'EKV MOSFET model (.model ekv ...) has no SPICE3/ngspice equivalent');
        } else if (kind === 'sw') {
          note(state.reasons, 'ahkab switch model is a tanh-smoothed resistor whose VON/VOFF are converted to VT and VH=VT*1e-3; SPICE3 SW is an abrupt hysteretic switch without VON/VOFF, so any mapping would approximate');
        } else {
          note(state.reasons, `.model: ahkab model ${tokens.slice(1).join(' ')} translation is not implemented`);
        }
      } else if (DIRECTIVE_REASONS[head]) {
        note(state.reasons, DIRECTIVE_REASONS[head]);
      } else if (head === '.ends') {
        // reported with .subckt
      } else {
        note(state.reasons, `unrecognised ahkab directive ${tokens[0]}`);
      }
      continue;
    }

    const kind = head[0];
    if (kind === 'r' || kind === 'c' || kind === 'l') {
      const out = translatePassive(tokens, plain, state);
      if (out) body.push(out);
    } else if (kind === 'v' || kind === 'i') {
      const out = translateSource(tokens, state);
      if (out) body.push(out);
    } else if (kind === 'd') {
      state.hasDiode = true;
      if (tokens.length === 4) body.push(plain);
      else note(state.reasons, `${tokens[0]}: ahkab diode instance parameters translation is not implemented`);
    } else if (kind === 'h' || kind === 'k') {
      // H: n+ n- vsource value; K: L1 L2 k. Same field order in SPICE3.
      if (tokens.length === 5 && kind === 'h') body.push(plain);
      else if (tokens.length === 4 && kind === 'k') body.push(plain);
      else note(state.reasons, `${tokens[0]}: unsupported ahkab ${kind.toUpperCase()} syntax`);
    } else if (kind === 'm') {
      note(state.reasons, 'MOSFET instances need an ahkab MOS model (EKV or square-law), neither of which is a SPICE3 model');
    } else if (kind === 's') {
      note(state.reasons, 'voltage-controlled switch instances use the ahkab switch model (see the model reason)');
    } else if (kind === 'x') {
      note(state.reasons, 'ahkab named-port subcircuit instances (name=/port=node) translation is not implemented');
    } else {
      note(state.reasons, `${tokens[0]}: unsupported ahkab element`);
    }
  }

  if (pendingTran) {
    const line = tranLine(pendingTran, state);
    if (line) body[tranIndex] = line;
  }
  if (state.reasons.length > 0) return { status: 'unsupported-translation', reasons: state.reasons };

  while (body.length > 0 && body[body.length - 1] === '') body.pop();
  if (state.hasDiode) {
    // ahkab evaluates every device at constants.T = Tref = 300 K (26.85 C); SPICE3 defaults to
    // TEMP = TNOM = 27 C (300.15 K).
    options.push('.options tnom=26.85');
    body.push('.temp 26.85');
    note(state.changes, 'added `.temp 26.85` and `.options tnom=26.85`: ahkab simulates and specifies diode parameters at 300 K, SPICE3 defaults to 27 C (300.15 K)');
  }
  if (!sawEnd) note(state.changes, 'added the `.end` card SPICE3 requires');
  while (body.length > 0 && body[body.length - 1] === '') body.pop();

  const header = [
    `* SPICE3/ngspice translation of ahkab ${sourcePath} (https://github.com/ahkab/ahkab @ ${AHKAB_REVISION}).`,
    '* ahkab is free software under GPL-2.0-only; see LICENSE-NOTICE.md and COPYING.txt in this directory.',
    `* Modified ${TRANSLATION_DATE} by ${TRANSLATOR_PATH} (spice-ts). Line 1 is the upstream title. Changes:`,
    ...state.changes.map(change => `*  - ${change}`),
  ];
  const text = [title, ...header, ...body, ...options, '.end', ''].join('\n');
  return { status: 'translated', text, changes: state.changes };
}

/* ------------------------------------------------------------------------------------------ */
/* Corpus generation                                                                            */
/* ------------------------------------------------------------------------------------------ */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const SOURCE_DIR = 'benchmarks/corpus/corpus-d';
export const TARGET_DIR = 'benchmarks/corpus/corpus-d-spice3';
export const MANIFEST_PATH = `${TARGET_DIR}/manifest.json`;

interface SourceManifest {
  source: Record<string, string>;
  circuits: Array<{ id: string; category: string; sourcePath: string; localPath: string; sha256: string }>;
}

export interface AhkabReference {
  analysis: 'op' | 'tran';
  sourceUrl: string;
  localPath: string;
  sha256: string;
}

export interface TranslatedCircuit {
  id: string;
  category: string;
  sourcePath: string;
  sourceUrl: string;
  originalLocalPath: string;
  originalSha256: string;
  translation:
    | { status: 'translated'; changes: string[] }
    | { status: 'unsupported-translation'; reasons: string[] };
  /** Present only for translated fixtures: the SPICE3 deck both engines receive byte-identically. */
  analyses?: string[];
  localPath?: string;
  sha256?: string;
  /** Result files shipped by the ahkab test suite for this circuit (third reference column). */
  ahkabReferences?: AhkabReference[];
}

export interface TranslatedManifest {
  schemaVersion: 1;
  source: Record<string, string>;
  circuits: TranslatedCircuit[];
}

const MECHANICAL_ADAPTATION = [
  `Deterministic syntactic translation by ${TRANSLATOR_PATH} from the byte-identical corpus-d originals (which stay unchanged in ${SOURCE_DIR}).`,
  'Per translated deck: line 1 (the title) is kept verbatim and a comment header records the upstream file, licence, modification date and every change.',
  'Mappings: type=vdc/idc vdc=/idc= -> DC; vac=/iac= -> AC; keyed ahkab PULSE/SIN -> positional SPICE3 PULSE/SIN (same formulas); ahkab AM(sa oc fm fc td) -> ngspice AM(0 sa*oc sa fm fc td) (same waveform);',
  '`.model diode <name>` -> `.model <name> D` (ahkab diode defaults equal SPICE3 defaults); `.tran` uic=0 or uic=2 -> UIC only where both provably start from the zero state; method=trap -> .options method=trap; method=gearN -> .options method=gear maxord=N (variable- instead of fixed-order Gear, stated per deck);',
  'decks with diodes get `.temp 26.85` and `.options tnom=26.85` because ahkab evaluates devices at 300 K; inline `*` comments move to their own line; `.end` is added where missing.',
  'Anything else (EKV MOSFETs, the tanh-smoothed ahkab switch, .symbolic, .fft, .pss, ahkab .pz, AC log grids with non-integer points per decade, named .ic sets, named-port subcircuits) is not approximated: the fixture is marked unsupported-translation with the reasons.',
].join(' ');

function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

function analysesOf(text: string): string[] {
  const order = ['op', 'dc', 'ac', 'tran'];
  const found = new Set<string>();
  for (const line of text.split('\n')) {
    const match = /^\.(op|dc|ac|tran)\b/i.exec(line.trim());
    if (match) found.add(match[1].toLowerCase());
  }
  return order.filter(analysis => found.has(analysis));
}

/** Translate every corpus-d fixture and build the manifest. Reads only committed files. */
export async function buildTranslations(root = ROOT): Promise<{ manifest: TranslatedManifest; files: Map<string, string> }> {
  const sourceManifest = JSON.parse(await readFile(resolve(root, SOURCE_DIR, 'manifest.json'), 'utf8')) as SourceManifest;
  const upstream = sourceManifest.source;
  if (upstream.revision !== AHKAB_REVISION) throw new Error(`corpus-d revision ${upstream.revision} is not ${AHKAB_REVISION}`);
  const files = new Map<string, string>();
  const circuits: TranslatedCircuit[] = [];
  for (const circuit of sourceManifest.circuits) {
    const bytes = await readFile(resolve(root, circuit.localPath));
    if (sha256(bytes) !== circuit.sha256) throw new Error(`${circuit.id}: original fixture SHA-256 mismatch`);
    const result = translateAhkabDeck(bytes.toString('utf8'), circuit.sourcePath);
    const entry: TranslatedCircuit = {
      id: circuit.id,
      category: circuit.category,
      sourcePath: circuit.sourcePath,
      sourceUrl: `https://raw.githubusercontent.com/ahkab/ahkab/${AHKAB_REVISION}/${circuit.sourcePath}`,
      originalLocalPath: circuit.localPath,
      originalSha256: circuit.sha256,
      translation: result.status === 'translated'
        ? { status: 'translated', changes: result.changes }
        : { status: 'unsupported-translation', reasons: result.reasons },
    };
    if (result.status === 'translated') {
      const localPath = `${TARGET_DIR}/fixtures/${circuit.sourcePath.replace(/\.ckt$/, '.cir')}`;
      files.set(localPath, result.text);
      entry.analyses = analysesOf(result.text);
      entry.localPath = localPath;
      entry.sha256 = sha256(result.text);
      const directory = dirname(circuit.sourcePath);
      const stem = basename(circuit.sourcePath, '.ckt');
      const references: AhkabReference[] = [];
      for (const analysis of ['op', 'tran'] as const) {
        const upstreamPath = `${directory}/${stem}-ref.${analysis}`;
        const localReference = `${TARGET_DIR}/references/${upstreamPath}`;
        const referenceBytes = await readFile(resolve(root, localReference)).catch(() => null);
        if (!referenceBytes) continue;
        references.push({
          analysis,
          sourceUrl: `https://raw.githubusercontent.com/ahkab/ahkab/${AHKAB_REVISION}/${upstreamPath}`,
          localPath: localReference,
          sha256: sha256(referenceBytes),
        });
      }
      if (references.length > 0) entry.ahkabReferences = references;
    }
    circuits.push(entry);
  }
  const manifest: TranslatedManifest = {
    schemaVersion: 1,
    source: {
      name: 'ahkab test-suite circuits (SPICE3/ngspice translation)',
      repository: upstream.repository,
      revision: upstream.revision,
      license: upstream.license,
      licenseUrl: upstream.licenseUrl,
      licenseNoticeSourceUrl: upstream.licenseNoticeSourceUrl,
      licenseNoticeLocalPath: `${TARGET_DIR}/LICENSE-NOTICE.md`,
      licenseNoticeSha256: upstream.licenseNoticeSha256,
      licenseTextSourceUrl: upstream.licenseTextSourceUrl,
      licenseTextLocalPath: `${TARGET_DIR}/COPYING.txt`,
      licenseTextSha256: upstream.licenseTextSha256,
      redistributionDecision: 'Allowed under GPL-2.0-only. Translated decks are modified versions of the upstream test circuits: each carries a header naming the upstream file, the modification date and every change, and the upstream notice and complete GPLv2 text are distributed alongside. ahkab reference result files are copied byte-for-byte.',
      mechanicalAdaptation: MECHANICAL_ADAPTATION,
      translator: TRANSLATOR_PATH,
      translationDate: TRANSLATION_DATE,
      originalCorpus: SOURCE_DIR,
    },
    circuits,
  };
  files.set(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, files };
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check');
  const { manifest, files } = await buildTranslations();
  const stale: string[] = [];
  for (const [path, text] of files) {
    const absolute = resolve(ROOT, path);
    if (check) {
      const committed = await readFile(absolute, 'utf8').catch(() => null);
      if (committed !== text) stale.push(path);
    } else {
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, text);
    }
  }
  const translated = manifest.circuits.filter(circuit => circuit.translation.status === 'translated').length;
  console.log(`ahkab -> SPICE3: ${translated} translated, ${manifest.circuits.length - translated} unsupported-translation`);
  if (stale.length > 0) {
    console.error(`stale translations (rerun without --check): ${stale.join(', ')}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
