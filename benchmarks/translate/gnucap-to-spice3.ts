#!/usr/bin/env tsx
/**
 * Deterministic Gnucap -> SPICE3 (ngspice dialect) translator for corpus-e (issue #524, lane 2).
 *
 * Usage:
 *   pnpm exec tsx benchmarks/translate/gnucap-to-spice3.ts           # regenerate corpus-e-spice3
 *   pnpm exec tsx benchmarks/translate/gnucap-to-spice3.ts --check   # fail if committed output is stale
 *
 * Input: every corpus-e fixture that ngspice rejects verbatim (`ngspice.expectedStatus === 'fail'`
 * in benchmarks/corpus/corpus-e/manifest.json), read from the pinned, byte-identical originals.
 * Output: benchmarks/corpus/corpus-e-spice3/fixtures/<name>.cir plus translations.json.
 *
 * The translation is purely syntactic and circuit-preserving. Every rule below rewrites a Gnucap
 * spelling into the SPICE3 spelling with the same meaning, removes a Gnucap command that only
 * affects console output or Gnucap's own solver bookkeeping, or drops an output probe SPICE3 has no
 * syntax for (the raw file still carries every node voltage and source current). Topology, element
 * values, models and analyses are never changed. A construct without an exact SPICE3 equivalent
 * makes the whole fixture `unsupported-translation`; it is never approximated.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TRANSLATOR_PATH = 'benchmarks/translate/gnucap-to-spice3.ts';
/** Fixed so regeneration is byte-deterministic; bump only when the translation rules change. */
export const TRANSLATION_DATE = '2026-10-11';
export const SOURCE_CORPUS = 'benchmarks/corpus/corpus-e';
export const TARGET_CORPUS = 'benchmarks/corpus/corpus-e-spice3';

export type TranslationResult =
  | { status: 'translated'; text: string; changes: string[] }
  | { status: 'unsupported-translation'; reasons: string[] };

interface Card {
  /** Physical lines of the card: first line plus `+` continuation lines. */
  lines: string[];
}

/** Gnucap commands that only control console listing/formatting/statistics. */
const OUTPUT_ONLY_COMMANDS: Record<string, string> = {
  list: 'Gnucap `.list` only echoes the netlist to the console',
  width: 'Gnucap `.width` only sets the console output width',
  status: 'Gnucap `.status` only prints solver statistics',
  stat: 'Gnucap `.stat` only prints solver statistics',
};

/** Gnucap-only `.options` keys: console paging, Gnucap solver bookkeeping and step-control knobs. */
const GNUCAP_ONLY_OPTIONS: Record<string, string> = {
  nopage: 'console paging',
  dampstrategy: 'Gnucap Newton damping strategy',
  trsteporder: 'Gnucap transient step-size predictor order',
  noincmode: 'Gnucap incremental matrix update',
  nobypass: 'Gnucap device-evaluation bypass',
};

const TRANSIENT_FUNCTIONS = new Set(['pulse', 'pwl', 'sin', 'exp', 'sffm']);
const SPICE3_PRINT_TYPES = new Set(['dc', 'ac', 'tran']);

function splitCards(lines: string[]): Card[] {
  const cards: Card[] = [];
  for (const line of lines) {
    if (line.startsWith('+') && cards.length > 0) cards[cards.length - 1].lines.push(line);
    else cards.push({ lines: [line] });
  }
  return cards;
}

/** True for a SPICE3 output variable: v(n), v(n1,n2), vm/vp/vr/vi/vdb(...), i(vname). */
function isSpice3Probe(probe: string, analysis: string): boolean {
  const voltage = /^v(m|p|r|i|db)?\(\s*[^\s(),]+\s*(,\s*[^\s(),]+\s*)?\)$/i.exec(probe);
  if (voltage) return voltage[1] === undefined || analysis === 'ac';
  return /^i\(\s*v[^\s(),]*\s*\)$/i.test(probe);
}

/** Splits `.print`/`.plot` arguments into probes; Gnucap plot ranges `(lo,hi)` are returned apart. */
function probeTokens(text: string): { probes: string[]; ranges: string[] } {
  const probes: string[] = [];
  const ranges: string[] = [];
  const pattern = /\s*([A-Za-z_][\w]*\([^()]*\)|\([^()]*\)|\S+)/y;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const token = match[1];
    if (token.startsWith('(')) ranges.push(token);
    else probes.push(token);
  }
  return { probes, ranges };
}

