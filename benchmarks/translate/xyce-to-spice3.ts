#!/usr/bin/env tsx
/**
 * Deterministic Xyce -> SPICE3 (ngspice-dialect) translator for the Xyce corpus fixtures that
 * ngspice rejects (#524, lane 3).
 *
 * Usage:
 *   pnpm exec tsx benchmarks/translate/xyce-to-spice3.ts           # regenerate xyce-spice3
 *   pnpm exec tsx benchmarks/translate/xyce-to-spice3.ts --check   # fail if committed files differ
 *
 * Input: the verbatim, hash-pinned originals in benchmarks/corpus/xyce (never modified).
 * Output: benchmarks/corpus/xyce-spice3/{manifest.json,fixtures/**}.
 *
 * Translation is purely syntactic and circuit-preserving. Every rule is listed in RULES below and
 * every changed original line is kept in the translated deck as a `* [xyce-to-spice3] original:`
 * comment. A construct without an exact SPICE3 equivalent is never approximated: the fixture is
 * recorded as `unsupported-translation` with the reasons and no translated deck is written.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TRANSLATOR_PATH = 'benchmarks/translate/xyce-to-spice3.ts';
export const TRANSLATOR_VERSION = 1;
/** Fixed so regeneration is byte-stable; bump together with TRANSLATOR_VERSION when rules change. */
export const TRANSLATION_DATE = '2026-10-11';
export const SOURCE_CORPUS = 'benchmarks/corpus/xyce';
export const TARGET_CORPUS = 'benchmarks/corpus/xyce-spice3';
const MARK = '[xyce-to-spice3]';

export const RULES = [
  {
    id: 'tran-zero-tstep',
    description:
      'Xyce `.tran 0 TSTOP [TSTART [TMAX]]` (zero print step: output at every accepted step) -> ' +
      '`.tran TSTEP TSTOP ...` with TSTEP = (TSTOP - TSTART)/50. SPICE3/ngspice require TSTEP > 0. ' +
      'ngspice caps its default maximum step at MIN(TSTEP, (TSTOP - TSTART)/50) and its first step ' +
      'at MIN(TSTOP/100, TSTEP)/10, so (TSTOP - TSTART)/50 is the smallest TSTEP whose ngspice ' +
      'output is identical to any larger TSTEP (ngspice-47 raw data verified byte-identical for 1x, ' +
      '10x and 50x on the translated decks, different at 0.5x); with a rawfile ngspice writes every accepted step, like Xyce ' +
      'with a zero print step.',
  },
  {
    id: 'timeint-tolerances-removed',
    description:
      'Xyce `.options timeint` lines whose fields are only RELTOL, ABSTOL and METHOD=7/TRAP are ' +
      'commented out. TIMEINT is a Xyce option package (time-integrator tolerances that are ' +
      'separate from the Newton tolerances); SPICE3 has no equivalent package, and METHOD=7 is ' +
      'trapezoidal, the SPICE3 default. Both engines therefore run at their default tolerances. ' +
      'Any other TIMEINT field (e.g. NEWLTE) selects a Xyce-only algorithm and makes the fixture ' +
      'unsupported-translation.',
  },
  {
    id: 'step-source-to-nested-dc',
    description:
      'Xyce `.step <V|I source> START STOP STEP` in a deck with exactly one single-source `.dc` ' +
      'sweep -> the second (outer) sweep of a SPICE3 nested `.dc`. Xyce runs the inner `.dc` ' +
      'once per stepped source value, which is the SPICE3 nested-sweep order; Xyce_Regression ' +
      'itself uses this form in NJFET_DC/njfet-2109.cir. Other `.step` forms are unsupported.',
  },
  {
    id: 'capacitor-ic-to-dot-ic',
    description:
      'Capacitor instance `IC=V` on a capacitor with one terminal at ground, in a `.tran` without ' +
      'UIC -> the instance line is kept and `.ic v(<node>)=V` is added. Xyce always applies device ' +
      'initial conditions, enforcing them in the transient operating point exactly like `.IC` ' +
      '(Xyce 6.10 release notes, bug 1040-SON; xyce-users "Xyce always uses initial conditions you ' +
      'specify, with or without UIC"); SPICE3 ignores instance IC= without UIC but enforces `.ic` ' +
      'node voltages in the operating point. A capacitor with neither terminal grounded, or an ' +
      'inductor IC=, has no SPICE3 node-voltage equivalent and is unsupported.',
  },
  {
    id: 'print-brace-expressions',
    description:
      'Brace expressions in `.print` (Xyce-only syntax) are replaced by the output variables ' +
      '(V(...)/I(...)) they reference, without duplicates. The compared signals are the engines\' ' +
      'full node-voltage/branch-current vectors, which already contain those variables; ngspice ' +
      'ignores `.print` when a rawfile is written.',
  },
] as const;

