import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const script = 'benchmarks/reference/build-xyce-serial.sh';
test('Linux source recipe rejects relative roots before fetching', () => {
  const run = spawnSync('bash', [script, 'relative-root'], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /Build root must be absolute/);
});
test('Linux source recipe rejects invalid job counts before fetching', () => {
  for (const jobs of ['0', '-1', 'two', '1; false']) {
    const run = spawnSync('bash', [script, '/unused-build-root'], { env: { ...process.env, JOBS: jobs }, encoding: 'utf8' });
    assert.equal(run.status, 2);
    assert.match(run.stderr, /JOBS must be a positive integer/);
  }
});
test('recipe uses SuiteSparse 7 installed headers; Dockerfile supplies lexer headers', () => {
  assert.match(readFileSync(script, 'utf8'), /AMD_INCLUDE_DIRS="\$prefix\/include\/suitesparse"/);
  assert.match(readFileSync('benchmarks/reference/Dockerfile.xyce', 'utf8'), /xyce-packages\.lock/);
  assert.match(readFileSync('benchmarks/reference/linux-build/packages.lock', 'utf8'), /libfl-dev:arm64=2\.6\.4-8\.2build1/);
});

test('saved Linux/Mac evidence recomputes all 22 fixture metrics offline', () => {
  const run = spawnSync(process.execPath, ['--import', 'tsx', 'benchmarks/reference/cross-check-linux.ts', '--verify'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Verified 22 receipts/);
});
