#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const corpusRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(corpusRoot, '../../..');
const manifest = JSON.parse(await readFile(resolve(corpusRoot, 'manifest.json'), 'utf8'));
const failures = [];
const categoryCounts = new Map();
const results = [];
const ids = new Set();
const paths = new Set();
const supportedAnalyses = new Set(['op', 'dc', 'ac', 'tran', 'noise', 'pz']);
const validFailureKinds = new Set(['parse', 'unsupported', 'convergence', 'execution']);
let simulate;

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function expectedRecordIsValid(record) {
  if (!record || !['pass', 'fail'].includes(record.expectedStatus)) return false;
  if (record.expectedStatus === 'fail') {
    return validFailureKinds.has(record.failureKind) && typeof record.reason === 'string' && record.reason.length > 0;
  }
  return record.failureKind === undefined && record.reason === undefined;
}

function observedAnalyses(text) {
  const analyses = new Set();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('*')) continue;
    const match = line.match(/^\.(op|dc|ac|tran|noise|pz)\b/i);
    if (match) analyses.add(match[1].toLowerCase());
  }
  return analyses;
}

function classifySpiceTs(error) {
  const message = String(error?.message ?? error);
  if (/timestep|converg|singular/i.test(message)) return 'convergence';
  if (error?.name === 'ParseError') return /unsupported/i.test(message) ? 'unsupported' : 'parse';
  if (/unknown function|unsupported/i.test(message)) return 'unsupported';
  return 'execution';
}

function classifyNgspice(output) {
  if (/timestep too small|converg|singular matrix/i.test(output)) return 'convergence';
  if (/tstep is invalid|not supported|unimplemented dot command|unknown parameter|unsupported/i.test(output)) {
    return 'unsupported';
  }
  return 'execution';
}

async function fetchBytes(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'spice-ts-corpus-validator/1.0' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

try {
  ({ simulate } = await import(pathToFileURL(resolve(repoRoot, 'packages/core/dist/index.js'))));
} catch (error) {
  console.error('ERROR: packages/core/dist is unavailable; run pnpm build first.');
  console.error(error.message);
  process.exit(1);
}

const versionResult = spawnSync('ngspice', ['--version'], { encoding: 'utf8' });
const ngspiceAvailable = !versionResult.error && versionResult.status === 0;
const ngspiceVersion = ngspiceAvailable
  ? `${versionResult.stdout}\n${versionResult.stderr}`
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => /ngspice/i.test(line)) ?? 'ngspice (version line unavailable)'
  : versionResult.error?.message ?? `ngspice --version exited ${versionResult.status}`;
if (!ngspiceAvailable) failures.push(`ngspice unavailable: ${ngspiceVersion}`);

const requiredSourceFields = [
  'name',
  'repository',
  'revision',
  'license',
  'licenseUrl',
  'licenseNoticeSourceUrl',
  'licenseNoticeLocalPath',
  'licenseNoticeSha256',
  'licenseTextUrl',
  'licenseTextLocalPath',
  'licenseTextSha256',
  'redistributionDecision',
  'mechanicalAdaptation',
];
for (const field of requiredSourceFields) {
  if (manifest.source?.[field] === undefined || manifest.source[field] === '') {
    failures.push(`source metadata missing: ${field}`);
  }
}
if (manifest.circuits?.length !== 20) {
  failures.push(`expected exactly 20 circuits, found ${manifest.circuits?.length ?? 0}`);
}

for (const [label, localField, hashField, sourceUrlField] of [
  ['license notice', 'licenseNoticeLocalPath', 'licenseNoticeSha256', 'licenseNoticeSourceUrl'],
  ['license text', 'licenseTextLocalPath', 'licenseTextSha256', 'licenseTextUrl'],
]) {
  try {
    const local = await readFile(resolve(repoRoot, manifest.source[localField]));
    if (sha256(local) !== manifest.source[hashField]) failures.push(`${label}: local sha256 mismatch`);
    const upstream = await fetchBytes(manifest.source[sourceUrlField]);
    if (!upstream.equals(local)) failures.push(`${label}: fetched bytes differ from local bytes`);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
  }
}

