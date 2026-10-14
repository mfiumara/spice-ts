/**
 * Renders the known-ngspice-bugs corpus (#803) from `manifest.json`:
 *   - `benchmarks/NGSPICE_BUGS.md` (summary table), and
 *   - `benchmarks/corpus/ngspice-bugs/tickets/<N>/README.md` for every ticket with a runnable deck.
 *
 *   pnpm exec tsx benchmarks/corpus/ngspice-bugs/render.ts          # write
 *   pnpm exec tsx benchmarks/corpus/ngspice-bugs/render.ts --check  # fail if the committed files are stale
 *
 * The manifest is the record of the triage; this script only formats it. No simulator is run here.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CATEGORIES = ['simulator-numerics', 'device-model', 'parser', 'frontend-ui', 'build', 'platform', 'docs'] as const;
export type Category = (typeof CATEGORIES)[number];
export const NGSPICE_VERDICTS = ['wrong', 'right', 'error', 'hang', 'not-run'] as const;
export const SPICE_TS_VERDICTS = ['wrong', 'right', 'unsupported', 'error', 'hang', 'not-run'] as const;
export const EXPECTED_BASES = ['analytic', 'first-principles', 'documented-semantics', 'undetermined'] as const;
export const REPRODUCES = ['yes', 'no', 'partially', 'n/a'] as const;

export interface Verdict<V extends string> { verdict: V; evidence: string }
export interface DeckFile { path: string; bytes: number; sha256: string }
export interface UncommittedDeck { name: string; bytes: number; sha256: string }
export interface Attachment { name: string; url: string; bytes: number; sha256: string }

export interface TicketEntry {
  ticket: number;
  url: string;
  title: string;
  status: 'open' | 'open-accepted';
  created: string;
  category: Category;
  simulatorRelevant: boolean;
  runnableDeck: boolean;
  deckOrigin: string;
  redistribution: 'commit' | 'fetch-only' | 'none';
  edits: string;
  committedDecks: DeckFile[];
  uncommittedDecks: UncommittedDeck[];
  attachments: Attachment[];
  expected: string;
  expectedBasis: (typeof EXPECTED_BASES)[number];
  ngspice47: Verdict<(typeof NGSPICE_VERDICTS)[number]>;
  ngspiceMaster: Verdict<(typeof NGSPICE_VERDICTS)[number]>;
  spiceTs: Verdict<(typeof SPICE_TS_VERDICTS)[number]>;
  reproducesOnNgspice47: (typeof REPRODUCES)[number];
  reproCheck: string;
  spiceTsIssue: string | null;
  upstreamCandidate: string;
  notes: string;
}

export interface Manifest {
  schema: 1;
  description: string;
  harvest: { date: string; query: string; ticketEndpoint: string; count: number };
  engines: { ngspice47: string; ngspiceMaster: string; spiceTs: string; machine: string };
  followUps: { issue: string; summary: string }[];
  tickets: TicketEntry[];
}

export const OUTCOMES = [
  'spice-ts-correct',
  'both-wrong',
  'spice-ts-unsupported',
  'ngspice-not-reproduced',
  'not-simulated',
] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const OUTCOME_LABEL: Record<Outcome, string> = {
  'spice-ts-correct': 'ngspice defective, spice-ts correct',
  'both-wrong': 'ngspice defective, spice-ts also wrong',
  'spice-ts-unsupported': 'ngspice defective, spice-ts cannot run the deck (feature unsupported)',
  'ngspice-not-reproduced': 'defect not reproduced on ngspice-47',
  'not-simulated': 'not simulator-relevant or no runnable deck',
};

/** ngspice-47 shows the reported defect: a wrong result, an abort or a hang that the expected answer rules out. */
export function ngspiceDefective(entry: TicketEntry): boolean {
  return ['wrong', 'error', 'hang'].includes(entry.ngspice47.verdict)
    && (entry.reproducesOnNgspice47 === 'yes' || entry.reproducesOnNgspice47 === 'partially');
}

export function outcome(entry: TicketEntry): Outcome {
  if (!entry.simulatorRelevant || !entry.runnableDeck) return 'not-simulated';
  if (!ngspiceDefective(entry)) return 'ngspice-not-reproduced';
  if (entry.spiceTs.verdict === 'right') return 'spice-ts-correct';
  if (entry.spiceTs.verdict === 'wrong') return 'both-wrong';
  return 'spice-ts-unsupported';
}

/** Defect reproduced on ngspice-47 and the master rerun no longer shows it. */
export function fixedOnMaster(entry: TicketEntry): boolean {
  return ngspiceDefective(entry) && entry.ngspiceMaster.verdict === 'right';
}

