import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const coreRoot = resolve(packageRoot, '../core');
const consumerRoot = mkdtempSync(join(tmpdir(), 'spice-ts-circuit-json-consumer-'));
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
  run('pnpm', ['pack', '--pack-destination', packsRoot], coreRoot);
  run('pnpm', ['pack', '--pack-destination', packsRoot], packageRoot);

  const tarballs = readdirSync(packsRoot)
    .filter((name) => name.endsWith('.tgz'))
    .map((name) => join(packsRoot, name));
  if (tarballs.length !== 2) {
    throw new Error(`Expected two package tarballs, found ${tarballs.length}`);
  }

  writeFileSync(join(consumerRoot, 'package.json'), `${JSON.stringify({
    private: true,
    type: 'module',
  }, null, 2)}\n`);
  writeFileSync(join(consumerRoot, 'tsconfig.json'), `${JSON.stringify({
    compilerOptions: {
      strict: true,
      skipLibCheck: false,
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      target: 'ES2022',
      noEmit: true,
    },
    include: ['index.ts'],
  }, null, 2)}\n`);
  writeFileSync(
    join(consumerRoot, 'index.ts'),
    'import type { CircuitJSON } from "@spice-ts/circuit-json";\n\nconst circuit = {} as CircuitJSON;\nvoid circuit;\n',
  );

  run(
    'pnpm',
    ['add', '--ignore-workspace', '--prefer-offline', '--save-exact', 'typescript@5.9.3', ...tarballs],
    consumerRoot,
  );
  run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], consumerRoot);
  console.log('Packed strict TypeScript consumer compiled successfully.');
} finally {
  rmSync(consumerRoot, { recursive: true, force: true });
}