function parseNumber(token: string): number | null {
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(meg|mil|[tgkmunpfa])?[a-z]*$/i.exec(token);
  if (!match) return null;
  const scale: Record<string, number> = {
    t: 1e12, g: 1e9, meg: 1e6, k: 1e3, m: 1e-3, mil: 25.4e-6, u: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15, a: 1e-18,
  };
  return Number(match[1]) * (match[2] ? scale[match[2].toLowerCase()] : 1);
}

function dotName(card: Card): string | null {
  const match = /^\s*\.([A-Za-z]+)/.exec(card.lines[0]);
  return match ? match[1].toLowerCase() : null;
}

/** Translates one verbatim Gnucap deck. `sourcePath` is the upstream path, e.g. tests/d_cap.1.ckt. */
export function translateGnucapDeck(source: string, sourcePath: string, revision: string): TranslationResult {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);
  const title = lines[0];
  const cards = splitCards(lines.slice(1));
  const changes: string[] = [];
  const reasons: string[] = [];
  const out: string[] = [];

  // Instance names (lower-case, SPICE is case-insensitive) for duplicate detection.
  const seenInstances = new Map<string, number>();
  const allTokens = cards.flatMap(card => card.lines.join(' ').split(/[\s(),=]+/).map(token => token.toLowerCase()));
  let analysisSeen = false;

  for (const card of cards) {
    const first = card.lines[0];
    const trimmed = first.trim();

    if (trimmed === '' || trimmed.startsWith('*')) {
      out.push(...card.lines);
      continue;
    }
    if (trimmed.startsWith('#')) {
      out.push(`*${first}`);
      changes.push(`Gnucap \`#\` comment \`${trimmed}\` written as a SPICE \`*\` comment`);
      continue;
    }

    const command = dotName(card);
    if (command !== null) {
      const body = trimmed.replace(/^\.[A-Za-z]+\s*/, '');
      const words = body.split(/\s+/).filter(Boolean);

      if (command in OUTPUT_ONLY_COMMANDS) {
        out.push(`*gnucap-only: ${trimmed}`);
        changes.push(`commented out \`${trimmed}\` (${OUTPUT_ONLY_COMMANDS[command]})`);
        continue;
      }

      if (command === 'option' || command === 'options' || command === 'opt') {
        if (card.lines.length > 1) {
          reasons.push(`multi-line \`.${command}\` card is not handled by the translator`);
          continue;
        }
        if (words.length === 0) {
          out.push(`*gnucap-only: ${trimmed}`);
          changes.push(`commented out bare \`${trimmed}\` (Gnucap prints the option table; no settings change)`);
          continue;
        }
        const kept: string[] = [];
        for (const word of words) {
          const key = word.split('=')[0].toLowerCase();
          if (key in GNUCAP_ONLY_OPTIONS) {
            changes.push(`removed Gnucap-only option \`${word}\` (${GNUCAP_ONLY_OPTIONS[key]}; no SPICE3 equivalent, no circuit meaning)`);
          } else {
            kept.push(word);
          }
        }
        if (kept.length === words.length) {
          out.push(first);
        } else if (kept.length === 0) {
          out.push(`*gnucap-only: ${trimmed}`);
        } else {
          out.push(`.${command} ${kept.join(' ')}`);
        }
        continue;
      }

      if (command === 'print' || command === 'plot') {
        const analysis = (words[0] ?? '').toLowerCase();
        const { probes, ranges } = probeTokens(body.slice(words[0]?.length ?? 0));
        if (!SPICE3_PRINT_TYPES.has(analysis)) {
          out.push(`*gnucap-only: ${trimmed}`);
          changes.push(`commented out \`${trimmed}\` (SPICE3 has no \`.print ${analysis}\`; the raw file still holds every node voltage and source current)`);
          continue;
        }
        const kept = probes.filter(probe => isSpice3Probe(probe, analysis));
        const dropped = probes.filter(probe => !isSpice3Probe(probe, analysis));
        if (kept.length === 0) {
          out.push(`*gnucap-only: ${trimmed}`);
          changes.push(`commented out \`${trimmed}\` (no SPICE3-expressible probe)`);
          continue;
        }
        out.push(`.print ${analysis} ${kept.join(' ')}`);
        const notes: string[] = [];
        if (command === 'plot') notes.push('`.plot` written as `.print` (line-printer plot is console formatting only)');
        if (ranges.length) notes.push(`plot ranges ${ranges.join(' ')} removed`);
        if (dropped.length) notes.push(`Gnucap-only probes ${dropped.join(' ')} dropped (no SPICE3 output-variable syntax)`);
        if (notes.length) changes.push(`\`${trimmed}\`: ${notes.join('; ')}`);
        continue;
      }

      if (command === 'op') {
        analysisSeen = true;
        if (words.length === 0) {
          out.push(first);
        } else if (/^trace$/i.test(words[0]) && words.length === 2) {
          out.push('.op');
          changes.push(`\`${trimmed}\`: removed Gnucap \`trace ${words[1]}\` console-trace option`);
        } else {
          reasons.push(`\`${trimmed}\`: unrecognised Gnucap .op arguments`);
        }
        continue;
      }

      if (command === 'tran') {
        analysisSeen = true;
        const numbers: string[] = [];
        let index = 0;
        while (index < words.length && parseNumber(words[index]) !== null) numbers.push(words[index++]);
        const options = words.slice(index);
        let uic = false;
        const removed: string[] = [];
        for (let i = 0; i < options.length; i++) {
          const option = options[i].toLowerCase();
          if (option === 'uic') uic = true;
          else if (option === 'trace' && i + 1 < options.length) removed.push(`trace ${options[++i]}`);
          else reasons.push(`\`${trimmed}\`: Gnucap transient option \`${options[i]}\` has no SPICE3 equivalent`);
        }
        if (numbers.length === 0) {
          reasons.push(`\`${trimmed}\`: bare Gnucap \`.tran\` continues from the previous transient state; SPICE3 has no equivalent`);
          continue;
        }
        const values = numbers.map(token => parseNumber(token) as number);
        // Gnucap (analysis/s_tr_set.cc) reads 3/4 args in SPICE order only when the third is 0,
        // and 2 args in SPICE order (tstep tstop, start 0) only when 0 < first < second.
        const spiceOrder =
          (numbers.length >= 3 && numbers.length <= 4 && values[2] === 0) ||
          (numbers.length === 2 && values[0] !== 0 && values[0] < values[1]);
        if (!spiceOrder) {
          reasons.push(`\`${trimmed}\`: Gnucap reads these time arguments in its own (start stop step) order`);
          continue;
        }
        out.push(`.tran ${numbers.join(' ')}${uic ? ' uic' : ''}`);
        if (removed.length) changes.push(`\`${trimmed}\`: removed Gnucap console-trace option \`${removed.join(' ')}\``);
        continue;
      }

      if (command === 'ac') {
        analysisSeen = true;
        if (words.length === 0) {
          reasons.push(
            `\`${trimmed}\`: bare Gnucap \`.ac\` repeats the previous sweep, linearised about whatever bias the preceding command left (a changed .param or the last DC-sweep point); a SPICE3 \`.ac\` needs its own arguments and always re-solves its own operating point`,
          );
          continue;
        }
        if (/^(dec|oct|lin)$/i.test(words[0]) && words.length === 4) {
          out.push(first);
          continue;
        }
        if (words.length === 1 && parseNumber(words[0]) !== null) {
          out.push(`.ac lin 1 ${words[0]} ${words[0]}`);
          changes.push(`\`${trimmed}\`: Gnucap single-frequency shorthand written as \`.ac lin 1 ${words[0]} ${words[0]}\``);
          continue;
        }
        reasons.push(`\`${trimmed}\`: Gnucap start/stop/step AC sweep form has no exact SPICE3 spelling`);
        continue;
      }

      if (command === 'dc') {
        analysisSeen = true;
        if (words.length === 4 && words.slice(1).every(word => parseNumber(word) !== null)) {
          out.push(first);
          continue;
        }
        reasons.push(
          words.length === 0
            ? `\`${trimmed}\`: bare Gnucap \`.dc\` repeats the previous sweep; SPICE3 has no equivalent`
            : `\`${trimmed}\`: unrecognised Gnucap .dc form`,
        );
        continue;
      }

      if (command === 'param') {
        if (analysisSeen) {
          reasons.push(`\`${trimmed}\`: Gnucap re-assigns a parameter between analyses; a SPICE3 deck has one parameter value per run`);
        } else {
          reasons.push(`\`${trimmed}\`: Gnucap bare-name parameter references in element values are not SPICE3 syntax`);
        }
        continue;
      }

      if (command === 'model') {
        const text = card.lines.join(' ');
        const type = /^\s*\.model\s+\S+\s+([A-Za-z]+)/i.exec(text)?.[1]?.toLowerCase();
        const level = /\blevel\s*=\s*(\d+)/i.exec(text)?.[1];
        if ((type === 'nmos' || type === 'pmos') && level === '7') {
          reasons.push(
            `\`${first.trim()}\`: Gnucap MOS level=7 is its own BSIM3v3 port; SPICE3/ngspice has no level 7, and substituting ngspice BSIM3 (level=8) is an unverified model change`,
          );
          continue;
        }
        out.push(...card.lines);
        continue;
      }

      if (command === 'subckt' || command === 'ends' || command === 'end' || command === 'title') {
        out.push(...card.lines);
        continue;
      }

      reasons.push(`\`${trimmed}\`: Gnucap command \`.${command}\` is not handled by the translator`);
      continue;
    }

    // Element card.
    const name = trimmed.split(/\s+/)[0];
    const key = name.toLowerCase();
    let lineText = first;
    const count = (seenInstances.get(key) ?? 0) + 1;
    seenInstances.set(key, count);
    if (count > 1) {
      const references = allTokens.filter(token => token === key).length;
      if (references > count) {
        reasons.push(`duplicate instance name \`${name}\` is referenced by another card, so it cannot be renamed safely`);
        continue;
      }
      let renamed = `${name}_${count}`;
      while (seenInstances.has(renamed.toLowerCase())) renamed = `${renamed}_`;
      seenInstances.set(renamed.toLowerCase(), 1);
      lineText = lineText.replace(name, renamed);
      changes.push(
        `duplicate instance name \`${name}\` (Gnucap keeps both elements; SPICE3 rejects the second) renamed to \`${renamed}\` on \`${trimmed}\``,
      );
    }

    if (/\bgen\s*\(/i.test(lineText)) {
      reasons.push(`\`${trimmed}\`: Gnucap \`gen()\` generator source has no SPICE3 equivalent`);
      continue;
    }

    const kind = key[0];
    if (kind === 'v' || kind === 'i') {
      const before = lineText;
      // Gnucap `dc <function>`: the DC field holds the time function itself; SPICE3 spells this
      // as the bare function, whose DC/operating-point value is its t=0 value (identical).
      lineText = lineText.replace(/\bdc\s+(?=(pulse|pwl|sin|exp|sffm)\b)/i, '');
      if (lineText !== before) changes.push(`\`${trimmed}\`: Gnucap \`dc <function>\` written as the bare SPICE3 function`);
      // Gnucap unparenthesised function arguments: `pwl 0 5 .1 0` -> `pwl(0 5 .1 0)`.
      const tokens = lineText.trim().split(/\s+/);
      const fnIndex = tokens.findIndex((token, i) => i >= 3 && TRANSIENT_FUNCTIONS.has(token.toLowerCase()));
      if (fnIndex >= 0 && !(tokens[fnIndex + 1] ?? '').startsWith('(')) {
        let end = fnIndex + 1;
        while (end < tokens.length && parseNumber(tokens[end]) !== null) end++;
        const args = tokens.slice(fnIndex + 1, end);
        tokens.splice(fnIndex, end - fnIndex, `${tokens[fnIndex]}(${args.join(' ')})`);
        lineText = tokens.join(' ');
        changes.push(`\`${trimmed}\`: Gnucap unparenthesised \`${tokens[fnIndex].split('(')[0]}\` arguments wrapped in parentheses`);
      }
    }
    if (kind === 'q' || kind === 'd' || kind === 'm' || kind === 'j') {
      const before = lineText;
      lineText = lineText.replace(/\boff\s*=\s*1\b/i, 'off');
      if (lineText !== before) changes.push(`\`${trimmed}\`: Gnucap \`off=1\` written as the SPICE3 \`off\` flag`);
    }
    out.push(lineText, ...card.lines.slice(1));
  }

  if (reasons.length) return { status: 'unsupported-translation', reasons };

  const header = [
    `* SPICE3 (ngspice-dialect) translation of Gnucap ${sourcePath} at gnucap/gnucap@${revision}.`,
    '* Original: Gnucap regression tests, GPL-3.0-or-later (see LICENSE-NOTICE.MakeList and COPYING.txt here).',
    `* Modified ${TRANSLATION_DATE} by ${TRANSLATOR_PATH} (spice-ts issue #524); changes:`,
    ...changes.map(change => `*   - ${change}`),
    '* The first line above is the unchanged original title line.',
  ];
  return { status: 'translated', text: [title, ...header, ...out].join(eol), changes };
}

