#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const corpusRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(corpusRoot, '../../..');
const manifest = JSON.parse(await readFile(resolve(corpusRoot, 'manifest.json'), 'utf8'));
const requiredSourceFields = [
  'repository',
  'revision',
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
  'spiceTs',
];
const categories = new Map();
const failures = [];
const unsupported = [];
const ngspiceFailures = [];
let parse;

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
if (missingSource.length) {
  failures.push(`source metadata missing: ${missingSource.join(', ')}`);
}

for (const circuit of manifest.circuits) {
  const missing = requiredCircuitFields.filter(
    (field) => circuit[field] === undefined || circuit[field] === '',
  );
  if (missing.length) {
    failures.push(`${circuit.id ?? '<unknown>'}: missing provenance fields: ${missing.join(', ')}`);
    continue;
  }
  categories.set(circuit.category, (categories.get(circuit.category) ?? 0) + 1);
  const local = resolve(repoRoot, circuit.localPath);
  const content = await readFile(local);
  const digest = createHash('sha256').update(content).digest('hex');
  if (digest !== circuit.sha256) failures.push(`${circuit.id}: sha256 mismatch`);

  try {
    parse(content.toString('utf8'));
    if (circuit.spiceTs.status === 'unsupported') {
      unsupported.push(
        `${circuit.id}: support gained (catalogue still marks unsupported: ${circuit.spiceTs.reason})`,
      );
    }
  } catch (error) {
    if (circuit.spiceTs.status === 'parse-eligible') {
      failures.push(`${circuit.id}: spice-ts parse failed: ${error.message}`);
    } else {
      unsupported.push(`${circuit.id}: ${circuit.spiceTs.reason} [${error.message}]`);
    }
  }

  const runDir = await mkdtemp(resolve(tmpdir(), 'spice-ts-ngspice-'));
  try {
    const input = resolve(runDir, basename(local));
    await copyFile(local, input);
    const result = spawnSync('ngspice', ['-b', basename(input)], {
      cwd: runDir,
      stdio: 'ignore',
      timeout: 30000,
    });
    if (result.error || result.status !== 0) {
      const detail = result.error?.message ?? `exit ${result.status}`;
      ngspiceFailures.push(`${circuit.id}: ${detail}`);
    }
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
}

for (const category of ['op-dc', 'ac', 'tran', 'nonlinear', 'convergence']) {
  if (!categories.has(category)) failures.push(`category has no fixtures: ${category}`);
}
if (manifest.circuits.length < 20) {
  failures.push(`expected at least 20 circuits, found ${manifest.circuits.length}`);
}

const provenanceFailures = failures.filter(
  (line) => line.includes('metadata') || line.includes('provenance') || line.includes('sha256'),
);
console.log(`Corpus: ${manifest.circuits.length} circuits`);
console.log(
  `Categories: ${[...categories.entries()].map(([name, count]) => `${name}=${count}`).join(', ')}`,
);
console.log(`Provenance/hash checks: ${provenanceFailures.length ? 'FAIL' : 'PASS'}`);
console.log(`ngspice: ${manifest.circuits.length - ngspiceFailures.length} passed, ${ngspiceFailures.length} failed`);
console.log(
  `spice-ts parser: ${manifest.circuits.filter((circuit) => circuit.spiceTs.status === 'parse-eligible').length} eligible, ${unsupported.length} unsupported/reclassified`,
);
console.log('Unsupported/reclassified cases:');
for (const line of unsupported) console.log(`  - ${line}`);
console.log('ngspice failures:');
for (const line of ngspiceFailures) console.log(`  - ${line}`);
for (const line of ngspiceFailures) failures.push(`ngspice: ${line}`);
if (failures.length) {
  console.error('Validation failures:');
  for (const line of failures) console.error(`  - ${line}`);
  process.exit(1);
}
console.log('Validation: PASS');
