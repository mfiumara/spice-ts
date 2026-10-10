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

function containsExactString(value, target) {
  if (value === target) return true;
  if (Array.isArray(value)) return value.some((entry) => containsExactString(entry, target));
  if (value && typeof value === 'object') {
    return Object.values(value).some((entry) => containsExactString(entry, target));
  }
  return false;
}

async function readWhenReady(jobId, cursor, maxPoints) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const response = await executeTool('spice_simulation_read', { jobId, cursor, maxPoints });
    if (response.structuredContent.status !== 'running'
      || response.structuredContent.events.length > 0) return response;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('Packed simulation job did not produce events');
}

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

  const completedStart = await executeTool('spice_simulation_start', {
    request: {
      apiVersion: '1',
      input: { format: 'spice', source: 'V1 in 0 1\nR1 in 0 1k\n.op' },
    },
  });
  const completed = await readWhenReady(
    completedStart.structuredContent.jobId,
    completedStart.structuredContent.cursor,
    1,
  );
  if (completed.structuredContent.status !== 'complete'
    || completed.structuredContent.events[0].type !== 'analysis-start'
    || completed.structuredContent.events[1].type !== 'analysis-end') {
    throw new Error('Unexpected completed stream: ' + JSON.stringify(completed.structuredContent));
  }

  const transientRequest = {
    apiVersion: '1',
    input: { format: 'spice', source: 'V1 in 0 1\nR1 in out 1k\nC1 out 0 1u\n.tran 1u 3u' },
  };

  const liveStart = await executeTool('spice_simulation_start', {
    request: {
      apiVersion: '1',
      input: {
        format: 'spice',
        source: 'V1 in 0 1\nR1 in out 1k\nC1 out 0 1u\n.tran 1u 20m',
      },
    },
  });
  const liveCancelled = await executeTool('spice_simulation_cancel', {
    jobId: liveStart.structuredContent.jobId,
  });
  if (liveCancelled.structuredContent.status !== 'cancelled'
    || liveCancelled.structuredContent.terminal.partial.analyses.length !== 0) {
    throw new Error('Live packed worker was not cancelled: ' + JSON.stringify(liveCancelled.structuredContent));
  }

  const cancelledStart = await executeTool('spice_simulation_start', { request: transientRequest });
  const first = await readWhenReady(
    cancelledStart.structuredContent.jobId,
    cancelledStart.structuredContent.cursor,
    2,
  );
  const replay = await executeTool('spice_simulation_read', {
    jobId: cancelledStart.structuredContent.jobId,
    cursor: cancelledStart.structuredContent.cursor,
    maxPoints: 8,
  });
  if (JSON.stringify(first) !== JSON.stringify(replay)) throw new Error('Cursor replay changed its chunk');
  const cancelled = await executeTool('spice_simulation_cancel', {
    jobId: cancelledStart.structuredContent.jobId,
  });
  if (cancelled.structuredContent.status !== 'cancelled'
    || cancelled.structuredContent.terminal.partial.analyses[0].emittedPointCount !== 2
    || 'resultSha256' in (cancelled.structuredContent.terminal.metadata || {})) {
    throw new Error('Unexpected cancellation terminal: ' + JSON.stringify(cancelled.structuredContent));
  }

  const bounded = await executeTool('spice_simulation_read', {
    jobId: cancelledStart.structuredContent.jobId,
    cursor: first.structuredContent.nextCursor,
    maxPoints: 1025,
  });
  const malformed = await executeTool('spice_simulation_read', { jobId: 'missing' });
  if (bounded.structuredContent.error.code !== 'RESOURCE_LIMIT'
    || bounded.structuredContent.error.details.limit !== 'maxStreamChunkPoints'
    || malformed.structuredContent.error.code !== 'INVALID_REQUEST') {
    throw new Error('Stream bounds or malformed request were not structured');
  }
  if (containsExactString([completed, liveCancelled, first, cancelled, bounded, malformed], 'spice-ts')) {
    throw new Error('Internal backend name leaked from the packed stream tools');
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
