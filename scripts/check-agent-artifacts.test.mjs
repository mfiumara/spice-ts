import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('./check-agent-artifacts.mjs', import.meta.url));

function repository(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'spice-artifact-test-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Artifact test');
  git('config', 'user.email', 'artifact-test@example.invalid');
  const add = (name) => {
    mkdirSync(join(cwd, name, '..'), { recursive: true });
    writeFileSync(join(cwd, name), 'receipt\n');
    git('add', '--', name);
  };
  add('historical.log');
  add('POTETO.md');
  git('commit', '-qm', 'Historical receipts');
  const base = git('rev-parse', 'HEAD');
  const check = (...args) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
  return { git, add, check, base };
}

test('preserves historical tracked receipts and allows ordinary additions', (t) => {
  const { add, check, base } = repository(t);
  add('README.md');
  const result = check('--base', base);
  assert.equal(result.status, 0, result.stderr);
});

test('rejects staged logs and nested POTETO notes, including spaces', (t) => {
  const { add, check, base } = repository(t);
  const names = ['nested/agent output.log', 'nested/SUBSET-POTETO.md'];
  names.forEach(add);
  const result = check('--base', base);
  assert.equal(result.status, 1);
  names.forEach((name) => assert.ok(result.stderr.includes(name), result.stderr));
});

test('rejects committed additions and renamed ordinary files', (t) => {
  const { git, add, check, base } = repository(t);
  add('notes.md');
  add('committed.log');
  git('commit', '-qm', 'Notes');
  git('mv', 'notes.md', 'new-POTETO.md');
  git('commit', '-qm', 'Rename notes');
  const result = check('--base', base);
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('committed.log'));
  assert.ok(result.stderr.includes('new-POTETO.md'));
});

test('permits modification and removal of grandfathered evidence', (t) => {
  const { git, check, base } = repository(t);
  writeFileSync(join(git('rev-parse', '--show-toplevel'), 'historical.log'), 'updated receipt\n');
  git('add', 'historical.log');
  git('rm', 'POTETO.md');
  assert.equal(check('--base', base).status, 0);
});

test('checks the staged index when no remote main exists', (t) => {
  const { add, check } = repository(t);
  add('new.log');
  assert.equal(check().status, 1);
});

test('invalid base fails closed', (t) => {
  const { check } = repository(t);
  assert.notEqual(check('--base', 'missing-ref').status, 0);
});
