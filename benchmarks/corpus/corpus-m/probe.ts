import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { probeDeck } from '../corpus-g/ingest.js';
import { ROOT, REVISION, type Candidate } from './survey.js';
async function main() {
  if (!/ngspice-47\b/.test(execFileSync('ngspice', ['--version'], { encoding: 'utf8' }))) throw new Error('requires ngspice-47');
  const survey = JSON.parse(await readFile(`${ROOT}/survey-xyce.json`, 'utf8'));
  if (survey.revision !== REVISION) throw new Error('wrong survey revision');
  const probes = [];
  for (const c of survey.candidates as Candidate[]) {
    if (c.reason !== null) continue;
    const bytes = execFileSync('git', ['show', `${REVISION}:${c.path}`], { cwd: `${ROOT}/.upstream-xyce` });
    const result = await probeDeck(c.path, bytes);
    if (result.sha256 !== c.sha256) throw new Error('source hash mismatch');
    probes.push(result);
    console.log(c.path, result.status);
    await writeFile(`${ROOT}/ngspice-probe.json`, JSON.stringify({ revision: REVISION, ngspice: 'ngspice-47', command: `spice-heavy pnpm exec tsx ${ROOT}/probe.ts`, probes }, null, 2) + '\n');
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