export type RuleId = typeof RULES[number]['id'];

export type TranslationResult =
  | { status: 'translated'; deck: string; appliedRules: RuleId[]; changes: string[] }
  | { status: 'unsupported-translation'; reasons: string[] };

const SUFFIXES: Array<[string, number]> = [
  ['meg', 1e6], ['mil', 25.4e-6], ['f', 1e-15], ['p', 1e-12], ['n', 1e-9], ['u', 1e-6],
  ['m', 1e-3], ['k', 1e3], ['g', 1e9], ['t', 1e12],
];

/** SPICE number with optional scale suffix and trailing unit letters ("5ms", "2.0e-4", "100m"). */
export function parseSpiceNumber(token: string): number {
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([a-z]*)$/i.exec(token.trim());
  if (!match) throw new Error(`not a SPICE number: '${token}'`);
  const base = Number(match[1]);
  const tail = match[2].toLowerCase();
  for (const [suffix, scale] of SUFFIXES) {
    if (tail.startsWith(suffix)) return base * scale;
  }
  return base;
}

/** Deterministic compact form: 12 significant digits; integers plain, others exponent ("1e-4"). */
export function formatSpiceNumber(value: number): string {
  const rounded = Number(value.toPrecision(12));
  if (Number.isInteger(rounded) && Math.abs(rounded) < 1e6) return String(rounded);
  return rounded.toExponential().replace('e+', 'e');
}

function stripInlineComment(line: string): string {
  const index = line.indexOf(';');
  return index < 0 ? line : line.slice(0, index);
}

interface LogicalLine {
  first: number;
  last: number;
  text: string;
}

function logicalLines(lines: string[]): LogicalLine[] {
  const result: LogicalLine[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*\+/.test(line) && result.length > 0) {
      const previous = result[result.length - 1];
      previous.last = index;
      previous.text += ` ${stripInlineComment(line.replace(/^\s*\+/, ''))}`;
      continue;
    }
    if (/^\s*$/.test(line) || /^\s*\*/.test(line)) continue;
    result.push({ first: index, last: index, text: stripInlineComment(line) });
  }
  return result;
}

