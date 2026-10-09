#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const corpusRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(corpusRoot, '../../..');
const manifest = JSON.parse(await readFile(resolve(corpusRoot, 'manifest.json'), 'utf8'));
const requiredSourceFields = [
  'name',
  'repository',
  'revision',
  'upstreamRelease',
  'originalDistribution',
  'license',
  'licenseUrl',
  'redistributionDecision',
  'mechanicalAdaptation',
];
const requiredCircuitFields = [
  'id',
  'category',
  'analyses',
  'sourcePath',
  'sourceUrl',
  'localPath',
  'sha256',
  'ngspice',
  'spiceTs',
];
const supportedAnalyses = new Set(['op', 'dc', 'ac', 'tran', 'pz', 'noise', 'disto']);
const failures = [];
const ngspiceFailures = [];
const spiceTsFailures = [];
const categoryCounts = new Map();
const ids = new Set();
const paths = new Set();
let parse;

function observedAnalyses(text) {
  const analyses = new Set();
  let inControl = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('*')) continue;
    if (/^\.control\b/i.test(line)) {
      inControl = true;
      continue;
    }
    if (/^\.endc\b/i.test(line)) {
      inControl = false;
      continue;
    }
    const match = inControl
      ? line.match(/^(op|dc|ac|tran|pz|noise|disto)\b/i)
      : line.match(/^\.(op|dc|ac|tran|pz|noise|disto)\b/i);
    if (match) analyses.add(match[1].toLowerCase());
  }

  return analyses;
}

function statusIsValid(record) {
  return record?.expectedStatus === 'pass' || record?.expectedStatus === 'fail';
}

try {
  ({ parse } = await import(pathToFileURL(resolve(repoRoot, 'packages/core/dist/index.js'))));
} catch (error) {
  console.error('ERROR: packages/core/dist is unavailable; run pnpm build first.');
  console.error(error.message);
  process.exit(1);
}

const missingSource = requiredSourceFields.filter(
  (field) => manifest.source?.[field] === undefined || manifest.source[field] === '',
);
if (missingSource.length) failures.push(`source metadata missing: ${missingSource.join(', ')}`);
if (!Array.isArray(manifest.circuits)) failures.push('circuits must be an array');

const versionResult = spawnSync('ngspice', ['--version'], { encoding: 'utf8' });
const ngspiceAvailable = !versionResult.error && versionResult.status === 0;
const ngspiceVersion = ngspiceAvailable
  ? `${versionResult.stdout}\n${versionResult.stderr}`
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => /ngspice/i.test(line)) ?? 'ngspice (version line unavailable)'
  : versionResult.error?.message ?? `ngspice --version exited ${versionResult.status}`;
if (!ngspiceAvailable) failures.push(`ngspice unavailable: ${ngspiceVersion}`);

