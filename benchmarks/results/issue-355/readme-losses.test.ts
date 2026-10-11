import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const readme = readFileSync(new URL('./README.md', import.meta.url), 'utf8');
const report = JSON.parse(readFileSync(new URL('./report.json', import.meta.url), 'utf8')) as {
  artifactSizesBytes: { delta: Record<string, number> };
  commands: Record<string, string>;
};
const wasmScripts = (
  JSON.parse(readFileSync(new URL('../../../packages/wasm/package.json', import.meta.url), 'utf8')) as {
    scripts: Record<string, string>;
  }
).scripts;

test('the README reports every committed artifact size loss', () => {
  const artifactLabels: Record<string, string> = {
    workerJs: 'worker.js',
    indexJs: 'index.js',
    denseSolverWasm: 'dense-solver.wasm',
  };

  for (const [artifact, delta] of Object.entries(report.artifactSizesBytes.delta)) {
    assert.ok(readme.includes(`\`${artifactLabels[artifact]}\` grew ${delta} bytes`));
  }
});

test('every receipt command names an existing @spice-ts/wasm script', () => {
  for (const command of Object.values(report.commands)) {
    const script = /^pnpm --filter @spice-ts\/wasm (\S+)$/.exec(command)?.[1];
    if (script) assert.ok(script in wasmScripts, `missing @spice-ts/wasm script '${script}'`);
  }
});
