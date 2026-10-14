import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { staticVerdict, stripTerminalNewline, DECK_EXTENSIONS } from '../corpus-h/lib.js';
import { ROOT, hash, priority, type Candidate } from './survey.js';
export const XYCE_REVISION = '7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2';
export const XYCE_CHECKOUT = '.upstream-xyce';
export const selectedXyceFamily = (path: string) => /^Netlists\/(?:ACtests|4049OSC|RINGS|MCNC_BJT_OPAMPAL|CircuitSim90|RESISTOR|INDUCTOR|RLC|VSWITCH|ISWITCH|BJT_IC|BJT_OFF|SANDLER\d+)\//.test(path) || /^Netlists\/.*(?:smps|pll|osc|filter|opamp|op-amp|buck|boost|wien)/i.test(path);
async function main() {
  const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', XYCE_REVISION], { cwd: XYCE_CHECKOUT, encoding: 'utf8' }).trim().split('\n');
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
  // Cross-source duplicates are excluded before probing either engine.
  const ng = JSON.parse(await readFile(`${ROOT}/survey-ngspice.json`, 'utf8'));
  for (const c of ng.candidates) existing.add(c.sha256);
  const candidates: Candidate[] = [];
  for (const path of paths.filter(p => selectedXyceFamily(p) && DECK_EXTENSIONS.test(p)).sort((a, b) => priority(a) - priority(b) || a.localeCompare(b, 'en'))) {
    const bytes = execFileSync('git', ['show', `${XYCE_REVISION}:${path}`], { cwd: XYCE_CHECKOUT, maxBuffer: 64 * 1024 * 1024 });
    const verdict = staticVerdict(bytes, path, new Set(paths));
    const reason = existing.has(hash(bytes)) || existing.has(hash(stripTerminalNewline(bytes))) ? 'already-in-corpus-or-earlier-candidate' : verdict.reason;
    candidates.push({ path, sha256: hash(bytes), bytes: bytes.length, reason, verdict });
    existing.add(hash(bytes)); existing.add(hash(stripTerminalNewline(bytes)));
  }
  await writeFile(`${ROOT}/survey-xyce.json`, JSON.stringify({ revision: XYCE_REVISION, scope: 'selectedXyceFamily application and passive/BJT/switch families. Application-path priority then en path order. First 11 ngspice successes supplement all 13 BSD successes to 24. Unprobed remainder and other families deferred, never spice-ts filtered.', candidates }, null, 2) + '\n');
  console.log(`surveyed ${candidates.length}; eligible ${candidates.filter(c => c.reason === null).length}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