for (const circuit of manifest.circuits ?? []) {
  const missing = requiredCircuitFields.filter(
    (field) => circuit[field] === undefined || circuit[field] === '',
  );
  if (missing.length) {
    failures.push(`${circuit.id ?? '<unknown>'}: missing provenance fields: ${missing.join(', ')}`);
    continue;
  }

  if (ids.has(circuit.id)) failures.push(`${circuit.id}: duplicate id`);
  if (paths.has(circuit.localPath)) failures.push(`${circuit.id}: duplicate localPath`);
  ids.add(circuit.id);
  paths.add(circuit.localPath);
  categoryCounts.set(circuit.category, (categoryCounts.get(circuit.category) ?? 0) + 1);

  if (!circuit.localPath.startsWith('benchmarks/corpus/classic/fixtures/')) {
    failures.push(`${circuit.id}: localPath escapes the classic fixture boundary`);
  }
  if (!circuit.sourceUrl.includes(manifest.source.revision) || !circuit.sourceUrl.endsWith(circuit.sourcePath)) {
    failures.push(`${circuit.id}: sourceUrl is not pinned to revision/sourcePath`);
  }
  if (!statusIsValid(circuit.ngspice)) failures.push(`${circuit.id}: invalid ngspice expectedStatus`);
  if (!statusIsValid(circuit.spiceTs)) failures.push(`${circuit.id}: invalid spiceTs expectedStatus`);
  for (const engine of ['ngspice', 'spiceTs']) {
    if (circuit[engine]?.expectedStatus === 'fail' && !circuit[engine].reason) {
      failures.push(`${circuit.id}: ${engine} expected failure is missing a reason`);
    }
  }

  const local = resolve(repoRoot, circuit.localPath);
  let content;
  try {
    content = await readFile(local);
  } catch (error) {
    failures.push(`${circuit.id}: cannot read fixture: ${error.message}`);
    continue;
  }
  const digest = createHash('sha256').update(content).digest('hex');
  if (digest !== circuit.sha256) failures.push(`${circuit.id}: sha256 mismatch`);

  const declaredAnalyses = new Set(circuit.analyses);
  const actualAnalyses = observedAnalyses(content.toString('utf8'));
  const invalidAnalyses = [...declaredAnalyses].filter((analysis) => !supportedAnalyses.has(analysis));
  const missingAnalyses = [...actualAnalyses].filter((analysis) => !declaredAnalyses.has(analysis));
  const extraAnalyses = [...declaredAnalyses].filter((analysis) => !actualAnalyses.has(analysis));
  if (declaredAnalyses.size !== circuit.analyses.length) {
    failures.push(`${circuit.id}: analyses contains duplicates`);
  }
  if (invalidAnalyses.length) {
    failures.push(`${circuit.id}: unsupported manifest analyses: ${invalidAnalyses.join(', ')}`);
  }
  if (missingAnalyses.length || extraAnalyses.length) {
    failures.push(
      `${circuit.id}: manifest analyses [${[...declaredAnalyses].join(', ')}] do not match fixture directives [${[...actualAnalyses].join(', ')}]`,
    );
  }

  let spiceTsStatus = 'pass';
  let spiceTsDetail = '';
  try {
    parse(content.toString('utf8'));
  } catch (error) {
    spiceTsStatus = 'fail';
    spiceTsDetail = error.message;
  }
  if (spiceTsStatus !== circuit.spiceTs.expectedStatus) {
    failures.push(
      `${circuit.id}: spice-ts expected ${circuit.spiceTs.expectedStatus}, observed ${spiceTsStatus}${spiceTsDetail ? ` (${spiceTsDetail})` : ''}`,
    );
  }
  if (spiceTsStatus === 'fail') {
    spiceTsFailures.push(`${circuit.id}: ${circuit.spiceTs.reason} [${spiceTsDetail}]`);
  }

  if (ngspiceAvailable) {
    const runDir = await mkdtemp(resolve(corpusRoot, '.validate-'));
    try {
      const input = resolve(runDir, basename(local));
      const raw = resolve(runDir, 'output.raw');
      await copyFile(local, input);
      const result = spawnSync('ngspice', ['-b', '-r', basename(raw), basename(input)], {
        cwd: runDir,
        encoding: 'utf8',
        timeout: 30000,
      });
      let hasRawData = false;
      try {
        hasRawData = (await stat(raw)).size > 0;
      } catch {
        hasRawData = false;
      }
      const ngspiceStatus = !result.error && result.status === 0 && hasRawData ? 'pass' : 'fail';
      const detail = result.error?.message ??
        (result.status !== 0 ? `exit ${result.status}` : 'no raw analysis data produced');
      if (ngspiceStatus !== circuit.ngspice.expectedStatus) {
        failures.push(
          `${circuit.id}: ngspice expected ${circuit.ngspice.expectedStatus}, observed ${ngspiceStatus} (${detail})`,
        );
      }
      if (ngspiceStatus === 'fail') {
        ngspiceFailures.push(`${circuit.id}: ${circuit.ngspice.reason} [${detail}]`);
      }
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  }
}

if ((manifest.circuits?.length ?? 0) < 20) {
  failures.push(`expected at least 20 circuits, found ${manifest.circuits?.length ?? 0}`);
}
if (categoryCounts.size < 4) {
  failures.push(`expected at least 4 categories, found ${categoryCounts.size}`);
}

console.log(`Corpus: ${manifest.circuits?.length ?? 0} circuits`);
console.log(
  `Categories (${categoryCounts.size}): ${[...categoryCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, count]) => `${name}=${count}`)
    .join(', ')}`,
);
console.log(`Source: ${manifest.source?.name} @ ${manifest.source?.revision}`);
console.log(`Licence: ${manifest.source?.license}; redistribution: allowed; adaptation: none`);
console.log(`Reference simulator: ${ngspiceVersion}`);
console.log(
  `ngspice: ${(manifest.circuits?.length ?? 0) - ngspiceFailures.length} passed, ${ngspiceFailures.length} failed`,
);
console.log(
  `spice-ts parser: ${(manifest.circuits?.length ?? 0) - spiceTsFailures.length} passed, ${spiceTsFailures.length} failed`,
);
console.log('ngspice failing/unsupported cases:');
for (const line of ngspiceFailures) console.log(`  - ${line}`);
console.log('spice-ts failing/unsupported cases:');
for (const line of spiceTsFailures) console.log(`  - ${line}`);

if (failures.length) {
  console.error('Validation failures:');
  for (const line of failures) console.error(`  - ${line}`);
  process.exit(1);
}
console.log('Provenance/hash/status checks: PASS');
console.log('Validation: PASS');