/** Defect reproduced on ngspice-47 and confirmed again on master. */
export function stillOnMaster(entry: TicketEntry): boolean {
  return ngspiceDefective(entry) && ['wrong', 'error', 'hang'].includes(entry.ngspiceMaster.verdict);
}

const cell = (text: string): string => text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
const ticketLink = (entry: TicketEntry): string => `[#${entry.ticket}](${entry.url})`;
const readmeLink = (entry: TicketEntry, from: 'benchmarks' | 'corpus'): string =>
  hasReadme(entry) ? ` ([deck](${from === 'benchmarks' ? 'corpus/ngspice-bugs/' : ''}tickets/${entry.ticket}/README.md))` : '';

export function hasReadme(entry: TicketEntry): boolean {
  return entry.simulatorRelevant && entry.runnableDeck;
}

function issueCell(entry: TicketEntry): string {
  return entry.spiceTsIssue ? entry.spiceTsIssue : '';
}

export function renderSummary(manifest: Manifest): string {
  const t = manifest.tickets;
  const lines: string[] = [];
  const count = (predicate: (entry: TicketEntry) => boolean): number => t.filter(predicate).length;
  lines.push('# Known ngspice bugs: open SourceForge tickets vs ngspice-47, ngspice master and spice-ts (#803)');
  lines.push('');
  lines.push('Generated by `pnpm exec tsx benchmarks/corpus/ngspice-bugs/render.ts` from [`corpus/ngspice-bugs/manifest.json`](corpus/ngspice-bugs/manifest.json); do not edit by hand. Method, licence and fetch instructions: [`corpus/ngspice-bugs/README.md`](corpus/ngspice-bugs/README.md).');
  lines.push('');
  lines.push(`Every ticket with status \`open\` or \`open-accepted\` on the ngspice bug tracker on ${manifest.harvest.date} (${manifest.harvest.count} tickets) was harvested read-only through the SourceForge REST API, classified, and, where it is a simulator defect with a runnable deck, run on ngspice-47, on ngspice master and on spice-ts. The expected answer is derived from first principles, analytic solutions or documented semantics, not from either simulator. Nothing was posted upstream.`);
  lines.push('');
  lines.push('Engines:');
  lines.push('');
  lines.push(`- ngspice-47: ${manifest.engines.ngspice47}`);
  lines.push(`- ngspice master: ${manifest.engines.ngspiceMaster}`);
  lines.push(`- spice-ts: ${manifest.engines.spiceTs}`);
  lines.push(`- Machine: ${manifest.engines.machine}`);
  lines.push('');
  lines.push('## Totals');
  lines.push('');
  lines.push('Current #812 refresh and #803 pin/oracle investigation: [refresh](corpus/ngspice-bugs/REFRESH_812.md), [bounded recovery](corpus/ngspice-bugs/PIN_RECOVERY_803.md). Five unreconstructed pins remain provenance gaps, not parser failures. Ticket 737 executes but has no full-waveform oracle; a NEW operating-point diagnostic disagrees with ngspice LTPS and is not a correctness win. Ticket 725 has disclosed log-attachment drift, not an executed-input re-pin. Historical engine verdicts and the original 25-ticket denominator are retained.');
  lines.push('');
  const runnable = t.filter(hasReadme);
  lines.push(`- Tickets: ${t.length} (${count(e => e.status === 'open')} open, ${count(e => e.status === 'open-accepted')} open-accepted).`);
  lines.push(`- Simulator-relevant with a runnable deck: ${runnable.length}. Defect reproduced on ngspice-47: ${count(e => hasReadme(e) && ngspiceDefective(e))}; still present on master: ${count(e => hasReadme(e) && stillOnMaster(e))}; fixed on master: ${count(e => hasReadme(e) && fixedOnMaster(e))}.`);
  for (const key of OUTCOMES) lines.push(`- ${OUTCOME_LABEL[key]}: ${count(e => outcome(e) === key)}.`);
  lines.push('');
  lines.push('### By category');
  lines.push('');
  lines.push('| Category | Tickets | Simulator-relevant, runnable deck | Reproduced on ngspice-47 | Still on master | spice-ts correct | Both wrong | spice-ts unsupported |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const category of CATEGORIES) {
    const group = t.filter(e => e.category === category);
    lines.push(`| ${category} | ${group.length} | ${group.filter(hasReadme).length} | ${group.filter(e => hasReadme(e) && ngspiceDefective(e)).length} | ${group.filter(e => hasReadme(e) && stillOnMaster(e)).length} | ${group.filter(e => outcome(e) === 'spice-ts-correct').length} | ${group.filter(e => outcome(e) === 'both-wrong').length} | ${group.filter(e => outcome(e) === 'spice-ts-unsupported').length} |`);
  }
  lines.push(`| total | ${t.length} | ${runnable.length} | ${count(e => hasReadme(e) && ngspiceDefective(e))} | ${count(e => hasReadme(e) && stillOnMaster(e))} | ${count(e => outcome(e) === 'spice-ts-correct')} | ${count(e => outcome(e) === 'both-wrong')} | ${count(e => outcome(e) === 'spice-ts-unsupported')} |`);
  lines.push('');
  lines.push('### spice-ts follow-up issues');
  lines.push('');
  for (const followUp of manifest.followUps) lines.push(`- ${followUp.issue}: ${followUp.summary}`);
  lines.push('');

  const section = (title: string, intro: string, rows: TicketEntry[], withIssue = false): void => {
    lines.push(`## ${title}`);
    lines.push('');
    lines.push(intro);
    lines.push('');
    if (rows.length === 0) { lines.push('None.'); lines.push(''); return; }
    lines.push(`| Ticket | Category | Expected (basis) | ngspice-47 | ngspice master | spice-ts |${withIssue ? ' spice-ts issue |' : ''}`);
    lines.push(`|---|---|---|---|---|---|${withIssue ? '---|' : ''}`);
    for (const e of rows) {
      lines.push(`| ${ticketLink(e)} ${cell(e.title)}${readmeLink(e, 'benchmarks')} | ${e.category} | ${cell(e.expected)} (${e.expectedBasis}) | **${e.ngspice47.verdict}**: ${cell(e.ngspice47.evidence)} | **${e.ngspiceMaster.verdict}**: ${cell(e.ngspiceMaster.evidence)} | **${e.spiceTs.verdict}**: ${cell(e.spiceTs.evidence)} |${withIssue ? ` ${issueCell(e)} |` : ''}`);
    }
    lines.push('');
  };
  section('ngspice defective, spice-ts correct', 'The reported ngspice defect reproduces on ngspice-47 and spice-ts produces the expected answer on the same deck.', t.filter(e => outcome(e) === 'spice-ts-correct'));
  section('Both wrong', 'The defect reproduces on ngspice-47 and spice-ts is wrong on the same deck too. Each row has a spice-ts issue.', t.filter(e => outcome(e) === 'both-wrong'), true);
  section('ngspice defective, spice-ts cannot run the deck', 'The defect reproduces on ngspice-47 but spice-ts rejects the deck because a feature is not implemented (or the defect is specific to an ngspice-only option such as `.options klu` or a compatibility mode). These are not spice-ts wins.', t.filter(e => outcome(e) === 'spice-ts-unsupported'));
  section('Not reproduced on ngspice-47', 'Simulator-relevant tickets with a runnable deck where ngspice-47 gives the expected answer (already fixed, documented behaviour, or user error).', t.filter(e => outcome(e) === 'ngspice-not-reproduced'));

  lines.push('## Candidate upstream fixes');
  lines.push('');
  lines.push('Defects that still reproduce on ngspice master. Each is already an open upstream ticket; entries marked NEW are additional findings from this triage that the ticket does not describe yet. Listed for the owner to decide on; nothing has been reported upstream from this work.');
  lines.push('');
  const candidates = t.filter(e => hasReadme(e) && stillOnMaster(e));
  if (candidates.length === 0) lines.push('None.');
  for (const e of candidates) lines.push(`- ${ticketLink(e)} ${cell(e.title)}: ${cell(e.upstreamCandidate || 'described by the open ticket; no further fix proposed here')}`);
  lines.push('');

  lines.push('## Fixed on ngspice master');
  lines.push('');
  lines.push('Defects that reproduce on ngspice-47 but not on the master build with the same command.');
  lines.push('');
  const fixed = t.filter(e => hasReadme(e) && fixedOnMaster(e));
  if (fixed.length === 0) lines.push('None.');
  for (const e of fixed) lines.push(`- ${ticketLink(e)} ${cell(e.title)}: ${cell(e.ngspiceMaster.evidence)}`);
  lines.push('');

  lines.push('## All tickets');
  lines.push('');
  lines.push('| Ticket | Status | Category | Runnable deck | ngspice-47 | master | spice-ts | Outcome |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const e of t) {
    lines.push(`| ${ticketLink(e)} ${cell(e.title)}${readmeLink(e, 'benchmarks')} | ${e.status} | ${e.category} | ${e.runnableDeck ? 'yes' : 'no'} | ${e.ngspice47.verdict} | ${e.ngspiceMaster.verdict} | ${e.spiceTs.verdict} | ${OUTCOME_LABEL[outcome(e)]} |`);
  }
  lines.push('');
  return lines.join('\n');
}

