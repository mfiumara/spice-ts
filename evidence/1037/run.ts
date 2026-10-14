// Bounded #1037 experiment. No device/timestep/tolerance changes are installed.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { createTransientSim } from '../../packages/core/src/analysis/transient-driver.js';
import { BJT } from '../../packages/core/src/devices/bjt.js';
import type { CompiledCircuit } from '../../packages/core/src/circuit.js';
import type { StampContext } from '../../packages/core/src/devices/device.js';
import { alignAndMeasure, parseNgspiceRaw, type SampleSeries } from '../../benchmarks/comparison-harness.js';

const here = resolve('evidence/1037');
const root = resolve(here, '../..');
const out = resolve(here, 'local');
mkdirSync(out, { recursive: true });
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const test = readFileSync(resolve(root, 'packages/core/src/analysis/transient-bjt-rest-1037.test.ts'), 'utf8');
const rest = test.match(/const REST = `([\s\S]*?)`;/)![1];
writeFileSync(resolve(out, 'rest.cir'), rest);
const manifest = JSON.parse(readFileSync(resolve(root, 'benchmarks/corpus/ngspice-bugs/manifest.json'), 'utf8'));
const ticket = manifest.tickets.find((item: { ticket: number }) => item.ticket === 764);
const fetched = resolve(root, 'benchmarks/corpus/ngspice-bugs/fetched/764');
for (const attachment of ticket.attachments) assert.equal(hash(readFileSync(resolve(fetched, attachment.name))), attachment.sha256);
for (const name of ['Originalnetlist', 'InductorSplit']) {
  const text = readFileSync(resolve(fetched, `${name}.cir`), 'utf8').replace(/\r\n/g, '\n')
    .replace(/"D:[^"\n]*[\\/]([^"\\/\n]+)"/gi, '$1');
  const pin = ticket.uncommittedDecks.find((item: { name: string }) => item.name === `${name}.local.cir`);
  assert.equal(hash(text), pin.sha256);
  writeFileSync(resolve(fetched, pin.name), text);
}

// Named candidate: aggregate each BJT's DC and charge stamp contributions
// before adding them to the global matrix/RHS. Same equations and checks.
// This tests one assembly-rounding hypothesis, not centered Newton solving.
function aggregate(bjt: BJT): void {
  const stamp = bjt.stamp.bind(bjt);
  const dynamic = bjt.stampTransientCharge.bind(bjt);
  let matrix = new Map<string, { row: number; col: number; value: number }>();
  let rhs = new Map<number, number>();
  const buffered = (ctx: StampContext): StampContext => ({
    ...ctx,
    getVoltage: ctx.getVoltage.bind(ctx), getCurrent: ctx.getCurrent.bind(ctx), stampC: ctx.stampC.bind(ctx),
    stampG(row, col, value) {
      const key = `${row},${col}`;
      const entry = matrix.get(key);
      if (entry) entry.value += value;
      else matrix.set(key, { row, col, value });
    },
    stampB(row, value) { rhs.set(row, (rhs.get(row) ?? 0) + value); },
  });
  bjt.stamp = ctx => {
    // Accepted history restamps must remain static. They have no subsequent
    // charge-companion load to flush this buffer.
    if (!(bjt as unknown as { inTransientNewton: boolean }).inTransientNewton) return stamp(ctx);
    matrix = new Map(); rhs = new Map();
    stamp(buffered(ctx));
  };
  bjt.stampTransientCharge = (ctx, integration) => {
    dynamic(buffered(ctx), integration);
    for (const { row, col, value } of matrix.values()) ctx.stampG(row, col, value);
    for (const [row, value] of rhs) ctx.stampB(row, value);
  };
}

async function own(text: string, path: string, candidate: boolean) {
  const start = performance.now();
  const sim = await createTransientSim(text, { resolveInclude: async name => readFileSync(resolve(dirname(path), name), 'utf8') });
  if (candidate) {
    const compiled = (sim as unknown as { compiled: CompiledCircuit }).compiled;
    for (const device of compiled.devices) if (device instanceof BJT) aggregate(device);
  }
  const series: SampleSeries = { grid: [], signals: {} };
  let status = 'success';
  let errorCode: string | null = null;
  try {
    while (!sim.isDone) {
      const point = sim.advance();
      series.grid.push(point.time);
      for (const [name, value] of point.voltages) (series.signals[`v(${name.toLowerCase()})`] ??= []).push({ re: value, im: 0 });
    }
  } catch (error) {
    status = 'failed'; errorCode = error instanceof Error ? error.name : 'unknown';
  }
  const receipt = { status, errorCode, time: sim.simTime, points: series.grid.length, convergence: sim.convergence, runtimeMs: performance.now() - start };
  sim.dispose();
  return { receipt, series };
}

const decks = [
  { id: 'rest', path: resolve(out, 'rest.cir'), signals: ['v(c)'] },
  { id: 'schmitt', path: resolve(root, 'benchmarks/corpus/ngspice/fixtures/tests/general/schmitt.cir'), signals: ['v(1)', 'v(3)', 'v(5)', 'v(6)'] },
  { id: 'relay', path: resolve(root, 'benchmarks/corpus/corpus-h/fixtures/spicesharpparser/circuits/cookbook/pure-spice/bjt-relay-driver/bjt-relay-driver.cir'), signals: ['v(base)', 'v(collector)'] },
  ...ticket.uncommittedDecks.map((deck: { name: string }) => ({ id: basename(deck.name, '.local.cir'), path: resolve(fetched, deck.name), signals: [] as string[] })),
];
async function main(): Promise<void> {
const rows = [];
for (const deck of decks) {
  const bytes = readFileSync(deck.path);
  const before = await own(bytes.toString('utf8'), deck.path, false);
  const candidate = await own(bytes.toString('utf8'), deck.path, true);
  const rawPath = resolve(out, `${deck.id}.raw`);
  const command = ['-n', '-b', '-r', rawPath, deck.path];
  const start = performance.now();
  const native = spawnSync('ngspice', command, { cwd: dirname(deck.path), encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, SPICE_ASCIIRAWFILE: '1' } });
  const runtimeMs = performance.now() - start;
  writeFileSync(resolve(out, `${deck.id}.stdout`), native.stdout ?? '');
  writeFileSync(resolve(out, `${deck.id}.stderr`), native.stderr ?? '');
  // Parse only completed references. Interrupted vendor rawfiles are not oracles.
  const reference = native.status === 0 ? parseNgspiceRaw(readFileSync(rawPath, 'utf8')).find(plot => /transient/i.test(plot.plotName)) : undefined;
  const measure = (run: typeof before) => reference && run.receipt.status === 'success' ? alignAndMeasure(run.series, reference, deck.signals) : null;
  const row = { id: deck.id, path: deck.path.replace(root + '/', ''), sha256: hash(bytes), before: before.receipt, candidate: candidate.receipt, ngspice: { status: native.status === 0 ? 'success' : (native.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT' ? 'timeout' : 'failed', exitCode: native.status, signal: native.signal, runtimeMs, points: reference?.grid.length ?? null, time: reference?.grid.at(-1) ?? null, diagnosticSha256: hash((native.stdout ?? '') + (native.stderr ?? '')), command: ['ngspice', ...command.map(part => part.replace(root + '/', ''))] }, beforeMetrics: measure(before), candidateMetrics: measure(candidate) };
  rows.push(row);
  writeFileSync(resolve(here, 'receipt.json'), JSON.stringify({ base: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), environment: { node: process.version, arch: process.arch, platform: process.platform, cpu: cpus()[0]?.model, ngspice: execFileSync('ngspice', ['--version'], { encoding: 'utf8' }).trim() }, candidate: 'BJT-local DC/charge stamp aggregation; experimental only', attachments: ticket.attachments.map((item: { name: string; sha256: string }) => ({ name: item.name, sha256: item.sha256 })), rows }, null, 2) + '\n');
  console.log(deck.id, before.receipt.status, candidate.receipt.status, row.ngspice.status);
}
}
main().catch(error => { console.error(error); process.exitCode = 1; });