interface SourceCircuit {
  id: string;
  category: string;
  analyses: string[];
  sourcePath: string;
  localPath: string;
  sha256: string;
  ngspice: { expectedStatus: 'pass' | 'fail' };
}

export interface TranslationRecord {
  id: string;
  category: string;
  sourcePath: string;
  originalLocalPath: string;
  originalSha256: string;
  status: TranslationResult['status'];
  localPath?: string;
  sha256?: string;
  analyses?: string[];
  changes?: string[];
  reasons?: string[];
}

export interface GeneratedCorpus {
  files: Map<string, string>;
  records: TranslationRecord[];
}

function sha256(text: string | Buffer): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Analyses a SPICE3 deck declares, using the same rule as corpus-e/validate.mjs. */
export function deckAnalyses(text: string): string[] {
  const analyses = new Set<string>();
  for (const raw of text.split(/\r?\n/).slice(1)) {
    const match = raw.trim().match(/^\.(op|dc|ac|tran|pz|pss)\b/i);
    if (match) analyses.add(match[1].toLowerCase());
  }
  return [...analyses];
}

/** Regenerates every translated deck and the translation record from the pinned originals. */
export async function generateCorpus(root: string): Promise<GeneratedCorpus> {
  const manifest = JSON.parse(await readFile(resolve(root, SOURCE_CORPUS, 'manifest.json'), 'utf8')) as {
    source: { revision: string };
    circuits: SourceCircuit[];
  };
  const files = new Map<string, string>();
  const records: TranslationRecord[] = [];
  for (const circuit of manifest.circuits.filter(candidate => candidate.ngspice.expectedStatus === 'fail')) {
    const bytes = await readFile(resolve(root, circuit.localPath));
    if (sha256(bytes) !== circuit.sha256) throw new Error(`${circuit.id}: original fixture SHA-256 mismatch`);
    const result = translateGnucapDeck(bytes.toString('utf8'), circuit.sourcePath, manifest.source.revision);
    const record: TranslationRecord = {
      id: circuit.id,
      category: circuit.category,
      sourcePath: circuit.sourcePath,
      originalLocalPath: circuit.localPath,
      originalSha256: circuit.sha256,
      status: result.status,
    };
    if (result.status === 'translated') {
      const localPath = `${TARGET_CORPUS}/fixtures/${basename(circuit.sourcePath).replace(/\.ckt$/, '')}.cir`;
      files.set(localPath, result.text);
      Object.assign(record, {
        localPath,
        sha256: sha256(result.text),
        analyses: deckAnalyses(result.text),
        changes: result.changes,
      });
    } else {
      record.reasons = result.reasons;
    }
    records.push(record);
  }
  files.set(
    `${TARGET_CORPUS}/translations.json`,
    `${JSON.stringify({ translator: TRANSLATOR_PATH, translationDate: TRANSLATION_DATE, sourceRevision: manifest.source.revision, fixtures: records }, null, 2)}\n`,
  );
  return { files, records };
}

/** Lists committed files that differ from regenerated output (empty when up to date). */
export async function staleFiles(root: string): Promise<string[]> {
  const { files } = await generateCorpus(root);
  const stale: string[] = [];
  for (const [path, text] of files) {
    let committed: string | null = null;
    try {
      committed = await readFile(resolve(root, path), 'utf8');
    } catch {
      committed = null;
    }
    if (committed !== text) stale.push(path);
  }
  return stale;
}

async function main(): Promise<void> {
  const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
  if (process.argv.includes('--check')) {
    const stale = await staleFiles(root);
    if (stale.length) {
      console.error(`Stale translations (run without --check to regenerate):\n${stale.map(path => `  - ${path}`).join('\n')}`);
      process.exit(1);
    }
    console.log('corpus-e-spice3 translations are up to date.');
    return;
  }
  const { files, records } = await generateCorpus(root);
  await mkdir(resolve(root, TARGET_CORPUS, 'fixtures'), { recursive: true });
  for (const [path, text] of files) await writeFile(resolve(root, path), text);
  for (const record of records) {
    console.log(`${record.status.padEnd(23)} ${record.id}${record.reasons ? ` - ${record.reasons.join(' | ')}` : ''}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
