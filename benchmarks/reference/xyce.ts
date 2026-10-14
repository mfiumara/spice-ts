import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { AnalysisType, ComparisonFixture, EngineRun, FailedEngineRun, SampleSeries } from '../comparison-harness.js';

export type ReferenceRun = (Extract<EngineRun, { status: 'success' }> |
  (Omit<FailedEngineRun, 'convergence'> & { convergence: 'unsupported' | 'not-run' | 'unknown' })) & {
    output?: string;
    failureKind?: 'translation' | 'execution' | 'netlist' | 'export' | 'parse';
  };

class TranslationLimitation extends Error {}
const limited = (message: string): never => { throw new TranslationLimitation(message); };
// Xyce Reference Guide 7.9, section 2.1.25 (plus FFT options).
const qualifiedOptions = new Set(('DEVICE DIAGNOSTIC TIMEINT NONLIN NONLIN-TRAN NONLIN-HB LOCA LINSOL LINSOL-HB LINSOL-AC ' +
  'HBINT OUTPUT RESTART SENSITIVITY PARSER FFT MEASURE DIST SAMPLES EMBEDDEDSAMPLES PCES').split(' '));

function signalParts(signal: string): { kind: string; args: string } {
  const match = /^([vi])\(([^\s(){}";]+)\)$/i.exec(signal);
  if (!match || !/^[^,]+(?:,[^,]+)?$/.test(match[2]) || (match[1].toLowerCase() === 'i' && match[2].includes(','))) {
    return limited(`Unsupported requested signal: ${signal}`);
  }
  return { kind: match[1].toUpperCase(), args: match[2] };
}

/** Only output cards are rewritten; no circuit/model parameters are downgraded. */
export function translateForXyce(fixture: ComparisonFixture): { netlist: string; changes: string[] } {
  if (!['op', 'dc', 'tran', 'ac'].includes(fixture.analysis)) limited(`Unsupported analysis: ${fixture.analysis}`);
  if (fixture.signals.length === 0) limited('At least one requested signal is required');
  const parts = fixture.signals.map(signalParts);
  if (new Set(fixture.signals.map(s => s.toUpperCase())).size !== fixture.signals.length) limited('Duplicate requested signals');
  const records: string[][] = [];
  for (const line of fixture.netlist.split(/\r?\n/)) {
    if (/^\s*\+/.test(line)) {
      if (records.length === 0) limited('Orphan netlist continuation');
      records[records.length - 1].push(line);
    } else records.push([line]);
  }
  const changes: string[] = [];
  const kept: string[] = [];
  let analysisCount = 0;
  let endCount = 0;
  let printIndex = -1;
  let dcGrid = '';
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    // SPICE's first physical line is the title, not a device or directive.
    const logical = record.map((s, i) => i ? s.replace(/^\s*\+/, '') : s).join(' ').trim();
    if (index === 0) { kept.push(...record); continue; }
    if (/^\.(?:control|endc)\b/i.test(logical)) limited('.control executed semantics cannot be translated');
    if (/^\.options?\b/i.test(logical)) {
      const qualifier = logical.split(/\s+/)[1]?.toUpperCase();
      if (!qualifiedOptions.has(qualifier)) limited('Unqualified or unknown .options cannot be translated without changing solver semantics');
    }
    // TYPE is not a generic ignorable parameter. In particular VSOURCE does not
    // establish a DC waveform. Until a documented mapping exists, fail closed.
    if (/^[vi]\S*\s+\S+\s+\S+.*\btype\s*=/i.test(logical)) limited('Source TYPE markers require a documented Xyce mapping');
    if (/^\.step\b/i.test(logical)) limited('.step output is outside this reference slice');
    // Keep the original bootstrap non-OP translation byte-for-byte reproducible.
    // Canonical multi-analysis callers supply a single-analysis projection.
    const analysis = (fixture.analysis === 'op' ? /^\.(op|dc|tran|ac)\b/i : /^\.(dc|tran|ac)\b/i).exec(logical);
    if (analysis) {
      if (analysis[1].toLowerCase() !== fixture.analysis) limited('Multiple or mismatched analyses');
      analysisCount++;
      if (fixture.analysis === 'dc') {
        const tokens = logical.split(/\s+/).slice(1);
        // The corpus SPICE linear source sweeps (including nested sweeps) are
        // native Xyce syntax. CSV has NO implicit DC grid (Reference Guide
        // 7.9, table 2-20); explicitly print the primary source parameter.
        if (tokens.length !== 4 && tokens.length !== 8) limited('Only linear one/two-source DC sweeps are supported');
        for (let i = 0; i < tokens.length; i += 4) {
          if (!/^[vi][\w.:!#-]*$/i.test(tokens[i])) limited('Unsupported DC sweep source');
        }
        dcGrid = `{${tokens[0]}}`;
      }
    }
    if (/^\.(print|plot)\b/i.test(logical)) {
      changes.push(`Removed ${logical.split(/\s+/)[0]} output card (including continuations)`);
      continue;
    }
    if (/^\.end\s*(?:[;$].*)?$/i.test(logical)) {
      endCount++;
      printIndex = kept.length;
    }
    kept.push(...record);
  }
  if (analysisCount !== 1 || endCount !== 1) limited('Exactly one matching analysis and one .end are required');
  const printed = parts.flatMap(({ kind, args }) => fixture.analysis === 'ac'
    ? [`${kind}R(${args})`, `${kind}I(${args})`] : [`${kind}(${args})`]);
  // Xyce exports the standalone operating point through its DC output manager.
  const print = `.print ${fixture.analysis === 'op' ? 'DC' : fixture.analysis.toUpperCase()} format=csv file=output.csv precision=17 ${[dcGrid, ...printed].filter(Boolean).join(' ')}`;
  changes.push(`Added ${print}`);
  kept.splice(printIndex, 0, print);
  return { netlist: kept.join('\n'), changes };
}

// Numeric rows use ordinary CSV. Headers need special handling below because
// Xyce 7.10 prints differential V(A,B) without CSV quoting.
function csvFields(line: string): string[] {
  const fields: string[] = [];
  const pattern = /(?:^|,)(?:"((?:[^"]|"")*)"|([^",]*))(?=,|$)/g;
  let end = 0;
  for (const match of line.matchAll(pattern)) {
    if (match.index !== end) throw new Error('Malformed CSV row');
    fields.push((match[1] === undefined ? match[2] : match[1].replace(/""/g, '"')).trim());
    end = match.index + match[0].length;
  }
  if (end !== line.length || fields.length === 0) throw new Error('Malformed CSV row');
  return fields;
}

