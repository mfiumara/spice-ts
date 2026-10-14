import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ROOT, REVISION, hash, type Candidate } from './survey.js';
async function main() {
  const surveyBytes = await readFile(`${ROOT}/survey-xyce.json`);
  const probeBytes = await readFile(`${ROOT}/ngspice-probe.json`);
  const survey = JSON.parse(surveyBytes.toString());
  const probe = JSON.parse(probeBytes.toString());
  if (survey.revision !== REVISION || probe.revision !== REVISION) throw new Error('wrong revision');
  const statuses = new Map(probe.probes.map((p: { sourcePath: string; status: string }) => [p.sourcePath, p.status]));
  const candidates = (survey.candidates as Candidate[]).filter(c => c.reason === null && statuses.get(c.path) === 'success');
  if (candidates.length !== 24) throw new Error(`expected 24, got ${candidates.length}`);
  const blob = (path: string) => execFileSync('git', ['show', `${REVISION}:${path}`], { cwd: `${ROOT}/.upstream-xyce` });
  const licensePath = `${ROOT}/licenses/xyce/README.md`;
  const licenseTextPath = `${ROOT}/licenses/xyce/GPL-3.0.txt`;
  await mkdir(dirname(licensePath), { recursive: true });
  const license = blob('README.md');
  const licenseText = await readFile('benchmarks/corpus/corpus-l/licenses/xyce/GPL-3.0.txt');
  await writeFile(licensePath, license); await writeFile(licenseTextPath, licenseText);
  const circuits = [];
  for (const c of candidates) {
    const bytes = blob(c.path);
    if (hash(bytes) !== c.sha256) throw new Error('source changed');
    if (c.verdict.reason !== null) throw new Error('static rejected');
    const localPath = `${ROOT}/fixtures/xyce/${c.path}`;
    await mkdir(dirname(localPath), { recursive: true }); await writeFile(localPath, bytes);
    circuits.push({ id: `m-${circuits.length + 1}`, source: 'xyce', upstreamPath: c.path, sourcePath: `xyce/${c.path}`,
      sourceUrl: `https://github.com/Xyce/Xyce_Regression/blob/${REVISION}/${c.path}`, revision: REVISION,
      licence: 'GPL-3.0-or-later', localPath, sha256: c.sha256, bytes: c.bytes,
      analyses: c.verdict.analyses, unmappedAnalyses: c.verdict.unmappedAnalyses, sameNameAs: [], includeClosure: [] });
  }
  const manifest = { schemaVersion: 1, issue: 'https://github.com/mfiumara/spice-ts/issues/1045', mechanicalAdaptation: 'none',
    sources: [{ key: 'xyce', repository: 'https://github.com/Xyce/Xyce_Regression', revision: REVISION,
      license: 'GPL-3.0-or-later', licensePath, licenseSha256: hash(license), licenseTextPath, licenseTextSha256: hash(licenseText),
      basis: 'Repository README grants GPL version 3 or later. Selected decks have no separate notice or external dependencies. README and full GPL text retained unchanged; independent benchmark inputs, not package code.' }],
    selection: 'All novel standalone licence-eligible decks in survey.ts families with a successful unchanged ngspice-47 probe. Selection never reads spice-ts results.', circuits,
    exclusions: { receipt: `${ROOT}/survey-xyce.json`, receiptSha256: hash(surveyBytes), probe: `${ROOT}/ngspice-probe.json`, probeSha256: hash(probeBytes), selectedPaths: candidates.map(c => c.path) } };
  await writeFile(`${ROOT}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
  const sources = '# corpus-m provenance (#1045)\n\n24 unchanged public AC (filters, opamps, gain stages), diode and MOS device decks. Repository README grants GPL-3.0-or-later at pinned revision `' + REVISION + '`. README and GPL text retained under licenses/xyce; inputs remain separate from MIT packages. SHA-256 dedupe against every file of every existing corpus, also terminal-newline variants. No adaptation or spice-ts-success filter. Source-family/static/hash survey precedes ngspice-47 probe; all 24 successes selected, all probe failures retained in ngspice-probe.json. Other families deferred, not silently called failures. Uniform existing harness metrics, no tolerance edits; every spice-ts loss published. No aggregate refresh.\n\n| ID | Pinned upstream URL | SHA-256 | Licence |\n|---|---|---|---|\n' + circuits.map(c => `| ${c.id} | [${c.upstreamPath}](${c.sourceUrl}) | ${c.sha256} | ${c.licence} |`).join('\n') + '\n\n## Rejected and deferred candidates\n\nVendor/LTspice application-note decks and unlicensed textbook/ISCAS SPICE collections: rejected for this batch, no explicit redistribution grant verified; no such bytes committed. Gate-level ISCAS .bench also requires a separately licensed transistor-cell translation.\n\nAll surveyed exclusions (licence-unclear files are not committed):\n\n| Pinned upstream path | Reason | SHA-256 |\n|---|---|---|\n' + survey.candidates.filter((c: Candidate) => !candidates.includes(c)).map((c: Candidate) => `| [${c.path}](https://github.com/Xyce/Xyce_Regression/blob/${REVISION}/${c.path}) | ${c.reason ?? `ngspice probe: ${statuses.get(c.path)}`} | ${c.sha256} |`).join('\n') + '\n';
  await writeFile(`${ROOT}/SOURCES.md`, sources);
  console.log(`vendored ${circuits.length} original decks`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
