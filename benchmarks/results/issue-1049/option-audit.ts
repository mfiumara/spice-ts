/** Read-only static inventory. JSON goes to stdout; never runs either simulator. */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_FIXTURES } from '../../comparison-harness.js';

export interface OptionHit { line: number; option: string; text: string; parsedValue: number }
interface AuditedDeck { path: string; sha256: string }
interface DeckHit extends AuditedDeck, OptionHit {}
interface ParsedNumber { value: number; integral: boolean }
const INT_MAX = 2147483647;
const hash = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');

/** SPICE suffixes are case insensitive; M is milli, MEG is mega; trailing units are ignored.
 * Check integrality in decimal arithmetic before JS number rounding can erase a fraction.
 */
export function parseOptionNumber(text: string): ParsedNumber | null {
  const match = text.replace(/^(['"])(.*)\1$/, '$2').match(/^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:e([+-]?\d+))?([a-z]*)$/i);
  if (!match) return null;
  const suffix = match[4].toLowerCase();
  const powers: Record<string, number> = { t: 12, g: 9, k: 3, m: -3, u: -6, n: -9, p: -12, f: -15 };
  const power = suffix.startsWith('meg') ? 6 : suffix.startsWith('mil') ? -7 : powers[suffix[0]] ?? 0;
  const exponent = Number(match[3] ?? 0) + power;
  const fraction = match[2].split('.')[1]?.length ?? 0;
  const digits = BigInt(match[2].replace('.', '')) * (suffix.startsWith('mil') ? 254n : 1n);
  const scale = exponent - fraction;
  const value = Number(`${match[1]}${digits}e${scale}`);
  if (!Number.isFinite(value)) return null;
  // Avoid enormous powers for underflowed literals such as 1e-999999.
  const integral = digits === 0n || scale >= 0 || (-scale <= digits.toString().length && digits % (10n ** BigInt(-scale)) === 0n);
  return { value, integral };
}

export function auditOptions(deck: string): OptionHit[] {
  const logical: { line: number; text: string }[] = [];
  // SPICE reserves the first physical line for the title, even if it looks like a directive.
  for (const [index, raw] of deck.split(/\r?\n/).entries()) {
    if (index === 0) continue;
    const text = raw.replace(/(?:\$|;|\/\/).*$/, '').trim();
    if (!text || text.startsWith('*')) continue;
    if (text.startsWith('+') && logical.length) logical[logical.length - 1].text += ` ${text.slice(1)}`;
    else logical.push({ line: index + 1, text });
  }
  const hits: OptionHit[] = [];
  for (const line of logical) {
    if (!/^\.options?\b/i.test(line.text)) continue;
    for (const match of line.text.matchAll(/([a-z_][\w.-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s(),]+)/gi)) {
      const number = parseOptionNumber(match[2]);
      if (number?.integral && Math.abs(number.value) > INT_MAX) {
        hits.push({ line: line.line, option: match[1].toLowerCase(), text: match[2], parsedValue: number.value });
      }
    }
  }
  return hits;
}

export async function auditTree(root = process.cwd()): Promise<{
  schema: 1; roots: string[]; decks: AuditedDeck[]; generatorSources: AuditedDeck[]; hits: DeckHit[]; unavailablePins: AuditedDeck[];
}> {
  const roots = ['benchmarks/circuits', 'benchmarks/corpus'];
  const decks: AuditedDeck[] = [];
  const hits: DeckHit[] = [];
  const generatorSources: AuditedDeck[] = [];
  // Include extensionless decks and model/include files; exclude tooling, docs and result containers.
  const excluded = new Set(['.ts', '.js', '.mjs', '.py', '.md', '.json', '.jsonl', '.gz', '.zip', '.7z', '.png', '.pdf', '.out', '.log', '.prn', '.pl']);
  async function walk(directory: string): Promise<void> {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && extname(entry.name) === '.ts' && relative(root, path).startsWith('benchmarks/circuits/')) {
        const bytes = await readFile(path);
        // All current circuit generators are option-free. Fail closed if that changes, rather than
        // treating TypeScript quoting/interpolation as SPICE or silently missing generated options.
        if (/\.options?\b/i.test(bytes.toString('utf8'))) throw new Error(`audit generated options explicitly: ${path}`);
        generatorSources.push({ path: relative(root, path), sha256: hash(bytes) });
      }
      else if (entry.isFile() && !excluded.has(extname(entry.name).toLowerCase())) {
        const bytes = await readFile(path);
        if (bytes.includes(0)) continue;
        const item = { path: relative(root, path), sha256: hash(bytes) };
        decks.push(item);
        hits.push(...auditOptions(bytes.toString('utf8')).map(hit => ({ ...item, ...hit })));
      }
    }
  }
  for (const directory of roots) await walk(resolve(root, directory));
  // These netlists exist only in memory in the v2 harness. Hash actual generated bytes, not TS source.
  for (const fixture of DEFAULT_FIXTURES) {
    const item = { path: `benchmarks/comparison-harness.ts#${fixture.name}`, sha256: hash(fixture.netlist) };
    decks.push(item);
    hits.push(...auditOptions(fixture.netlist).map(hit => ({ ...item, ...hit })));
  }
  const manifest = JSON.parse(await readFile(resolve(root, 'benchmarks/corpus/ngspice-bugs/manifest.json'), 'utf8'));
  const unavailablePins: AuditedDeck[] = [];
  for (const ticket of manifest.tickets) {
    for (const pin of ticket.uncommittedDecks) {
      const path = `benchmarks/corpus/ngspice-bugs/fetched/${ticket.ticket}/${pin.name}`;
      if (!decks.some(deck => deck.path === path && deck.sha256 === pin.sha256)) unavailablePins.push({ path, sha256: pin.sha256 });
    }
  }
  return { schema: 1, roots, decks, generatorSources, hits, unavailablePins };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  auditTree().then(receipt => console.log(JSON.stringify(receipt, null, 2))).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
