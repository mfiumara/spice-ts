import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const coreRoot = resolve(packageRoot, '../core');
const protocolRoot = resolve(packageRoot, '../protocol');
const consumerRoot = mkdtempSync(join(tmpdir(), 'spice-ts-wasm-consumer-'));
const packsRoot = join(consumerRoot, 'packs');

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status}`);
  }
}

try {
  mkdirSync(packsRoot);
  for (const root of [coreRoot, protocolRoot, packageRoot]) {
    run('pnpm', ['pack', '--pack-destination', packsRoot], root);
  }
  const tarballs = readdirSync(packsRoot)
    .filter((name) => name.endsWith('.tgz'))
    .map((name) => join(packsRoot, name));
  if (tarballs.length !== 3) throw new Error(`Expected three package tarballs, found ${tarballs.length}`);
  const coreTarball = tarballs.find(path => basename(path).startsWith('spice-ts-core-'));
  const protocolTarball = tarballs.find(path => basename(path).startsWith('spice-ts-protocol-'));
  const wasmTarball = tarballs.find(path => basename(path).startsWith('spice-ts-wasm-'));
  if (!coreTarball || !protocolTarball || !wasmTarball) throw new Error('Packed dependency set is incomplete');

  writeFileSync(join(consumerRoot, 'package.json'), `${JSON.stringify({
    private: true,
    type: 'module',
    dependencies: {
      '@spice-ts/core': `file:${coreTarball}`,
      '@spice-ts/protocol': `file:${protocolTarball}`,
      '@spice-ts/wasm': `file:${wasmTarball}`,
      ajv: '8.20.0',
    },
    pnpm: {
      overrides: {
        '@spice-ts/core': `file:${coreTarball}`,
        '@spice-ts/protocol': `file:${protocolTarball}`,
      },
    },
  }, null, 2)}\n`);
  run('pnpm', ['install', '--ignore-workspace', '--prefer-offline'], consumerRoot);
  writeFileSync(join(consumerRoot, 'consume.mjs'), `
    import { createSpiceEngine } from '@spice-ts/wasm';
    const engine = await createSpiceEngine({ backend: 'spice-ts-wasm' });
    const result = await engine.simulate({
      apiVersion: '1',
      input: { format: 'spice', source: 'V1 in 0 12\\nR1 in out 2k\\nR2 out 0 1k\\n.op' },
    }, { requestId: 'packed-wasm' });
    await engine.close();
    const analysis = result.ok ? result.data.analyses[0] : undefined;
    if (!result.ok || result.metadata.backend !== 'spice-ts-wasm'
      || analysis?.type !== 'op' || analysis.voltagesV.out !== 4) {
      throw new Error(JSON.stringify(result));
    }
  `);
  run('node', ['consume.mjs'], consumerRoot);
  console.log('Packed bounded WebAssembly consumer passed.');
} finally {
  rmSync(consumerRoot, { recursive: true, force: true });
}
