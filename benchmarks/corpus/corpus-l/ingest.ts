import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { staticVerdict, stripTerminalNewline } from '../corpus-h/lib.js';
import { ROOT, REVISION, hash, selectedFamily, type Candidate } from './survey.js';

async function main() {
  const surveyBytes = await readFile(`${ROOT}/survey-xyce.json`);
  const survey = JSON.parse(surveyBytes.toString()) as { revision: string; candidates: Candidate[] };
  if (survey.revision !== REVISION) throw new Error('wrong revision');
  const candidates = survey.candidates.filter(c => c.reason === null && selectedFamily(c.path));
  if (candidates.length !== 20) throw new Error(`expected 20 novel candidates, got ${candidates.length}`);
  const blob = (path: string) => execFileSync('git', ['show', `${REVISION}:${path}`], { cwd: `${ROOT}/.upstream-xyce`, maxBuffer: 64 * 1024 * 1024 });
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
  const licensePath = `${ROOT}/licenses/xyce/README.md`;
  await mkdir(dirname(licensePath), { recursive: true });
  const license = blob('README.md');
  await writeFile(licensePath, license);
  const licenseTextPath = `${ROOT}/licenses/xyce/GPL-3.0.txt`;
  // Retain the same full GPL text as corpus-k; upstream README is the actual grant.
  const licenseText = await readFile('benchmarks/corpus/corpus-k/licenses/xyce/GPL-3.0.txt');
  await writeFile(licenseTextPath, licenseText);
  const circuits = [];
  for (const c of candidates) {
    const bytes = blob(c.path);
    if (hash(bytes) !== c.sha256 || bytes.length !== c.bytes) throw new Error(`source changed: ${c.path}`);
    if (existing.has(hash(bytes)) || existing.has(hash(stripTerminalNewline(bytes)))) throw new Error(`duplicate: ${c.path}`);
    const verdict = staticVerdict(bytes, c.path, new Set<string>());
    if (verdict.reason !== null) throw new Error(`static rejection: ${c.path}: ${verdict.reason}`);
    existing.add(hash(bytes)); existing.add(hash(stripTerminalNewline(bytes)));
    const sourcePath = `xyce/${c.path}`;
    const localPath = `${ROOT}/fixtures/${sourcePath}`;
    await mkdir(dirname(localPath), { recursive: true });
    await writeFile(localPath, bytes);
    circuits.push({ id: `l-${circuits.length + 1}`, source: 'xyce', upstreamPath: c.path, sourcePath,
      sourceUrl: `https://github.com/Xyce/Xyce_Regression/blob/${REVISION}/${c.path}`, revision: REVISION,
      licence: 'GPL-3.0-or-later', localPath, sha256: c.sha256, bytes: c.bytes,
      analyses: verdict.analyses, unmappedAnalyses: verdict.unmappedAnalyses, sameNameAs: [], includeClosure: [] });
  }
  const manifest = { schemaVersion: 1, issue: 'https://github.com/mfiumara/spice-ts/issues/1045', mechanicalAdaptation: 'none',
    sources: [{ key: 'xyce', repository: 'https://github.com/Xyce/Xyce_Regression', revision: REVISION,
      license: 'GPL-3.0-or-later', licensePath, licenseSha256: hash(license), licenseTextPath, licenseTextSha256: hash(licenseText),
      basis: 'Repository README Copyright and license grants GPL version 3 or later. Selected decks have no separate copyright/licence notice or external dependencies. README and full GPL text retained unchanged.' }],
    selection: 'All 10 novel CircuitSim90/MOS3 decks, four ACtests/mos gain stages, four ACtests/SANDLER decks and first two ACtests/diffpair_spiceMan decks. Static/hash source-family selection before engine execution, no success filter. Every outcome retained.',
    circuits, exclusions: { receipt: `${ROOT}/survey-xyce.json`, receiptSha256: hash(surveyBytes), selectedPaths: candidates.map(c => c.path),
      rule: 'Survey covers only the selected families. Other source families are batch-deferred, not engine failures or licence rejections.' } };
  await writeFile(`${ROOT}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
  const heading = '## corpus-l original MOS3, gain-stage and Sandler batch (#1045)';
  const provenance = `${heading}\n\nTwenty novel unchanged decks from https://github.com/Xyce/Xyce_Regression at pinned revision \`${REVISION}\`, SPDX \`GPL-3.0-or-later\`. The repository README Copyright and license grants GPL version 3 or later; selected files have no separate notice or external dependencies. Byte-identical README and full GPL text are retained under corpus-l/licenses/xyce. Hash dedupe covers all previous corpora, including d-k, and terminal-newline variants. No fixture adaptation, engine-success filter or per-circuit tolerance tuning. Every result, including losses, is published in corpus-l/README.md and outcomes.json. No aggregate refresh.\n\nSelection is fixed before engine execution: ten CircuitSim90/MOS3 decks, four ACtests/mos gain stages, four ACtests/SANDLER decks, and the first two ACtests/diffpair_spiceMan decks. Survey covers these families only; other families are batch-deferred, not engine failures or licence rejections. MOS2_LARGE is deferred to a separately budgeted large-circuit batch. No vendor/app-note licences or KiCad schematic exports are inferred.\n\nEvery row uses the pinned revision above and GPL-3.0-or-later under the retained Xyce README grant.\n\n| ID | Pinned source URL | SHA-256 | SPDX licence |\n|---|---|---|---|\n` +
    circuits.map(c => `| ${c.id} | [${c.upstreamPath}](${c.sourceUrl}) | ${c.sha256} | ${c.licence} |`).join('\n') + '\n';
  await writeFile(`${ROOT}/SOURCES.md`, '# corpus-l provenance and selection\n\n' + provenance);
  if (!(await readFile('benchmarks/SOURCES.md', 'utf8')).includes(heading)) await appendFile('benchmarks/SOURCES.md', '\n' + provenance);
  console.log(`vendored ${circuits.length} original decks`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
