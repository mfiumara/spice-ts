#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const corpusRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(corpusRoot, '../../..');
const manifest = JSON.parse(await readFile(resolve(corpusRoot, 'manifest.json'), 'utf8'));
const spiceTsRunner = resolve(corpusRoot, 'run-spice-ts.mjs');
const failures = [];
const results = [];
const categoryOrder = ['op-dc', 'ac', 'tran', 'nonlinear', 'convergence'];
const categoryCounts = new Map(categoryOrder.map((category) => [category, 0]));
const validAnalyses = new Set(['op', 'dc', 'ac', 'tran', 'pz', 'pss']);
const validFailureKinds = new Set(['parse', 'unsupported', 'convergence', 'execution']);
const ids = new Set();
const paths = new Set();

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function expectedRecordIsValid(record) {
  if (!record || !['pass', 'fail'].includes(record.expectedStatus)) return false;
  if (record.expectedStatus === 'pass') {
    return record.failureKind === undefined && record.reason === undefined;
  }
  return (
    validFailureKinds.has(record.failureKind) &&
    typeof record.reason === 'string' &&
    record.reason.length > 0
  );
}

function observedAnalyses(text) {
  const analyses = new Set();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('*')) continue;
    const match = line.match(/^\.(op|dc|ac|tran|pz|pss)\b/i);
    if (match) analyses.add(match[1].toLowerCase());
  }
  return analyses;
}

