// Receipts: one JSONL row per process, including failures/timeouts and exact argv.
// Run from repo root under spice-heavy. Fixed matrix, no fixture modifications.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { M2_CIRCUITS, m2Netlist } from '../../scaling-m2-fixture.mjs';
const out = resolve('benchmarks/performance/results/issue-902');
const retry = process.argv.includes('--retry-mesh');
for (const dir of ['decks', 'logs', 'profiles']) mkdirSync(`${out}/${dir}`, { recursive: true });
const command = (bin, args) => spawnSync(bin, args, { encoding: 'utf8' }).stdout.trim();
writeFileSync(`${out}/${retry ? 'retry-host' : 'host'}.json`, JSON.stringify({
  revision: command('git', ['rev-parse', 'HEAD']), date: new Date().toISOString(), node: process.version,
  pnpm: command('pnpm', ['--version']), ngspice: command('ngspice', ['--version']),
  os: command('uname', ['-srv']), cpu: command('sysctl', ['-n', 'machdep.cpu.brand_string']),
  ramBytes: command('sysctl', ['-n', 'hw.memsize']), cpus: command('sysctl', ['-n', 'hw.logicalcpu']),
  load: command('uptime', []), timeoutMs: 45000, repeats: 3, warmups: 0,
}, null, 2));
const journal = `${out}/samples.jsonl`;
if (!retry) writeFileSync(journal, '');
// ngspice picks up this local file from cwd; identical deck bytes in both engines.
writeFileSync(`${out}/decks/.spiceinit`, 'option klu\n');
function sample(engine, circuit, size, repeat, profile = false) {
  const { netlist, probe, actualNodes } = m2Netlist(circuit, size);
  const key = `${circuit}-${size}`;
  const deck = `${out}/decks/${key}.cir`;
  writeFileSync(deck, netlist);
  const profilePath = `${out}/profiles/${key}.cpuprofile`;
  const argv = engine === 'ngspice' ? ['ngspice', '-b', deck] : [process.execPath, `${out}/worker.mjs`, circuit, String(size), deck, ...(profile ? [profilePath] : [])];
  const start = performance.now();
  const child = spawnSync('/usr/bin/time', ['-l', ...argv], { cwd: `${out}/decks`, encoding: 'utf8', timeout: 45000, maxBuffer: 128 * 1024 * 1024 });
  const wallMs = performance.now() - start;
  const log = `${engine}-${key}-${profile ? 'profile' : repeat}${retry ? '-retry' : ''}`;
  writeFileSync(`${out}/logs/${log}.stdout.txt.gz`, gzipSync(child.stdout ?? ''));
  writeFileSync(`${out}/logs/${log}.stderr.txt`, child.stderr ?? '');
  const row = { engine, circuit, size, actualNodes, repeat, profile, retry, argv, cwd: 'decks', netlistSha256: createHash('sha256').update(netlist).digest('hex'), wallMs,
    exit: child.status, signal: child.signal, status: child.error?.code === 'ETIMEDOUT' ? 'timeout' : child.status === 0 ? 'ok' : 'failed',
    error: child.error?.message, peakRssMiB: Number(child.stderr?.match(/(\d+)\s+maximum resident set size/)?.[1]) / 1024 / 1024 };
  if (row.status === 'ok') {
    if (engine === 'spice-ts') Object.assign(row, JSON.parse(child.stdout));
    else {
      const text = child.stdout;
      if (!/Using KLU/.test(text)) throw new Error('ngspice did not select KLU');
      row.ms = Number(text.match(/Total analysis time \(seconds\)\s*=\s*([\d.eE+-]+)/)?.[1]) * 1000;
      row.loadMs = Number(text.match(/Netlist loading time\s*=\s*([\d.eE+-]+)/)?.[1]) * 1000;
      if (circuit.endsWith('-tran')) {
        const rows = [...text.matchAll(/^\d+\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s*$/gm)];
        row.grid = rows.map(r => Number(r[1])); row.values = rows.map(r => Number(r[2]));
      } else {
        row.grid = [0]; row.values = [Number(text.match(new RegExp(`^\\s*${probe}\\s+([-+\\d.eE]+)\\s*$`, 'mi'))?.[1])];
      }
      if (!Number.isFinite(row.ms) || !row.values.length || row.values.some(v => !Number.isFinite(v))) throw new Error('missing ngspice measurements');
    }
  }
  appendFileSync(journal, JSON.stringify(row) + '\n');
  console.log(`${engine} ${key} ${profile ? 'profile' : repeat}: ${row.status} ${row.ms?.toFixed(1)} ms, wall ${wallMs.toFixed(1)} ms`);
}
for (const circuit of retry ? ['resistor-mesh-op'] : M2_CIRCUITS) for (const size of retry ? [50000] : [1000, 10000, 50000]) {
  for (let repeat = 0; repeat < 3; repeat++) {
    for (const engine of repeat % 2 ? ['ngspice', 'spice-ts'] : ['spice-ts', 'ngspice']) sample(engine, circuit, size, repeat);
  }
}
if (!retry) for (const circuit of M2_CIRCUITS) sample('spice-ts', circuit, 50000, 0, true);
