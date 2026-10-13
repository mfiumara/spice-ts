// Fixed budget: 27 cold/warm controls + 3 captures + 9 isolated profile children.
// Invoke via spice-heavy. Each child <=45s, total scheduling budget <=900s.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, appendFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { m2Netlist, M2_CIRCUITS } from '../../scaling-m2-fixture.mjs';
const out = resolve('benchmarks/performance/results/issue-919');
for (const dir of ['logs', 'profiles']) mkdirSync(`${out}/${dir}`, { recursive: true });
const command = (bin, args) => { const r = spawnSync(bin, args, { encoding: 'utf8' }); if (r.status !== 0) throw new Error(`${bin} failed`); return r.stdout.trim(); };
writeFileSync(`${out}/host.json`, JSON.stringify({ revision: command('git', ['rev-parse', 'HEAD']), date: new Date().toISOString(), node: process.version, ngspice: command('ngspice', ['--version']), os: command('uname', ['-srv']), cpu: command('sysctl', ['-n', 'machdep.cpu.brand_string']), ramBytes: command('sysctl', ['-n', 'hw.memsize']), load: command('uptime', []), childTimeoutMs: 45000, schedulingBudgetMs: 900000, maxChildren: 39 }, null, 2));
writeFileSync(`${out}/samples.jsonl`, '');
const start = performance.now();
let count = 0;
function run(mode, circuit, size, repeat) {
  if (performance.now() - start > 900000 || count >= 39) throw new Error('experiment budget exhausted');
  count++;
  const key = `${mode}-${circuit}-${size}${repeat === undefined ? '' : `-r${repeat}`}`;
  const prefix = `${out}/${mode === 'simulate' ? 'logs' : 'profiles'}/${mode === 'isolate' ? `capture-${circuit}-${size}-r${repeat}` : key}`;
  writeFileSync(`${prefix}.jsonl`, '');
  const argv = [process.execPath, ...(mode === 'isolate' ? ['--trace-opt', '--trace-deopt'] : []), `${out}/worker.mjs`, mode, circuit, String(size), prefix];
  const before = performance.now();
  // Kill the actual Node child, not an outer time process, at the deadline.
  const child = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8', timeout: 45000, killSignal: 'SIGKILL', maxBuffer: 128 * 1024 * 1024 });
  writeFileSync(`${out}/logs/${key}.stdout.gz`, gzipSync(child.stdout ?? ''));
  writeFileSync(`${out}/logs/${key}.stderr.txt`, child.stderr ?? '');
  const samples = readFileSync(`${prefix}.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const matrix = `${prefix}.matrix.gz`;
  const peakRss = samples.flatMap(s => s.endMemory ? [s.endMemory.peakRssMiB] : []);
  const row = { mode, circuit, size, repeat, actualNodes: m2Netlist(circuit, size).actualNodes, netlistSha256: createHash('sha256').update(m2Netlist(circuit, size).netlist).digest('hex'), argv, status: child.error?.code === 'ETIMEDOUT' ? 'timeout' : child.status === 0 ? 'ok' : 'failed', exit: child.status, signal: child.signal, error: child.error?.message, wallMs: performance.now() - before, peakRssMiB: peakRss.length ? Math.max(...peakRss) : null, samples, ...(existsSync(matrix) ? { captureBytes: readFileSync(matrix).length, captureSha256: createHash('sha256').update(readFileSync(matrix)).digest('hex') } : {}) };
  appendFileSync(`${out}/samples.jsonl`, JSON.stringify(row) + '\n');
  console.log(`${count}/39 ${key} ${row.status} ${row.wallMs.toFixed(1)}ms ${samples.map(s => `${s.phase}=${(s.ms ?? s.factorMs ?? 0).toFixed(1)}`).join(' ')}`);
  if (row.status === 'failed') throw new Error(`child failed: ${key}`);
}
// Interleave size/circuit order, reverse each round. No optimization A/B exists.
const cases = M2_CIRCUITS.flatMap(c => [1000, 10000, 50000].map(s => [c, s]));
for (let r = 0; r < 3; r++) for (const [c, s] of (r % 2 ? [...cases].reverse() : cases)) run('simulate', c, s, r);
for (const size of [1000, 10000, 50000]) run('capture', 'resistor-mesh-op', size);
for (let r = 0; r < 3; r++) for (const size of (r % 2 ? [50000, 10000, 1000] : [1000, 10000, 50000])) run('isolate', 'resistor-mesh-op', size, r);