for (const circuit of manifest.circuits ?? []) {
  const requiredFields = ['id', 'category', 'analyses', 'sourcePath', 'localPath', 'sha256', 'ngspice', 'spiceTs'];
  const missing = requiredFields.filter((field) => circuit[field] === undefined || circuit[field] === '');
  if (missing.length) {
    failures.push(`${circuit.id ?? '<unknown>'}: missing fields: ${missing.join(', ')}`);
    continue;
  }
  if (ids.has(circuit.id)) failures.push(`${circuit.id}: duplicate id`);
  if (paths.has(circuit.localPath)) failures.push(`${circuit.id}: duplicate localPath`);
  ids.add(circuit.id);
  paths.add(circuit.localPath);
  categoryCounts.set(circuit.category, (categoryCounts.get(circuit.category) ?? 0) + 1);

  if (!circuit.localPath.startsWith('benchmarks/corpus/xyce/fixtures/')) {
    failures.push(`${circuit.id}: localPath escapes the Xyce fixture boundary`);
  }
  if (!circuit.sourcePath.startsWith('Netlists/') || !circuit.sourcePath.endsWith('.cir')) {
    failures.push(`${circuit.id}: invalid sourcePath`);
  }
  if (!expectedRecordIsValid(circuit.ngspice)) failures.push(`${circuit.id}: invalid ngspice expectation`);
  if (!expectedRecordIsValid(circuit.spiceTs)) failures.push(`${circuit.id}: invalid spice-ts expectation`);

  const declaredAnalyses = new Set(circuit.analyses);
  if (declaredAnalyses.size !== circuit.analyses.length) failures.push(`${circuit.id}: duplicate analysis`);
  for (const analysis of declaredAnalyses) {
    if (!supportedAnalyses.has(analysis)) failures.push(`${circuit.id}: invalid analysis ${analysis}`);
  }

  let content;
  try {
    content = await readFile(resolve(repoRoot, circuit.localPath));
  } catch (error) {
    failures.push(`${circuit.id}: cannot read fixture: ${error.message}`);
    continue;
  }
  const digest = sha256(content);
  if (digest !== circuit.sha256) failures.push(`${circuit.id}: local sha256 mismatch`);
  const text = content.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(content)) failures.push(`${circuit.id}: fixture is not lossless UTF-8`);

  const actualAnalyses = observedAnalyses(text);
  if (
    actualAnalyses.size !== declaredAnalyses.size ||
    [...actualAnalyses].some((analysis) => !declaredAnalyses.has(analysis))
  ) {
    failures.push(
      `${circuit.id}: analyses [${[...declaredAnalyses].join(', ')}] differ from fixture [${[...actualAnalyses].join(', ')}]`,
    );
  }

  const sourceUrl = `https://raw.githubusercontent.com/Xyce/Xyce_Regression/${manifest.source.revision}/${circuit.sourcePath}`;
  try {
    const upstream = await fetchBytes(sourceUrl);
    if (sha256(upstream) !== circuit.sha256) failures.push(`${circuit.id}: fetched sha256 mismatch`);
    if (!upstream.equals(content)) failures.push(`${circuit.id}: fetched bytes differ from fixture bytes`);
  } catch (error) {
    failures.push(`${circuit.id}: source fetch failed: ${error.message}`);
  }

  let spiceTsStatus = 'pass';
  let spiceTsFailureKind;
  try {
    await simulate(text);
  } catch (error) {
    spiceTsStatus = 'fail';
    spiceTsFailureKind = classifySpiceTs(error);
  }
  if (
    spiceTsStatus !== circuit.spiceTs.expectedStatus ||
    (spiceTsStatus === 'fail' && spiceTsFailureKind !== circuit.spiceTs.failureKind)
  ) {
    failures.push(
      `${circuit.id}: spice-ts expected ${circuit.spiceTs.expectedStatus}/${circuit.spiceTs.failureKind ?? '-'}, observed ${spiceTsStatus}/${spiceTsFailureKind ?? '-'}`,
    );
  }

  let ngspiceStatus = 'fail';
  let ngspiceFailureKind = 'execution';
  if (ngspiceAvailable) {
    const runDir = await mkdtemp(resolve(corpusRoot, '.validate-'));
    try {
      const inputPath = resolve(runDir, basename(circuit.localPath));
      const rawPath = resolve(runDir, 'output.raw');
      await writeFile(inputPath, content);
      const copied = await readFile(inputPath);
      if (!copied.equals(content)) failures.push(`${circuit.id}: ngspice input bytes changed`);
      const result = spawnSync('ngspice', ['-b', '-r', basename(rawPath), basename(inputPath)], {
        cwd: runDir,
        encoding: 'utf8',
        timeout: 30_000,
      });
      let hasRawData = false;
      try {
        hasRawData = (await stat(rawPath)).size > 0;
      } catch {
        hasRawData = false;
      }
      ngspiceStatus = !result.error && result.status === 0 && hasRawData ? 'pass' : 'fail';
      if (ngspiceStatus === 'fail') {
        ngspiceFailureKind = classifyNgspice(
          `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.error?.message ?? ''}`,
        );
      }
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  }
  if (
    ngspiceAvailable &&
    (ngspiceStatus !== circuit.ngspice.expectedStatus ||
      (ngspiceStatus === 'fail' && ngspiceFailureKind !== circuit.ngspice.failureKind))
  ) {
    failures.push(
      `${circuit.id}: ngspice expected ${circuit.ngspice.expectedStatus}/${circuit.ngspice.failureKind ?? '-'}, observed ${ngspiceStatus}/${ngspiceFailureKind ?? '-'}`,
    );
  }

  results.push({
    id: circuit.id,
    ngspice: ngspiceStatus === 'pass' ? 'pass' : `fail/${ngspiceFailureKind}`,
    ngspiceReason: ngspiceStatus === 'fail' ? circuit.ngspice.reason : undefined,
    spiceTs: spiceTsStatus === 'pass' ? 'pass' : `fail/${spiceTsFailureKind}`,
    spiceTsReason: spiceTsStatus === 'fail' ? circuit.spiceTs.reason : undefined,
  });
}

