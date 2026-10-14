import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

const ROOT = 'benchmarks/corpus/corpus-k';
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
async function main() {
  const survey = JSON.parse(await readFile(`${ROOT}/survey-xyce.json`, 'utf8'));
  // Fixed source-path selection made before running either engine. Retain all resulting failures.
  const paths = survey.candidates.filter((c: { path: string; reason: string | null }) => c.reason === null &&
    (c.path.startsWith('Netlists/CircuitSim90/MOS2/') || c.path === 'Netlists/ACtests/mos/opamp-ol.cir' || c.path === 'Netlists/WAMPDE/HARTLEY/hartley.cir'));
  if (paths.length !== 20) throw new Error(`expected 20 candidates, got ${paths.length}`);
  const blob = (path: string) => execFileSync('git', ['show', `${survey.revision}:${path}`], { cwd: `${ROOT}/.upstream-xyce` });
  const licensePath = `${ROOT}/licenses/xyce/README.md`;
  await mkdir(dirname(licensePath), { recursive: true });
  const license = blob('README.md');
  await writeFile(licensePath, license);
  const names = new Map<string, string[]>();
  for (const corpus of await readdir('benchmarks/corpus')) {
    if (corpus === 'corpus-k') continue;
    let files;
    try { files = await readdir(`benchmarks/corpus/${corpus}/fixtures`, { recursive: true, withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    for (const file of files.filter(f => f.isFile())) {
      const name = file.name.toLowerCase();
      names.set(name, [...(names.get(name) ?? []), resolve(file.parentPath, file.name).slice(process.cwd().length + 1)]);
    }
  }
  const circuits = [];
  for (const c of paths) {
    const bytes = blob(c.path);
    if (hash(bytes) !== c.sha256) throw new Error(`source changed: ${c.path}`);
    const sourcePath = `xyce/${c.path}`;
    const localPath = `${ROOT}/fixtures/${sourcePath}`;
    await mkdir(dirname(localPath), { recursive: true });
    await writeFile(localPath, bytes);
    circuits.push({ id: `k-${circuits.length + 1}`, source: 'xyce', upstreamPath: c.path, sourcePath,
      sourceUrl: `https://github.com/Xyce/Xyce_Regression/blob/${survey.revision}/${c.path}`, revision: survey.revision,
      licence: 'GPL-3.0-or-later', localPath, sha256: c.sha256, bytes: bytes.length,
      analyses: c.verdict.analyses, unmappedAnalyses: c.verdict.unmappedAnalyses, sameNameAs: names.get(basename(c.path).toLowerCase()) ?? [], includeClosure: [] });
  }
  const manifest = { schemaVersion: 1, issue: 'https://github.com/mfiumara/spice-ts/issues/980', mechanicalAdaptation: 'none',
    sources: [{ key: 'xyce', repository: 'https://github.com/Xyce/Xyce_Regression', revision: survey.revision,
      license: 'GPL-3.0-or-later', licensePath, licenseSha256: hash(license),
      licenseTextPath: `${ROOT}/licenses/xyce/GPL-3.0.txt`, licenseTextSha256: hash(await readFile(`${ROOT}/licenses/xyce/GPL-3.0.txt`)),
      basis: 'Repository README Copyright and license explicitly grants GPL version 3 or later. Selected suite files carry no separate copyright/licence restrictions. Original MCNC process parameters are supplied within the suite decks, not fetched vendor libraries. README notice retained unchanged; GPL text retained separately.' }],
    selection: 'All 18 novel standalone CircuitSim90/MOS2 decks plus the novel ACtests/mos/opamp-ol and WAMPDE/HARTLEY/hartley decks. Static/hash selection only, no engine probe or success filter. Related circuit variants supplied by upstream, not generated here. Every outcome retained.',
    circuits, exclusions: { receipt: `${ROOT}/survey-xyce.json`,
      selectedPaths: paths.map((c: { path: string }) => c.path),
      rule: 'Every surveyed path not in selectedPaths is excluded for its static reason, or batch-deferred when reason is null.',
      receiptSha256: hash(await readFile(`${ROOT}/survey-xyce.json`)) },
    rejectedSourceSurvey: { receipt: `${ROOT}/survey-current.json`, receiptSha256: hash(await readFile(`${ROOT}/survey-current.json`)),
      licensePath: `${ROOT}/licenses/ngspice/COPYING`, licenseSha256: hash(await readFile(`${ROOT}/licenses/ngspice/COPYING`)) } };
  await writeFile(`${ROOT}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`vendored ${circuits.length} original decks`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