export function renderTicketReadme(manifest: Manifest, e: TicketEntry): string {
  const lines: string[] = [];
  lines.push(`# ngspice bug #${e.ticket}: ${e.title}`);
  lines.push('');
  lines.push('Generated from `../../manifest.json` by `render.ts`; do not edit by hand.');
  lines.push('');
  lines.push(`- Ticket: ${e.url} (status \`${e.status}\`, opened ${e.created})`);
  lines.push(`- Category: ${e.category}`);
  lines.push(`- Outcome: ${OUTCOME_LABEL[outcome(e)]}`);
  if (e.spiceTsIssue) lines.push(`- spice-ts issue: ${e.spiceTsIssue}`);
  lines.push('');
  lines.push('## Decks');
  lines.push('');
  lines.push(`Origin: ${e.deckOrigin}.`);
  lines.push('');
  lines.push('Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.');
  lines.push('');
  if (e.committedDecks.length > 0) {
    lines.push('Committed:');
    lines.push('');
    for (const d of e.committedDecks) lines.push(`- [\`${d.path.split('/').slice(2).join('/')}\`](${d.path.split('/').slice(2).join('/')}) (${d.bytes} B, sha256 \`${d.sha256}\`)`);
    lines.push('');
  }
  if (e.uncommittedDecks.length > 0) {
    lines.push(`Not committed (fetch with \`pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts ${e.ticket}\`, which downloads the ticket attachments into the git-ignored \`benchmarks/corpus/ngspice-bugs/fetched/${e.ticket}/\` and verifies the hashes):`);
    lines.push('');
    for (const d of e.uncommittedDecks) lines.push(`- \`${d.name}\` (${d.bytes} B, sha256 \`${d.sha256}\`)`);
    lines.push('');
  }
  if (e.attachments.length > 0) {
    lines.push('Ticket attachments:');
    lines.push('');
    for (const a of e.attachments) lines.push(`- [${a.name}](${a.url}) (${a.bytes} B, sha256 \`${a.sha256}\`)`);
    lines.push('');
  }
  lines.push(`Edits relative to the ticket: ${e.edits}`);
  lines.push('');
  lines.push('## Expected answer');
  lines.push('');
  lines.push(`${e.expected} (basis: ${e.expectedBasis})`);
  lines.push('');
  lines.push('## Results');
  lines.push('');
  lines.push('| Engine | Verdict | Evidence |');
  lines.push('|---|---|---|');
  lines.push(`| ngspice-47 | ${e.ngspice47.verdict} | ${cell(e.ngspice47.evidence)} |`);
  lines.push(`| ngspice master | ${e.ngspiceMaster.verdict} | ${cell(e.ngspiceMaster.evidence)} |`);
  lines.push(`| spice-ts | ${e.spiceTs.verdict} | ${cell(e.spiceTs.evidence)} |`);
  lines.push('');
  lines.push(`Reproduces on ngspice-47: ${e.reproducesOnNgspice47}. Check: ${e.reproCheck || 'n/a'}`);
  lines.push('');
  if (e.upstreamCandidate) {
    lines.push(`Candidate upstream fix: ${e.upstreamCandidate}`);
    lines.push('');
  }
  if (e.notes) {
    lines.push(`Notes: ${e.notes}`);
    lines.push('');
  }
  lines.push(`Engines: ngspice-47 = ${manifest.engines.ngspice47}; master = ${manifest.engines.ngspiceMaster}; spice-ts = ${manifest.engines.spiceTs}.`);
  lines.push('');
  return lines.join('\n');
}

export const HERE = dirname(fileURLToPath(import.meta.url));
export const SUMMARY_PATH = resolve(HERE, '../../NGSPICE_BUGS.md');

export async function loadManifest(): Promise<Manifest> {
  return JSON.parse(await readFile(resolve(HERE, 'manifest.json'), 'utf8')) as Manifest;
}

/** Every generated file and its expected contents. */
export function renderAll(manifest: Manifest): Map<string, string> {
  const files = new Map<string, string>();
  files.set(SUMMARY_PATH, renderSummary(manifest));
  for (const e of manifest.tickets) {
    if (hasReadme(e)) files.set(resolve(HERE, 'tickets', String(e.ticket), 'README.md'), renderTicketReadme(manifest, e));
  }
  return files;
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check');
  const files = renderAll(await loadManifest());
  const stale: string[] = [];
  for (const [path, text] of files) {
    if (check) {
      const current = await readFile(path, 'utf8').catch(() => '');
      if (current !== text) stale.push(path);
    } else {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, text);
    }
  }
  if (check && stale.length > 0) {
    console.error(`stale generated files (run render.ts):\n${stale.join('\n')}`);
    process.exit(1);
  }
  console.log(`${check ? 'checked' : 'wrote'} ${files.size} files`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