function tokens(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/**
 * Translate one Xyce deck. `provenance` is written into the GPL modification notice that follows
 * the title line (the first line of a SPICE deck is always the title, so it stays first).
 */
export function translateXyceDeck(
  original: string,
  provenance: { upstreamUrl: string; originalLocalPath: string; originalSha256: string },
): TranslationResult {
  const lines = original.split('\n');
  const output = [...lines];
  const reasons: string[] = [];
  const applied = new Set<RuleId>();
  const changes: string[] = [];
  const replacements = new Map<number, string[]>();
  const logical = logicalLines(lines);

  const replace = (index: number, newLines: string[], rule: RuleId, change: string): void => {
    replacements.set(index, [`* ${MARK} original: ${lines[index].trimEnd()}`, ...newLines]);
    applied.add(rule);
    changes.push(change);
  };

  // Diode models: SPICE3 has LEVEL=1 only (ngspice adds LEVEL=3); Xyce LEVEL=2 is PSpice-style.
  for (const { text } of logical) {
    const model = /^\.model\s+(\S+)\s+d\b/i.exec(text.trim());
    if (model && /\blevel\s*=\s*2\b/i.test(text)) {
      reasons.push(
        `Diode model ${model[1]} is Xyce LEVEL=2 (PSpice-compatible diode equations). SPICE3 has no ` +
        'level-2 diode (ngspice-47: "Diode model level 2 is not supported"), and substituting the ' +
        'level-1 diode would change the model equations.',
      );
    }
  }

  const dcLines = logical.filter(line => /^\.dc\b/i.test(line.text.trim()));
  const sources = new Set(
    logical
      .map(line => tokens(line.text)[0] ?? '')
      .filter(name => /^[vi]/i.test(name))
      .map(name => name.toLowerCase()),
  );

  const hasUic = logical.some(line => /^\.tran\b/i.test(line.text.trim()) && /\buic\b/i.test(line.text));

  for (const line of logical) {
    const text = line.text.trim();
    const words = tokens(text);
    const keyword = words[0]?.toLowerCase() ?? '';

    const instanceIc = /^[cl]/i.test(keyword) ? words.find(word => /^ic=/i.test(word)) : undefined;
    if (instanceIc && !hasUic) {
      const [, nodeA, nodeB] = words;
      const value = instanceIc.slice(3);
      const ground = (node: string) => node === '0' || node.toLowerCase() === 'gnd';
      if (keyword.startsWith('c') && line.first === line.last && (ground(nodeA) || ground(nodeB))) {
        const node = ground(nodeB) ? nodeA : nodeB;
        const volts = ground(nodeB) ? value : formatSpiceNumber(-parseSpiceNumber(value));
        const ic = `.ic v(${node})=${volts}`;
        replacements.set(line.first, [
          lines[line.first],
          `* ${MARK} added: Xyce applies instance IC= without UIC; SPICE3 equivalent is .ic`,
          ic,
        ]);
        applied.add('capacitor-ic-to-dot-ic');
        changes.push(`${words[0]} ${instanceIc} -> added \`${ic}\` (Xyce applies device IC= without UIC)`);
      } else {
        reasons.push(
          `\`${text}\`: Xyce applies this instance IC= without UIC; SPICE3 has no equivalent for an ` +
          'inductor current or an ungrounded capacitor voltage.',
        );
      }
      continue;
    }

    if (keyword === '.tran') {
      const [, tstep, tstop, tstart] = words;
      if (tstep !== undefined && tstop !== undefined && parseSpiceNumber(tstep) === 0) {
        const start = tstart === undefined ? 0 : parseSpiceNumber(tstart);
        const value = formatSpiceNumber((parseSpiceNumber(tstop) - start) / 50);
        replace(
          line.first,
          [[words[0], value, ...words.slice(2)].join(' ')],
          'tran-zero-tstep',
          `.tran print step 0 -> ${value} s ((TSTOP - TSTART)/50)`,
        );
      }
      continue;
    }

    if (keyword === '.options' || keyword === '.option') {
      const pkg = words[1]?.toLowerCase();
      if (pkg === 'timeint') {
        const unsupported = words.slice(2).filter(field => {
          const [name, value = ''] = field.toLowerCase().split('=');
          if (name === 'reltol' || name === 'abstol') return false;
          if (name === 'method') return !['7', 'trap', 'trapezoid'].includes(value);
          return true;
        });
        if (unsupported.length > 0) {
          reasons.push(
            `Xyce \`.options timeint ${unsupported.join(' ')}\` selects a Xyce time-integrator ` +
            'algorithm with no SPICE3 equivalent.',
          );
        } else {
          replace(
            line.first,
            [],
            'timeint-tolerances-removed',
            `removed Xyce \`${text}\` (no SPICE3 TIMEINT package; both engines use default tolerances)`,
          );
        }
      } else if (pkg !== undefined && !pkg.includes('=')) {
        reasons.push(`Xyce \`.options ${words[1]}\` package: no translation rule is implemented.`);
      }
      continue;
    }

    if (keyword === '.step') {
      const [, target, start, stop, step, ...rest] = words;
      const source = target?.toLowerCase();
      const dc = dcLines.length === 1 ? tokens(dcLines[0].text) : undefined;
      const translatable = source !== undefined && sources.has(source) && rest.length === 0
        && step !== undefined && dc !== undefined && dc.length === 5
        && dc[1].toLowerCase() !== source && dcLines[0].first === dcLines[0].last;
      if (!translatable) {
        reasons.push(
          `Xyce \`${text}\`: SPICE3 batch mode has no parameter-stepping command, and this form ` +
          'is not a single source stepped over a single-source .dc sweep.',
        );
        continue;
      }
      const dcLine = dcLines[0];
      replace(
        line.first,
        [],
        'step-source-to-nested-dc',
        `\`${text}\` -> outer sweep of the nested .dc`,
      );
      const nested = [...dc, target, start, stop, step].join(' ');
      replace(dcLine.first, [nested], 'step-source-to-nested-dc', `\`${dc.join(' ')}\` -> \`${nested}\``);
      continue;
    }

    if (keyword === '.print') {
      if (!text.includes('{')) continue;
      if (line.first !== line.last) {
        reasons.push('Multi-line .print with brace expressions: no translation rule is implemented.');
        continue;
      }
      const kept: string[] = [];
      const seen = new Set<string>();
      const add = (variable: string): void => {
        const key = variable.toLowerCase().replace(/\s+/g, '');
        if (seen.has(key)) return;
        seen.add(key);
        kept.push(variable);
      };
      const body = text.replace(/^\.print\s+\S+/i, '');
      const parts = body.match(/\{[^}]*\}|\S+/g) ?? [];
      for (const part of parts) {
        if (!part.startsWith('{')) {
          add(part);
          continue;
        }
        for (const ref of part.match(/\b[vi]\s*\([^()]*\)/gi) ?? []) add(ref.replace(/\s+/g, ''));
      }
      const head = words.slice(0, 2).join(' ');
      replace(
        line.first,
        [[head, ...kept].join(' ')],
        'print-brace-expressions',
        `.print brace expressions -> referenced output variables (${kept.join(' ')})`,
      );
      continue;
    }

    if (text.includes('{')) {
      reasons.push(`Brace expression outside .print (\`${text}\`): no translation rule is implemented.`);
    }
  }

  if (reasons.length > 0) return { status: 'unsupported-translation', reasons: [...new Set(reasons)] };

  const header = [
    `* ${MARK} SPICE3/ngspice-dialect translation of a Xyce Regression Suite netlist.`,
    `* ${MARK} Upstream: ${provenance.upstreamUrl}`,
    `* ${MARK} Verbatim original: ${provenance.originalLocalPath} (sha256 ${provenance.originalSha256})`,
    `* ${MARK} Copyright 2019 National Technology & Engineering Solutions of Sandia, LLC (NTESS).`,
    `* ${MARK} Licensed GPL-3.0-or-later; see ${TARGET_CORPUS}/LICENSE-NOTICE.md and COPYING.txt.`,
    `* ${MARK} Modified ${TRANSLATION_DATE} by ${TRANSLATOR_PATH} v${TRANSLATOR_VERSION}:`,
    ...changes.map(change => `* ${MARK}   - ${change}`),
    `* ${MARK} Topology, element values and models are unchanged; only the lines listed above changed.`,
  ];
  const result: string[] = [output[0], ...header];
  for (let index = 1; index < output.length; index += 1) {
    result.push(...(replacements.get(index) ?? [output[index]]));
  }
  return {
    status: 'translated',
    deck: result.join('\n'),
    appliedRules: RULES.map(rule => rule.id).filter(id => applied.has(id)),
    changes,
  };
}

