import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { staticVerdict, stripTerminalNewline, DECK_EXTENSIONS } from '../corpus-h/lib.js';

export const ROOT = 'benchmarks/corpus/corpus-l';
export const REVISION = '7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2';
export interface Candidate { path: string; sha256: string; bytes: number; reason: string | null; verdict: ReturnType<typeof staticVerdict> }
export const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
export const selectedFamily = (path: string) => path.startsWith('Netlists/CircuitSim90/MOS3/') ||
  /^Netlists\/ACtests\/mos\/gain-stage[1236]\.cir$/.test(path) ||
  /^Netlists\/ACtests\/SANDLER(?:7|8|9|16)\/sandler\d+\.cir$/.test(path) ||
  /^Netlists\/ACtests\/diffpair_spiceMan(?:LIN)?\.cir$/.test(path);

async function main() {
  const checkout = `${ROOT}/.upstream-xyce`;
  const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', REVISION], { cwd: checkout, encoding: 'utf8' }).trim().split('\n');
  const existing = new Set<string>();
  for (const corpus of await readdir('benchmarks/corpus')) {
    if (corpus === 'corpus-l') continue;
    let files;
    try { files = await readdir(`benchmarks/corpus/${corpus}/fixtures`, { recursive: true, withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    for (const file of files.filter(f => f.isFile())) {
      const bytes = await readFile(resolve(file.parentPath, file.name));
      existing.add(hash(bytes)); existing.add(hash(stripTerminalNewline(bytes)));
    }
  }
  const candidates: Candidate[] = [];
  for (const path of paths.filter(p => selectedFamily(p) && DECK_EXTENSIONS.test(p))) {
    const bytes = execFileSync('git', ['show', `${REVISION}:${path}`], { cwd: checkout, maxBuffer: 64 * 1024 * 1024 });
    const verdict = staticVerdict(bytes, path, new Set(paths));
    const reason = existing.has(hash(bytes)) || existing.has(hash(stripTerminalNewline(bytes))) ? 'already-in-corpus' : verdict.reason;
    candidates.push({ path, sha256: hash(bytes), bytes: bytes.length, reason, verdict });
  }
  await writeFile(`${ROOT}/survey-xyce.json`, JSON.stringify({ revision: REVISION,
    scope: 'Selected source families only, not a fresh repository-wide survey; all other families batch-deferred without engine probing.', candidates }, null, 2) + '\n');
  console.log(JSON.stringify(candidates.map(c => ({ path: c.path, reason: c.reason })), null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
