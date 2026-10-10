import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspaceRoot = resolve(packageRoot, '../..');
const consumerRoot = mkdtempSync(join(tmpdir(), 'spice-ts-mcp-consumer-'));
const packsRoot = join(consumerRoot, 'packs');
const expectedWorkflow = fileURLToPath(new URL('../examples/agent-output.json', import.meta.url));

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error([
      `${command} ${args.join(' ')} exited with status ${result.status}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'));
  }
  return result.stdout;
}

function tarballFor(packageName) {
  const normalized = packageName.replace('@', '').replace('/', '-');
  const name = readdirSync(packsRoot).find((entry) => entry.startsWith(`${normalized}-`) && entry.endsWith('.tgz'));
  if (!name) throw new Error(`Missing packed tarball for ${packageName}`);
  return join(packsRoot, name);
}

try {
  mkdirSync(packsRoot);
  for (const packageName of ['core', 'protocol', 'mcp']) {
    run('pnpm', ['pack', '--pack-destination', packsRoot], resolve(workspaceRoot, 'packages', packageName));
  }

  const coreTarball = tarballFor('@spice-ts/core');
  const protocolTarball = tarballFor('@spice-ts/protocol');
  const mcpTarball = tarballFor('@spice-ts/mcp');
  writeFileSync(join(consumerRoot, 'package.json'), `${JSON.stringify({
    private: true,
    pnpm: {
      overrides: {
        '@spice-ts/core': `file:${coreTarball}`,
        '@spice-ts/protocol': `file:${protocolTarball}`,
      },
    },
  }, null, 2)}\n`);
  writeFileSync(join(consumerRoot, 'consumer.cjs'), String.raw`
const { executeTool } = require('@spice-ts/mcp');

(async () => {
  const result = await executeTool('spice_simulate', {
    request: {
      apiVersion: '1',
      input: { format: 'spice', source: 'V1 in 0 1\nR1 in 0 1k\n.op' },
    },
  });
  if (result.isError) throw new Error(JSON.stringify(result.structuredContent));
  if (result.structuredContent.analyses[0].voltagesV.in !== 1) {
    throw new Error('Unexpected operating-point result: ' + JSON.stringify(result.structuredContent));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`);

  run('pnpm', ['add', '--ignore-workspace', '--prefer-offline', '--save-exact', mcpTarball], consumerRoot);
  if (existsSync(join(consumerRoot, 'node_modules', '@spice-ts', 'core'))) {
    throw new Error('Packed consumer unexpectedly hoisted @spice-ts/core to its root node_modules');
  }
  run('node', ['consumer.cjs'], consumerRoot);

  const packagedExample = join(consumerRoot, 'node_modules', '@spice-ts', 'mcp', 'examples', 'agent.mjs');
  if (!existsSync(packagedExample)) throw new Error('Packed MCP workflow example is missing');
  const actual = run('node', [packagedExample], consumerRoot);
  const expected = readFileSync(expectedWorkflow, 'utf8');
  if (actual !== expected) {
    throw new Error(`Packed stdio workflow output drifted.\nExpected:\n${expected}\nActual:\n${actual}`);
  }
  console.log('Packed MCP consumer and bounded stdio workflow passed.');
} finally {
  rmSync(consumerRoot, { recursive: true, force: true });
}
