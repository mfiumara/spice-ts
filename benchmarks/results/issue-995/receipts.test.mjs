import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const directory = new URL('./', import.meta.url);
const receipts = JSON.parse(readFileSync(new URL('receipts.json', directory), 'utf8'));

test('receipt provenance matches the unchanged corpus fixture', () => {
  assert.equal(receipts.schemaVersion, 1);
  const fixture = readFileSync(new URL('../../corpus/corpus-k/fixtures/xyce/Netlists/CircuitSim90/MOS2/gm6.cir', directory));
  assert.equal(createHash('sha256').update(fixture).digest('hex'), receipts.provenance.fixtureSha256);
  for (const receipt of [...receipts.temperatureProbes, ...Object.values(receipts.tests).filter(value => typeof value === 'object')]) {
    assert.match(receipt.sourceSha256, /^[a-f0-9]{64}$/);
  }
});

test('native temperature observations and diagnostic errors remain explicit', () => {
  const [device125, plain125, plain27] = receipts.temperatureProbes;
  assert.deepEqual(receipts.temperatureProbes.map(probe => probe.name), ['device125', 'plain125', 'plain27']);
  assert.deepEqual(device125.opVoltageV, plain125.opVoltageV);
  for (const probe of receipts.temperatureProbes) {
    assert.deepEqual(probe.deviceTemperatureC, { mp2: probe.temperatureC, mn3: probe.temperatureC });
    assert.equal(probe.nominalTemperatureC, 27);
    assert.equal(probe.ngspiceExitCode, null);
    assert.deepEqual(probe.diagnosticErrors, ['no such function as {v,', 'or {v(2) is not available.']);
  }
  assert.deepEqual(device125.dataRows, [1, 1, 223]);
  assert.deepEqual(plain27.dataRows, [1, 1, 224]);
  assert.equal(device125.temperatureC, 125);
  assert.equal(plain27.temperatureC, 27);
  assert.equal(device125.opVoltageV['13'], -1.34346452429970e-16);
  assert.equal(plain27.opVoltageV['13'], -6.29999768170984e-6);
});

test('historical RED and GREEN counts are preserved, not recast as a fresh run', () => {
  const { red, green } = receipts.tests;
  assert.equal(receipts.kind, 'historical-scalar-receipts');
  assert.equal(red.testsFailed, 12);
  assert.equal(red.testsPassed, 24);
  assert.equal(red.testsTotal, red.testsFailed + red.testsPassed);
  assert.equal(red.directDeviceLawTestsPassed, 18);
  assert.equal(red.failureClass, 'UnsupportedTemperatureError');
  assert.deepEqual(red.failureTemperaturesC, [50, 125]);
  assert.equal(green.testsPassed, 123);
  assert.equal(green.testsFailed, 0);
  assert.equal(green.filesPassed, green.files.length);
  assert.equal(green.testsPassed, green.files.reduce((total, file) => total + file.testsPassed, 0));
});

test('receipt directory contains no raw log replacements', () => {
  assert.deepEqual(readdirSync(directory).filter(file => file.endsWith('.log')), []);
});
