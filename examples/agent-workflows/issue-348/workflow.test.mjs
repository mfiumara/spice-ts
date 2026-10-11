import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packedConsumer = fileURLToPath(new URL('./packed-consumer.mjs', import.meta.url));
const expected = readFileSync(new URL('./expected-output.json', import.meta.url), 'utf8');

// Hang guard only (see #411/#424): the workflow has no wall-clock deadline, so a
// loaded CI runner makes it slower, never wrong. It covers packing three
// packages, installing them in an external project and running the workflow.
const HANG_GUARD_MS = 300_000;

test('repairs and resumes a multi-analysis request as a packed consumer', { timeout: HANG_GUARD_MS }, () => {
  const output = execFileSync(process.execPath, [packedConsumer], {
    cwd: fileURLToPath(new URL('../../..', import.meta.url)),
    encoding: 'utf8',
    timeout: HANG_GUARD_MS,
  });

  assert.equal(output, expected);
});