interface XyceManifestCircuit {
  id: string;
  category: string;
  analyses: string[];
  sourcePath: string;
  localPath: string;
  sha256: string;
  ngspice: { expectedStatus: 'pass' | 'fail'; reason?: string };
}

interface XyceManifest {
  source: Record<string, string> & { revision: string; repository: string };
  circuits: XyceManifestCircuit[];
}

export interface GeneratedFile {
  path: string;
  content: string;
}

function sha256(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Every file of the translated corpus that the translator owns, generated from the originals. */
export async function generateCorpus(repoRoot: string): Promise<GeneratedFile[]> {
  const source = JSON.parse(
    await readFile(resolve(repoRoot, SOURCE_CORPUS, 'manifest.json'), 'utf8'),
  ) as XyceManifest;
  const files: GeneratedFile[] = [];
  const circuits: unknown[] = [];
  const noticePath = `${TARGET_CORPUS}/LICENSE-NOTICE.md`;
  const licencePath = `${TARGET_CORPUS}/COPYING.txt`;
  const notice = await readFile(resolve(repoRoot, source.source.licenseNoticeLocalPath));
  const licence = await readFile(resolve(repoRoot, source.source.licenseTextLocalPath));

  for (const circuit of source.circuits) {
    // Scope (#524): only the fixtures ngspice rejects in their original Xyce dialect.
    if (circuit.ngspice.expectedStatus !== 'fail') continue;
    const originalBytes = await readFile(resolve(repoRoot, circuit.localPath));
    if (sha256(originalBytes) !== circuit.sha256) {
      throw new Error(`${circuit.id}: original sha256 mismatch; refusing to translate`);
    }
    const upstreamUrl = `${source.source.repository}/blob/${source.source.revision}/${circuit.sourcePath}`;
    const result = translateXyceDeck(originalBytes.toString('utf8'), {
      upstreamUrl,
      originalLocalPath: circuit.localPath,
      originalSha256: circuit.sha256,
    });
    const original = {
      corpus: 'xyce',
      sourcePath: circuit.sourcePath,
      upstreamUrl,
      localPath: circuit.localPath,
      sha256: circuit.sha256,
      ngspiceRejection: circuit.ngspice.reason,
    };
    if (result.status === 'unsupported-translation') {
      circuits.push({
        id: circuit.id,
        category: circuit.category,
        analyses: circuit.analyses,
        original,
        translation: { status: result.status, reasons: result.reasons },
      });
      continue;
    }
    const localPath = circuit.localPath.replace(`${SOURCE_CORPUS}/`, `${TARGET_CORPUS}/`);
    files.push({ path: localPath, content: result.deck });
    circuits.push({
      id: circuit.id,
      category: circuit.category,
      analyses: circuit.analyses,
      localPath,
      sha256: sha256(result.deck),
      original,
      translation: { status: result.status, rules: result.appliedRules, changes: result.changes },
    });
  }

  const manifest = {
    schemaVersion: 1,
    source: {
      ...source.source,
      name: `${source.source.name} (SPICE3 translations of the ngspice-rejected fixtures)`,
      licenseNoticeLocalPath: noticePath,
      licenseNoticeSha256: sha256(notice),
      licenseTextLocalPath: licencePath,
      licenseTextSha256: sha256(licence),
      derivedFrom: SOURCE_CORPUS,
      translator: TRANSLATOR_PATH,
      translatorVersion: TRANSLATOR_VERSION,
      modificationDate: TRANSLATION_DATE,
      redistributionDecision:
        'Allowed under GPL-3.0-or-later as modified versions. The upstream copyright and licence ' +
        'notice and the complete GPLv3 text are retained byte-for-byte; every translated deck ' +
        'states the upstream file, the modifications and their date in its header.',
      mechanicalAdaptation:
        'Purely syntactic Xyce -> SPICE3 translation by the deterministic translator, applied to ' +
        'the verbatim, hash-pinned originals in benchmarks/corpus/xyce (which stay unchanged). ' +
        'Rules: ' + RULES.map(rule => `${rule.id}: ${rule.description}`).join(' ') +
        ' Every changed line is kept as a comment in the translated deck. Fixtures with a construct ' +
        'that has no exact SPICE3 equivalent are marked unsupported-translation and not translated.',
    },
    circuits,
  };
  files.push({ path: `${TARGET_CORPUS}/manifest.json`, content: `${JSON.stringify(manifest, null, 2)}\n` });
  files.push({ path: noticePath, content: notice.toString('utf8') });
  files.push({ path: licencePath, content: licence.toString('utf8') });
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

/** Paths whose committed bytes differ from the translator output (empty when in sync). */
export async function staleFiles(repoRoot: string): Promise<string[]> {
  const stale: string[] = [];
  for (const file of await generateCorpus(repoRoot)) {
    let committed: string | undefined;
    try {
      committed = await readFile(resolve(repoRoot, file.path), 'utf8');
    } catch {
      committed = undefined;
    }
    if (committed !== file.content) stale.push(file.path);
  }
  return stale;
}

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  if (process.argv.includes('--check')) {
    const stale = await staleFiles(repoRoot);
    if (stale.length > 0) {
      console.error(`Stale translations (rerun ${TRANSLATOR_PATH}):\n${stale.map(path => `  - ${path}`).join('\n')}`);
      process.exit(1);
    }
    console.log('xyce-spice3 translations match the translator output.');
    return;
  }
  for (const file of await generateCorpus(repoRoot)) {
    await mkdir(dirname(resolve(repoRoot, file.path)), { recursive: true });
    await writeFile(resolve(repoRoot, file.path), file.content);
    console.log(`wrote ${file.path}`);
  }
}

if (basename(process.argv[1] ?? '') === 'xyce-to-spice3.ts') {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
