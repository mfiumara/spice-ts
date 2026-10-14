import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ROOT, REVISION, CHECKOUT, hash, type Candidate } from './survey.js';
import { XYCE_REVISION, XYCE_CHECKOUT } from './survey-xyce.js';
interface Source {
  key: string; repository: string; revision: string; checkout: string; license: string;
  notice: string; text: string | null; survey: string; probe: string; count: number; basis: string;
}
const SOURCES: Source[] = [
  { key: 'ngspice', repository: 'https://github.com/imr/ngspice', revision: REVISION, checkout: CHECKOUT,
    license: 'BSD-3-Clause', notice: 'COPYING', text: null, survey: 'survey-ngspice.json', probe: 'ngspice-probe.json', count: 13,
    basis: 'COPYING explicitly adopts Modified BSD for all source, test and example files except listed paths; none of the selected example/test paths is an exception. The licensing document itself is CC-BY-SA-4.0 and is retained unchanged with attribution via the pinned URL.' },
  { key: 'xyce', repository: 'https://github.com/Xyce/Xyce_Regression', revision: XYCE_REVISION, checkout: XYCE_CHECKOUT,
    license: 'GPL-3.0-or-later', notice: 'README.md', text: 'benchmarks/corpus/corpus-m/licenses/xyce/GPL-3.0.txt', survey: 'survey-xyce.json', probe: 'xyce-probe.json', count: 11,
    basis: 'Repository README grants GPL version 3 or later. Selected decks have no separate notice or external dependencies. README and full GPL text retained unchanged; independent benchmark inputs, not package code. Supervisor confirmed this licence is allowed under CHARTER.' },
];
async function main() {
  const circuits = [];
  const sources = [];
  const receipts = [];
  const exclusions = [];
  for (const source of SOURCES) {
    const surveyBytes = await readFile(`${ROOT}/${source.survey}`);
    const probeBytes = await readFile(`${ROOT}/${source.probe}`);
    const survey = JSON.parse(surveyBytes.toString());
    const probe = JSON.parse(probeBytes.toString());
    if (survey.revision !== source.revision || probe.revision !== source.revision) throw new Error('wrong revision');
    const statuses = new Map(probe.probes.map((p: { sourcePath: string; status: string }) => [p.sourcePath, p.status]));
    const candidates = (survey.candidates as Candidate[]).filter(c => c.reason === null && statuses.get(c.path) === 'success');
    if (candidates.length !== source.count) throw new Error(`expected ${source.count}, got ${candidates.length}`);
    const blob = (path: string) => execFileSync('git', ['show', `${source.revision}:${path}`], { cwd: source.checkout, maxBuffer: 64 * 1024 * 1024 });
    const licensePath = `${ROOT}/licenses/${source.key}/${source.notice}`;
    const licenseTextPath = source.text ? `${ROOT}/licenses/${source.key}/GPL-3.0.txt` : licensePath;
    const license = blob(source.notice);
    const licenseText = source.text ? await readFile(source.text) : license;
    await mkdir(dirname(licensePath), { recursive: true });
    await writeFile(licensePath, license);
    if (source.text) await writeFile(licenseTextPath, licenseText);
    sources.push({ key: source.key, repository: source.repository, revision: source.revision, license: source.license,
      licenseUrl: `${source.repository}/blob/${source.revision}/${source.notice}`, licensePath, licenseSha256: hash(license), licenseTextPath, licenseTextSha256: hash(licenseText), basis: source.basis });
    for (const c of candidates) {
      const bytes = blob(c.path);
      const p = probe.probes.find((p: { sourcePath: string }) => p.sourcePath === c.path);
      if (hash(bytes) !== c.sha256 || p.sha256 !== c.sha256) throw new Error('source changed');
      if (c.verdict.reason !== null) throw new Error('static rejected');
      const localPath = `${ROOT}/fixtures/${source.key}/${c.path}`;
      await mkdir(dirname(localPath), { recursive: true }); await writeFile(localPath, bytes);
      circuits.push({ id: `n-${circuits.length + 1}`, source: source.key, upstreamPath: c.path, sourcePath: `${source.key}/${c.path}`,
        sourceUrl: `${source.repository}/blob/${source.revision}/${c.path}`, revision: source.revision,
        licence: source.license, localPath, sha256: c.sha256, bytes: c.bytes,
        analyses: c.verdict.analyses, unmappedAnalyses: c.verdict.unmappedAnalyses, sameNameAs: [], includeClosure: [] });
    }
    receipts.push({ source: source.key, receipt: `${ROOT}/${source.survey}`, receiptSha256: hash(surveyBytes), probe: `${ROOT}/${source.probe}`, probeSha256: hash(probeBytes), selectedPaths: candidates.map(c => c.path) });
    for (const c of survey.candidates as Candidate[]) {
      if (candidates.includes(c)) continue;
      exclusions.push(`| [${source.key}/${c.path}](${source.repository}/blob/${source.revision}/${c.path}) | ${c.reason ?? (statuses.has(c.path) ? `ngspice probe: ${statuses.get(c.path)}` : 'deferred: batch cap reached')} | ${c.sha256} |`);
    }
  }
  const manifest = { schemaVersion: 1, issue: 'https://github.com/mfiumara/spice-ts/issues/1045', mechanicalAdaptation: 'none', sources,
    selection: 'All 13 successful BSD ngspice probes (100 eligible exhausted), then first 11 Xyce successes in survey order. Remaining Xyce candidates and other families deferred. No spice-ts selection filter.', circuits, exclusions: receipts };
  await writeFile(`${ROOT}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
  const provenance = '# corpus-n provenance (#1045)\n\n24 unchanged public application/regression decks. Licence policy is redistributable with recorded terms (CHARTER); the supervisor explicitly allowed GPL-3.0-or-later Xyce inputs. BSD ngspice inputs and GPL Xyce inputs remain separate from MIT packages. SHA-256 dedupe against every existing corpus file, plus terminal-newline variants and earlier candidates. No adaptation or spice-ts-success filter. Uniform existing harness metrics, no tolerance edits; every spice-ts loss published. No aggregate refresh.\n\n' + sources.map(s => `- ${s.key}: pinned revision \`${s.revision}\`, ${s.license}. [Licence notice](${s.licenseUrl}). ${s.basis}`).join('\n') + '\n\n| ID | Pinned upstream URL | SHA-256 | Licence |\n|---|---|---|---|\n' + circuits.map(c => `| ${c.id} | [${c.sourcePath}](${c.sourceUrl}) | ${c.sha256} | ${c.licence} |`).join('\n') + '\n\n## Rejected and deferred candidates\n\nAll 100 static-eligible BSD decks were probed: 13 success, 85 failed/no reference, 2 unsupported. All 87 non-reference outcomes are retained in ngspice-probe.json. Xyce selection stops at 11 successful references; unprobed remainder is deferred, not silently called failures. Static rejections and all probed failures are retained below and in both survey/probe receipts. Other Xyce families are deferred. Vendor/LTspice and unlicensed textbook/ISCAS material was not vendored.\n\n| Pinned upstream path | Reason | SHA-256 |\n|---|---|---|\n' + exclusions.join('\n') + '\n';
  await writeFile(`${ROOT}/SOURCES.md`, provenance);
  console.log(`vendored ${circuits.length} original decks`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
