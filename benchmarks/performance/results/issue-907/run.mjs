// Fixed budget: 9 allocation/CPU samples, 8 raw-reference checks; run under spice-heavy.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { m2Netlist } from '../../scaling-m2-fixture.mjs';
import { binaryProbe, errors } from './metrics.mjs';
const out = resolve('benchmarks/performance/results/issue-907');
const warm = process.argv.includes('--warm-mesh');
const journal = `${out}/${warm ? 'warm-samples' : 'samples'}.jsonl`;
for (const dir of ['decks', 'logs', 'profiles', 'references']) mkdirSync(`${out}/${dir}`, { recursive: true });
const command = (bin, args) => spawnSync(bin, args, { encoding: 'utf8' }).stdout.trim();
writeFileSync(`${out}/${warm ? 'warm-host' : 'host'}.json`, JSON.stringify({ revision: command('git', ['rev-parse', 'HEAD']), date: new Date().toISOString(), node: process.version, ngspice: command('ngspice', ['--version']), os: command('uname', ['-srv']), cpu: command('sysctl', ['-n', 'machdep.cpu.brand_string']), ramBytes: command('sysctl', ['-n', 'hw.memsize']), load: command('uptime', []), timeoutMs: 45000, samplingInterval: 32768, warmups: warm ? 1 : 0 }, null, 2));
writeFileSync(`${out}/decks/.spiceinit`, 'option klu\n');
writeFileSync(journal, '');
function run(engine, circuit, size) {
  const { netlist, probe, actualNodes } = m2Netlist(circuit, size);
  const key = `${circuit}-${size}${warm ? '-warm' : ''}`, deck = `${out}/decks/${key}.cir`, prefix = `${out}/profiles/${key}`;
  writeFileSync(deck, netlist);
  const raw = `${out}/decks/${key}.raw`;
  const argv = engine === 'spice-ts' ? [process.execPath, '--trace-gc', '--trace-opt', '--trace-deopt', `${out}/worker.mjs`, deck, probe, prefix, ...(warm ? ['--warm'] : [])] : ['ngspice', '-b', '-r', raw, deck];
  const start = performance.now();
  const child = spawnSync('/usr/bin/time', ['-l', ...argv], { cwd: `${out}/decks`, encoding: 'utf8', timeout: 45000, maxBuffer: 128 * 1024 * 1024 });
  const row = { engine, circuit, size, actualNodes, probe, argv, netlistSha256: createHash('sha256').update(netlist).digest('hex'), wallMs: performance.now() - start, exit: child.status, signal: child.signal, status: child.error?.code === 'ETIMEDOUT' ? 'timeout' : child.status === 0 ? 'ok' : 'failed', error: child.error?.message };
  writeFileSync(`${out}/logs/${engine}-${key}.stdout.gz`, gzipSync(child.stdout ?? ''));
  writeFileSync(`${out}/logs/${engine}-${key}.stderr.txt`, child.stderr ?? '');
  if (row.status === 'ok') {
    if (engine === 'spice-ts') Object.assign(row, JSON.parse(readFileSync(`${prefix}.result.json`, 'utf8')));
    else {
      if (!/Using KLU/.test(child.stdout)) throw new Error('missing KLU');
      const bytes = readFileSync(raw);
      Object.assign(row, binaryProbe(bytes, probe));
      row.rawSha256 = createHash('sha256').update(bytes).digest('hex');
      row.rawBytes = bytes.length;
      row.ms = Number(child.stdout.match(/Total analysis time \(seconds\)\s*=\s*([\d.eE+-]+)/)?.[1]) * 1000;
      row.peakRssMiB = Number(child.stderr.match(/(\d+)\s+maximum resident set size/)?.[1]) / 1024 / 1024;
      writeFileSync(`${out}/references/${key}.json`, JSON.stringify(row, null, 2));
      unlinkSync(raw);
    }
  }
  appendFileSync(journal, JSON.stringify(row) + '\n');
  console.log(`${engine} ${key}: ${row.status} simulate/analysis ${row.ms}ms wall ${row.wallMs}ms`);
  return row;
}
// Mesh first, then controls. Alternate engine order by size; raw mode is NOT a timing A/B.
if (warm) run('spice-ts', 'resistor-mesh-op', 50000);
else for (const circuit of ['resistor-mesh-op', 'rc-ladder-tran', 'cmos-inverter-chain-tran']) for (const size of [50000, 10000, 1000]) {
  if (circuit.startsWith('cmos') && size === 50000) { run('spice-ts', circuit, size); continue; }
  const engines = size === 10000 ? ['ngspice', 'spice-ts'] : ['spice-ts', 'ngspice'];
  const pair = Object.fromEntries(engines.map(engine => [engine, run(engine, circuit, size)]));
  if (engines.every(engine => pair[engine].status === 'ok')) console.log(JSON.stringify({ circuit, size, errors: errors(pair['spice-ts'], pair.ngspice) }));
}
