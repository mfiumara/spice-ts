import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packedConsumer = fileURLToPath(new URL('./packed-consumer.mjs', import.meta.url));

test('runs the circuit-json threshold-cancellation workflow as a packed consumer', () => {
  const output = execFileSync(process.execPath, [packedConsumer], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    encoding: 'utf8',
    timeout: 120_000,
  });

  assert.equal(output, 'Packed circuit-json threshold-cancellation workflow passed.\n');
});
