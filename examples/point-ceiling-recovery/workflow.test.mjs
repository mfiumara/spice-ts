import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packedConsumer = fileURLToPath(new URL('./packed-consumer.mjs', import.meta.url));
const expected = readFileSync(new URL('./expected-output.json', import.meta.url), 'utf8');

test('recovers from a deterministic point ceiling as a packed consumer', () => {
  const output = execFileSync(process.execPath, [packedConsumer], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    encoding: 'utf8',
    timeout: 120_000,
  });

  assert.equal(output, expected);
});