function classifyNgspice(output) {
  if (/timestep too small|converg|singular matrix/i.test(output)) return 'convergence';
  if (
    /undefined parameter|unknown subckt|not supported|unsupported|unimplemented|unknown parameter|fatal error in ngspice/i.test(
      output,
    )
  ) {
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

function compareObserved(id, engine, expected, observed) {
  if (
    expected.expectedStatus !== observed.status ||
    (observed.status === 'fail' && expected.failureKind !== observed.failureKind)
  ) {
    failures.push(
      `${id}: ${engine} expected ${expected.expectedStatus}/${expected.failureKind ?? '-'}, observed ${observed.status}/${observed.failureKind ?? '-'}`,
    );
  }
}

const ngspiceVersionResult = spawnSync('ngspice', ['--version'], { encoding: 'utf8' });
const ngspiceAvailable = !ngspiceVersionResult.error && ngspiceVersionResult.status === 0;
const ngspiceVersion = ngspiceAvailable
  ? `${ngspiceVersionResult.stdout}\n${ngspiceVersionResult.stderr}`
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => /ngspice/i.test(line)) ?? 'ngspice (version line unavailable)'
  : ngspiceVersionResult.error?.message ?? `ngspice --version exited ${ngspiceVersionResult.status}`;
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
  'licenseTextSourceUrl',
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

for (const [label, localField, hashField, sourceField] of [
  ['licence notice', 'licenseNoticeLocalPath', 'licenseNoticeSha256', 'licenseNoticeSourceUrl'],
  ['licence text', 'licenseTextLocalPath', 'licenseTextSha256', 'licenseTextSourceUrl'],
]) {
  try {
    const localBytes = await readFile(resolve(repoRoot, manifest.source[localField]));
    if (sha256(localBytes) !== manifest.source[hashField]) {
      failures.push(`${label}: local sha256 mismatch`);
    }
    const fetchedBytes = await fetchBytes(manifest.source[sourceField]);
    if (!fetchedBytes.equals(localBytes)) failures.push(`${label}: fetched bytes differ from local bytes`);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
  }
}

for (const circuit of manifest.circuits ?? []) {
  const requiredFields = [
    'id',
    'category',
    'analyses',
    'sourcePath',
    'localPath',
    'sha256',
    'ngspice',
    'spiceTs',
  ];
  const missing = requiredFields.filter(
    (field) => circuit[field] === undefined || circuit[field] === '',
  );
  if (missing.length) {
    failures.push(`${circuit.id ?? '<unknown>'}: missing fields: ${missing.join(', ')}`);
    continue;
  }
  if (ids.has(circuit.id)) failures.push(`${circuit.id}: duplicate id`);
  if (paths.has(circuit.localPath)) failures.push(`${circuit.id}: duplicate localPath`);
  ids.add(circuit.id);
  paths.add(circuit.localPath);

  if (!categoryCounts.has(circuit.category)) {
    failures.push(`${circuit.id}: invalid category ${circuit.category}`);
  } else {
    categoryCounts.set(circuit.category, categoryCounts.get(circuit.category) + 1);
  }
  if (!circuit.localPath.startsWith('benchmarks/corpus/corpus-d/fixtures/')) {
    failures.push(`${circuit.id}: localPath escapes the corpus-d fixture boundary`);
  }
  if (!circuit.sourcePath.startsWith('tests/') || !circuit.sourcePath.endsWith('.ckt')) {
    failures.push(`${circuit.id}: invalid sourcePath`);
  }
  if (!expectedRecordIsValid(circuit.ngspice)) failures.push(`${circuit.id}: invalid ngspice expectation`);
  if (!expectedRecordIsValid(circuit.spiceTs)) failures.push(`${circuit.id}: invalid spice-ts expectation`);

  if (!Array.isArray(circuit.analyses) || circuit.analyses.length === 0) {
    failures.push(`${circuit.id}: analyses must be a non-empty array`);
  }
  const declaredAnalyses = new Set(circuit.analyses);
  if (declaredAnalyses.size !== circuit.analyses.length) failures.push(`${circuit.id}: duplicate analysis`);
  for (const analysis of declaredAnalyses) {
    if (!validAnalyses.has(analysis)) failures.push(`${circuit.id}: invalid analysis ${analysis}`);
  }
  if (
    (circuit.category === 'op-dc' && ![...declaredAnalyses].some((name) => name === 'op' || name === 'dc')) ||
    (circuit.category === 'ac' && !declaredAnalyses.has('ac')) ||
    (['tran', 'nonlinear', 'convergence'].includes(circuit.category) && !declaredAnalyses.has('tran'))
  ) {
    failures.push(`${circuit.id}: category ${circuit.category} contradicts declared analyses`);
  }

  let bytes;
  const localPath = resolve(repoRoot, circuit.localPath);
  try {
    bytes = await readFile(localPath);
  } catch (error) {
    failures.push(`${circuit.id}: cannot read fixture: ${error.message}`);
    continue;
  }
  const localHash = sha256(bytes);
  if (localHash !== circuit.sha256) failures.push(`${circuit.id}: local sha256 mismatch`);
  if (!Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes)) {
    failures.push(`${circuit.id}: fixture is not lossless UTF-8`);
  }

  const actualAnalyses = observedAnalyses(bytes.toString('utf8'));
  if (
    actualAnalyses.size !== declaredAnalyses.size ||
    [...actualAnalyses].some((analysis) => !declaredAnalyses.has(analysis))
  ) {
    failures.push(
      `${circuit.id}: analyses [${[...declaredAnalyses].join(', ')}] differ from fixture [${[...actualAnalyses].join(', ')}]`,
    );
  }

  const sourceUrl = `https://raw.githubusercontent.com/ahkab/ahkab/${manifest.source.revision}/${circuit.sourcePath}`;
  try {
    const fetchedBytes = await fetchBytes(sourceUrl);
    if (sha256(fetchedBytes) !== circuit.sha256) failures.push(`${circuit.id}: fetched sha256 mismatch`);
    if (!fetchedBytes.equals(bytes)) failures.push(`${circuit.id}: fetched bytes differ from fixture bytes`);
  } catch (error) {
    failures.push(`${circuit.id}: source fetch failed: ${error.message}`);
  }

  let spiceTsObserved = { status: 'fail', failureKind: 'execution' };
  const spiceTsResult = spawnSync(process.execPath, [spiceTsRunner, repoRoot, localPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (spiceTsResult.error) {
    failures.push(`${circuit.id}: spice-ts runner failed: ${spiceTsResult.error.message}`);
  } else {
    try {
      spiceTsObserved = JSON.parse(spiceTsResult.stdout.trim());
      if (spiceTsObserved.inputSha256 !== localHash) {
        failures.push(`${circuit.id}: spice-ts input bytes changed`);
      }
    } catch (error) {
      failures.push(`${circuit.id}: invalid spice-ts runner output: ${error.message}`);
    }
  }
  compareObserved(circuit.id, 'spice-ts', circuit.spiceTs, spiceTsObserved);

  let ngspiceObserved = { status: 'fail', failureKind: 'execution' };
  if (ngspiceAvailable) {
    const runDir = await mkdtemp(resolve(corpusRoot, '.validate-'));
    try {
      const inputPath = resolve(runDir, basename(circuit.localPath));
      const rawPath = resolve(runDir, 'output.raw');
      await writeFile(inputPath, bytes);
      const copiedBytes = await readFile(inputPath);
      if (!copiedBytes.equals(bytes)) failures.push(`${circuit.id}: ngspice input bytes changed`);
      const result = spawnSync('ngspice', ['-b', '-r', basename(rawPath), basename(inputPath)], {
        cwd: runDir,
        encoding: 'utf8',
        timeout: 30_000,
      });
      let rawSize = 0;
      try {
        rawSize = (await stat(rawPath)).size;
      } catch {
        rawSize = 0;
      }
      if (!result.error && result.status === 0 && rawSize > 0) {
        ngspiceObserved = { status: 'pass' };
      } else {
        const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.error?.message ?? ''}`;
        ngspiceObserved = { status: 'fail', failureKind: classifyNgspice(output) };
      }
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
    compareObserved(circuit.id, 'ngspice', circuit.ngspice, ngspiceObserved);
  }

  results.push({
    id: circuit.id,
    category: circuit.category,
    sha256: localHash,
    ngspice: ngspiceObserved,
    spiceTs: spiceTsObserved,
    ngspiceReason: circuit.ngspice.reason,
    spiceTsReason: circuit.spiceTs.reason,
  });
}

for (const category of categoryOrder) {
  if (categoryCounts.get(category) !== 4) {
    failures.push(`expected category ${category}=4, found ${categoryCounts.get(category)}`);
  }
}

const ngspicePassed = results.filter((result) => result.ngspice.status === 'pass').length;
const spiceTsPassed = results.filter((result) => result.spiceTs.status === 'pass').length;
const validationReceipt = {
  sourceRevision: manifest.source.revision,
  categories: Object.fromEntries(categoryOrder.map((category) => [category, categoryCounts.get(category)])),
  fixtures: results.map((result) => ({
    id: result.id,
    sha256: result.sha256,
    ngspice: `${result.ngspice.status}/${result.ngspice.failureKind ?? '-'}`,
    spiceTs: `${result.spiceTs.status}/${result.spiceTs.failureKind ?? '-'}`,
  })),
};
const deterministicValidationHash = sha256(Buffer.from(JSON.stringify(validationReceipt)));

console.log(`Corpus: ${results.length} circuits`);
console.log(`Categories: ${categoryOrder.map((name) => `${name}=${categoryCounts.get(name)}`).join(', ')}`);
console.log(`Source: ${manifest.source.name} @ ${manifest.source.revision}`);
console.log(`Licence: ${manifest.source.license}; redistribution: allowed; adaptation: none`);
console.log(`Reference simulator: ${ngspiceVersion}`);
console.log(`Fetched source matches: ${results.length}/20 fixtures plus notice and licence text`);
console.log(`ngspice: ${ngspicePassed} passed, ${results.length - ngspicePassed} failed`);
console.log(`spice-ts: ${spiceTsPassed} passed, ${results.length - spiceTsPassed} failed`);
console.log(`Deterministic validation SHA-256: ${deterministicValidationHash}`);
console.log('Per-circuit results:');
for (const result of results) {
  console.log(
    `  - ${result.id}: ngspice=${result.ngspice.status}/${result.ngspice.failureKind ?? '-'}${result.ngspiceReason ? ` (${result.ngspiceReason})` : ''}`,
  );
  console.log(
    `    spice-ts=${result.spiceTs.status}/${result.spiceTs.failureKind ?? '-'}${result.spiceTsReason ? ` (${result.spiceTsReason})` : ''}`,
  );
}

if (failures.length) {
  console.error('Validation failures:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('Provenance/hash/identical-input/status checks: PASS');
console.log('Validation: PASS');
