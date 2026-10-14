import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { probeDeck } from '../corpus-g/ingest.js';
import { ROOT, type Candidate } from './survey.js';
const revision = '7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2';
async function main() {
  if (!/ngspice-47\b/.test(execFileSync('ngspice', ['--version'], { encoding: 'utf8' }))) throw new Error('requires ngspice-47');
  const survey = JSON.parse(await readFile(`${ROOT}/survey-xyce.json`, 'utf8'));
  if (survey.revision !== revision) throw new Error('wrong survey revision');
  const probes = [];
  for (const c of survey.candidates as Candidate[]) {
    if (c.reason !== null) continue;
    if (probes.filter(p => p.status === 'success').length === 11) break;
    const bytes = execFileSync('git', ['show', `${revision}:${c.path}`], { cwd: '.upstream-xyce', maxBuffer: 64 * 1024 * 1024 });
    const result = await probeDeck(c.path, bytes);
    if (result.sha256 !== c.sha256) throw new Error('source hash mismatch');
    probes.push(result);
    console.log(c.path, result.status);
    await writeFile(`${ROOT}/xyce-probe.json`, JSON.stringify({ revision, ngspice: 'ngspice-47', command: `spice-heavy pnpm exec tsx ${ROOT}/probe-xyce.ts`, selection: 'First 11 successes in survey order; unprobed remainder deferred.', probes }, null, 2) + '\n');
  }
  if (probes.filter(p => p.status === 'success').length !== 11) throw new Error('fewer than 11 runnable novel decks');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
