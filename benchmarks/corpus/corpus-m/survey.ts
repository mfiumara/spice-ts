import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { staticVerdict, stripTerminalNewline, DECK_EXTENSIONS } from '../corpus-h/lib.js';

export const ROOT = 'benchmarks/corpus/corpus-m';
export const REVISION = '7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2';
export interface Candidate { path: string; sha256: string; bytes: number; reason: string | null; verdict: ReturnType<typeof staticVerdict> }
export const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
export const selectedFamily = (path: string) => /^Netlists\/(?:ACtests\/|SANDLER\d+\/|4049OSC\/|CAPACITOR\/|DIODE\/|MOS6\/|TEMPCAP\/|TEMPIND\/|MOSFET_ParamAliases\/|[NP](?:MOS[13]|JFET|PN|NP)_DC\/|CircuitSim90\/BJT\/|Certification_Tests\/BUG_805\/)/.test(path);

async function main() {
  const checkout = `${ROOT}/.upstream-xyce`;
  const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', REVISION], { cwd: checkout, encoding: 'utf8' }).trim().split('\n');
  const existing = new Set<string>();
  for (const corpus of await readdir('benchmarks/corpus')) {
    if (corpus === 'corpus-m') continue;
    let files;
    try { files = await readdir(`benchmarks/corpus/${corpus}`, { recursive: true, withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOTDIR') continue; throw error; }
    for (const file of files.filter(f => f.isFile() && !f.parentPath.includes('/.upstream'))) {
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
    scope: `Source families defined by selectedFamily in survey.ts; other families deferred. Dedupe against every file in every other corpus directory.`, candidates }, null, 2) + '\n');
  console.log(JSON.stringify(candidates.filter(c => c.reason === null).map(c => ({ path: c.path, bytes: c.bytes, verdict: c.verdict })), null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