if (categoryCounts.size < 4) failures.push(`expected at least 4 categories, found ${categoryCounts.size}`);

const ngspicePassed = results.filter((result) => result.ngspice === 'pass').length;
const spiceTsPassed = results.filter((result) => result.spiceTs === 'pass').length;
console.log(`Corpus: ${results.length} circuits`);
console.log(
  `Categories (${categoryCounts.size}): ${[...categoryCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, count]) => `${name}=${count}`)
    .join(', ')}`,
);
console.log(`Source: ${manifest.source.name} @ ${manifest.source.revision}`);
console.log(`Licence: ${manifest.source.license}; redistribution: allowed; adaptation: none`);
console.log(`Reference simulator: ${ngspiceVersion}`);
console.log(`Fetched source matches: ${results.length}/20 fixtures plus notice and licence text`);
console.log(`ngspice: ${ngspicePassed} passed, ${results.length - ngspicePassed} failed`);
console.log(`spice-ts: ${spiceTsPassed} passed, ${results.length - spiceTsPassed} failed`);
console.log('Per-circuit results:');
for (const result of results) {
  console.log(`  - ${result.id}: ngspice=${result.ngspice}${result.ngspiceReason ? ` (${result.ngspiceReason})` : ''}`);
  console.log(`    spice-ts=${result.spiceTs}${result.spiceTsReason ? ` (${result.spiceTsReason})` : ''}`);
}

if (failures.length) {
  console.error('Validation failures:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('Provenance/hash/identical-input/status checks: PASS');
console.log('Validation: PASS');