function csvHeaders(line: string): string[] {
  const fields: string[] = [];
  let start = 0, depth = 0, quoted = false;
  for (let i = 0; i <= line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { i++; continue; }
      quoted = !quoted;
    } else if (!quoted && char === '(') depth++;
    else if (!quoted && char === ')') {
      if (--depth < 0) throw new Error('Malformed CSV header');
    }
    if (i === line.length || (char === ',' && !quoted && depth === 0)) {
      const field = line.slice(start, i).trim();
      if (field.startsWith('"')) {
        const decoded = csvFields(field);
        if (decoded.length !== 1) throw new Error('Malformed CSV header');
        fields.push(decoded[0]);
      } else {
        if (field.includes('"')) throw new Error('Malformed CSV header');
        fields.push(field);
      }
      start = i + 1;
    }
  }
  if (depth !== 0 || quoted) throw new Error('Malformed CSV header');
  return fields;
}

/** DC rows remain flattened in native sweep order, including grid restarts. */
export function parseXyceCsv(csv: string, analysis: AnalysisType, signals: string[]): SampleSeries {
  const lines = csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV has no sample rows');
  if (analysis === 'op' && lines.length !== 2) throw new Error('OP CSV must have exactly one sample');
  const headers = csvHeaders(lines[0]).map(s => s.toUpperCase());
  if (headers.some(s => !s) || new Set(headers).size !== headers.length) throw new Error('Empty or duplicate CSV headers');
  const gridHeader = analysis === 'tran' ? 'TIME' : analysis === 'ac' ? 'FREQ' : headers[0];
  if (analysis === 'dc' && !/^\{[VI][\w.:!#-]*\}$/.test(gridHeader)) throw new Error('Missing explicit DC sweep parameter column');
  const column = (name: string): number => {
    const index = headers.indexOf(name.toUpperCase());
    if (index < 0) throw new Error(`Missing CSV field: ${name}`);
    return index;
  };
  const gridIndex = analysis === 'op' ? -1 : column(gridHeader);
  const columns = signals.map(signal => {
    const { kind, args } = signalParts(signal);
    return analysis === 'ac' ? [column(`${kind}R(${args})`), column(`${kind}I(${args})`)] : [column(`${kind}(${args})`)];
  });
  if (signals.length === 0 || new Set(signals.map(s => s.toUpperCase())).size !== signals.length) throw new Error('Empty or duplicate requested signals');
  const series: SampleSeries = { grid: [], signals: Object.fromEntries(signals.map(s => [s.toLowerCase(), []])) };
  for (let row = 1; row < lines.length; row++) {
    const fields = csvFields(lines[row]);
    if (fields.length !== headers.length) throw new Error(`CSV row ${row} has wrong field count`);
    const values = fields.map(field => {
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(field) || !Number.isFinite(Number(field))) {
        throw new Error(`CSV row ${row} contains missing/nonfinite or invalid numeric field`);
      }
      return Number(field);
    });
    series.grid.push(analysis === 'op' ? 0 : values[gridIndex]);
    signals.forEach((signal, i) => series.signals[signal.toLowerCase()].push({ re: values[columns[i][0]], im: columns[i].length === 2 ? values[columns[i][1]] : 0 }));
  }
  return series;
}

export async function runXyce(fixture: ComparisonFixture, options: { executable?: string; timeoutMs?: number } = {}): Promise<ReferenceRun> {
  const start = performance.now();
  let command: string[] = [];
  let directory: string | undefined;
  let output = '';
  let failureKind: ReferenceRun['failureKind'] = 'translation';
  try {
    const translated = translateForXyce(fixture);
    const timeout = options.timeoutMs ?? 60_000;
    if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('timeoutMs must be positive and finite');
    directory = mkdtempSync(join(tmpdir(), 'spice-ts-xyce-'));
    writeFileSync(join(directory, 'input.cir'), translated.netlist);
    command = [options.executable ?? process.env.XYCE_BIN ?? 'Xyce', 'input.cir'];
    failureKind = 'execution';
    const result = spawnSync(command[0], command.slice(1), { cwd: directory, encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024, shell: false });
    output = [result.stdout, result.stderr].filter(Boolean).join('\n');
    if (result.error) throw result.error;
    if (result.status !== 0 && /undefined symbols in \.PRINT|print type .* inconsistent/i.test(output)) failureKind = 'export';
    else if (result.status !== 0 && /Netlist error/i.test(output)) failureKind = 'netlist';
    if (result.status !== 0) throw new Error(`Xyce exited ${result.status} (signal ${result.signal}): ${result.stderr}\n${result.stdout}`);
    failureKind = 'export';
    const csv = readFileSync(join(directory, 'output.csv'), 'utf8');
    failureKind = 'parse';
    const series = parseXyceCsv(csv, fixture.analysis, fixture.signals);
    // Preserve warnings even on successful execution. An ignored upstream card
    // must remain visible in the reference receipt, not become a silent win.
    return { status: 'success', convergence: 'converged', runtimeMs: performance.now() - start, command, series,
      output };
  } catch (error) {
    const status = error instanceof TranslationLimitation ? 'unsupported' : 'failed';
    return { status, convergence: status === 'unsupported' ? 'unsupported' : failureKind === 'execution' ? 'unknown' : 'not-run',
      failureKind: status === 'unsupported' ? 'translation' : failureKind, output,
      runtimeMs: performance.now() - start, command, error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  }
}
