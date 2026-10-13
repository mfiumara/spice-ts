import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const corpusRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(corpusRoot, '../../..');
const originalManifest = JSON.parse(await readFile(resolve(corpusRoot, 'manifest.json'), 'utf8'));
const validator = await readFile(resolve(corpusRoot, 'validate.mjs'), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// Exercise the CLI's full validation flow without network access or simulator processes.
async function validate({ mutate = () => {}, ngspice = {}, rawSize = 1, fixtureOverrides = new Map() } = {}) {
  const manifest = structuredClone(originalManifest);
  mutate(manifest);
  const copied = new Map();
  const errors = [];
  let exitCode = 0;
  const mockReadFile = async (path, encoding) => {
    if (path === resolve(corpusRoot, 'manifest.json')) return JSON.stringify(manifest);
    if (copied.has(path)) return copied.get(path);
    if (fixtureOverrides.has(path)) return fixtureOverrides.get(path);
    return readFile(path, encoding);
  };
  const mockSpawnSync = (command, args) => {
    if (command === 'ngspice') {
      if (args[0] === '--version') return { status: 0, stdout: 'ngspice-47', stderr: '' };
      return { status: 0, stdout: '', stderr: '', ...ngspice };
    }
    const circuit = manifest.circuits.find((entry) => resolve(repoRoot, entry.localPath) === args[2]);
    const bytes = fixtureBytes.get(args[2]);
    return {
      status: 0,
      stdout: JSON.stringify({
        status: circuit.spiceTs.expectedStatus,
        failureKind: circuit.spiceTs.failureKind,
        inputSha256: createHash('sha256').update(bytes).digest('hex'),
      }),
    };
  };
  const fixtureBytes = new Map(await Promise.all(manifest.circuits.map(async (circuit) => {
    const path = resolve(repoRoot, circuit.localPath);
    return [path, await mockReadFile(path)];
  })));
  const mockFetch = async (url) => {
    let path;
    if (url === manifest.source.licenseNoticeSourceUrl) path = manifest.source.licenseNoticeLocalPath;
    else if (url === manifest.source.licenseTextSourceUrl) path = manifest.source.licenseTextLocalPath;
    else path = manifest.circuits.find((circuit) => url.endsWith(`/${circuit.sourcePath}`)).localPath;
    return { ok: true, arrayBuffer: async () => mockReadFile(resolve(repoRoot, path)) };
  };
  const names = ['createHash', 'spawnSync', 'mkdtemp', 'readFile', 'rm', 'stat', 'writeFile',
    'basename', 'dirname', 'resolve', 'fileURLToPath', 'validatorUrl', 'fetch', 'console', 'process'];
  const execute = new AsyncFunction(...names, validator
    .replace(/^import .*;\n/gm, '')
    .replace(/^#!.*\n/, '')
    .replaceAll('import.meta.url', 'validatorUrl'));
  await execute(createHash, mockSpawnSync, async () => resolve(corpusRoot, '.test-run'),
    mockReadFile, async () => {}, async () => ({ size: rawSize }),
    async (path, bytes) => copied.set(path, bytes), basename, dirname, resolve, fileURLToPath,
    new URL('validate.mjs', import.meta.url).href, mockFetch,
    { log() {}, error: (message) => errors.push(message) },
    { execPath: process.execPath, exit: (code) => { exitCode = code; } });
  return { exitCode, errors: errors.join('\n') };
}

function expectNgspicePass(manifest) {
  for (const circuit of manifest.circuits) circuit.ngspice = { expectedStatus: 'pass' };
}

test('clean zero-exit ngspice with nonempty raw output passes', async () => {
  assert.deepEqual(await validate({ mutate: expectNgspicePass }), { exitCode: 0, errors: '' });
});

for (const [output, kind] of [
  ['Error: invalid command', 'execution'],
  ['  Fatal: invalid command', 'execution'],
  ['fatal error in ngspice', 'unsupported'],
  ['No circuit loaded', 'execution'],
  ['doAnalyses: simulation failed', 'execution'],
  ['run simulation(s) aborted', 'execution'],
  ['timestep too small', 'convergence'],
  ['singular matrix', 'convergence'],
  ['unknown device type', 'execution'],
]) {
  for (const stream of ['stdout', 'stderr']) {
    test(`rejects zero-exit ngspice ${stream}: ${output}`, async () => {
      const result = await validate({ mutate: expectNgspicePass, ngspice: { [stream]: `ngspice-47\n${output}\n` } });
      assert.equal(result.exitCode, 1);
      assert.match(result.errors, new RegExp(`ngspice expected pass/-, observed fail/${kind}`));
    });
  }
}

for (const ngspice of [{ status: 1 }, { status: null, error: new Error('timed out') }]) {
  test(`rejects unsuccessful ngspice process: ${ngspice.status}`, async () => {
    assert.equal((await validate({ mutate: expectNgspicePass, ngspice })).exitCode, 1);
  });
}

test('rejects an empty raw output', async () => {
  assert.equal((await validate({ mutate: expectNgspicePass, rawSize: 0 })).exitCode, 1);
});

test('rejects duplicate fixture content with distinct ids and paths', async () => {
  const original = originalManifest.circuits[0];
  const duplicate = originalManifest.circuits[1];
  const fixtureOverrides = new Map([
    [resolve(repoRoot, duplicate.localPath), await readFile(resolve(repoRoot, original.localPath))],
  ]);
  const result = await validate({ mutate: (manifest) => {
    expectNgspicePass(manifest);
    manifest.circuits[1].sha256 = manifest.circuits[0].sha256;
  }, fixtureOverrides });
  assert.equal(result.exitCode, 1);
  assert.equal(result.errors, 'Validation failures:\n  - diode-operating-point: duplicate fixture content');
});

for (const revision of ['main', 'v1.0', '1e893919', 'g'.repeat(40), '']) {
  test(`rejects unpinned source revision: ${revision}`, async () => {
    const result = await validate({ mutate: (manifest) => {
      expectNgspicePass(manifest);
      manifest.source.revision = revision;
    } });
    assert.equal(result.exitCode, 1);
    assert.match(result.errors, /source revision must be an immutable 40-character commit SHA/);
  });
}
