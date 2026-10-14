import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { staticVerdict, stripTerminalNewline, DECK_EXTENSIONS } from '../corpus-h/lib.js';
export const ROOT = 'benchmarks/corpus/corpus-n';
export const REVISION = 'a80f6e3e95d51534905b1f23410a951802666656';
export const CHECKOUT = '.upstream-current';
export const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
export interface Candidate { path: string; sha256: string; bytes: number; reason: string | null; verdict: ReturnType<typeof staticVerdict> }
export const selectedFamily = (path: string) => /^(examples|tests)\/|^paranoia_parallel\/examples\//.test(path);
// Prefer application circuits, then remaining regression decks. Never consult spice-ts outcomes.
export const priority = (path: string) => /smps|pll|osc|filter|opamp|op-amp|buck|boost|wien/i.test(path) ? 0 : 1;
async function main() {
  const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', REVISION], { cwd: CHECKOUT, encoding: 'utf8' }).trim().split('\n');
  const existing = new Set<string>();
  for (const corpus of await readdir('benchmarks/corpus')) {
    if (corpus === 'corpus-n') continue;
    let files;
    try { files = await readdir(`benchmarks/corpus/${corpus}`, { recursive: true, withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOTDIR') continue; throw error; }
    for (const file of files.filter(f => f.isFile() && !f.parentPath.includes('/.upstream'))) {
      const bytes = await readFile(resolve(file.parentPath, file.name));
      existing.add(hash(bytes)); existing.add(hash(stripTerminalNewline(bytes)));
    }
  }
  const candidates: Candidate[] = [];
  for (const path of paths.filter(p => selectedFamily(p) && DECK_EXTENSIONS.test(p)).sort((a, b) => priority(a) - priority(b) || a.localeCompare(b, 'en'))) {
    const bytes = execFileSync('git', ['show', `${REVISION}:${path}`], { cwd: CHECKOUT, maxBuffer: 64 * 1024 * 1024 });
    const verdict = staticVerdict(bytes, path, new Set(paths));
    const reason = existing.has(hash(bytes)) || existing.has(hash(stripTerminalNewline(bytes))) ? 'already-in-corpus' : verdict.reason;
    candidates.push({ path, sha256: hash(bytes), bytes: bytes.length, reason, verdict });
    existing.add(hash(bytes)); existing.add(hash(stripTerminalNewline(bytes)));
  }
  await writeFile(`${ROOT}/survey-ngspice.json`, JSON.stringify({ revision: REVISION, scope: 'All examples/tests and paranoia_parallel/examples decks, application-path priority then en path order. Exhaust all static-eligible candidates; retain every success and failure, never spice-ts filtered.', candidates }, null, 2) + '\n');
  console.log(JSON.stringify(candidates.filter(c => c.reason === null).map(c => c.path), null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
