import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runControlReference } from '../corpus/corpus-f/control-vectors.js';
import { unpackExecution } from '../corpus/corpus-f/packed.js';
import { packedControlReference } from './packed-control.js';

test('packed retained-plot wrapper preserves every value and explicit secondary coordinate', { skip: process.env.AUDIT_NATIVE_TEST !== '1' }, async () => {
  const input = Buffer.from('authored wrapper parity test\nV1 in 0 0\nV2 outer 0 0\nR1 in 0 1k\nR2 outer 0 1k\n.control\ndc V1 0 1 .5 V2 0 1 1\ndc V1 0 2 1\n.endc\n.end\n');
  const circuit = { analyses: ['dc'] as const, unmappedAnalyses: [] };
  const original = (await runControlReference(input, { ...circuit, analyses: [...circuit.analyses] })).execution;
  const packed = unpackExecution(await packedControlReference(input, { ...circuit, analyses: [...circuit.analyses] }));
  assert.equal(original.status, 'success');
  assert.equal(original.analyses.length, 2);
  assert.deepEqual(packed, original);
});
