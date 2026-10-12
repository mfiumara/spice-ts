#!/usr/bin/env node
/**
 * Issue #669: paired A/B timing of two spice-ts builds plus ngspice-47 (KLU)
 * on the byte-identical issue #426 scaling decks (scaling-m2-fixture.mjs).
 *
 *   node benchmarks/performance/results/issue-669/ab-669.mjs \
 *     --base=<repo root of build A> --head=<repo root of build B> \
 *     [--rounds=7] [--circuits=rc-ladder-tran,resistor-mesh-op] [--sizes=1000,10000,50000] \
 *     [--output=benchmarks/performance/results/issue-669/ab.json]
 *
 * Each round runs one fresh child process per arm, in an order that rotates
 * every round, so slow drift in host load hits every arm alike. A spice-ts
 * child does one warmup and three measured simulate(netlist) calls and keeps
 * their median; an ngspice sample is one fresh `ngspice -b` with
 * `option klu` in a per-run .spiceinit (the deck itself is never edited).
 * Both builds must agree bit for bit on the probe waveform; any mismatch
 * aborts. The JSON keeps every raw sample.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
const arg = (name, fallback) => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

async function child(root, circuit, nodes) {
  const { simulate } = await import(pathToFileURL(join(root, 'packages/core/dist/index.js')).href);
  const { m2Netlist } = await import(pathToFileURL(join(root, 'benchmarks/performance/scaling-m2-fixture.mjs')).href);
  const { netlist, probe } = m2Netlist(circuit, nodes);
  const times = [];
  let digest = '';
  for (let run = 0; run < 4; run++) {
    const started = performance.now();
    const result = await simulate(netlist);
    const elapsed = performance.now() - started;
    if (run > 0) times.push(elapsed);
    const wave = result.transient ? result.transient.voltage(probe) : [result.dc.voltage(probe)];
    digest = createHash('sha256').update(new Uint8Array(Float64Array.from(wave).buffer)).digest('hex');
  }
  times.sort((a, b) => a - b);
  process.stdout.write(JSON.stringify({ ms: times[1], runs: times, digest }));
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function ngspiceSample(circuit, nodes, fixture) {
  const { m2Netlist } = await import(pathToFileURL(fixture).href);
  const dir = mkdtempSync(join(tmpdir(), 'ab669-'));
  try {
    writeFileSync(join(dir, 'deck.cir'), m2Netlist(circuit, nodes).netlist);
    writeFileSync(join(dir, '.spiceinit'), 'option klu\n');
    const started = performance.now();
    const run = spawnSync('ngspice', ['-b', 'deck.cir'], { cwd: dir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    const ms = performance.now() - started;
    const out = `${run.stdout}\n${run.stderr}`;
    if (run.status !== 0) throw new Error(`ngspice exited ${run.status}`);
    if (!/Using KLU as Direct Linear Solver/i.test(out)) throw new Error('ngspice did not report KLU');
    return { ms };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const base = resolve(arg('base'));
  const head = resolve(arg('head'));
  const rounds = Number(arg('rounds', '7'));
  const circuits = arg('circuits', 'rc-ladder-tran,resistor-mesh-op').split(',');
  const sizes = arg('sizes', '1000,10000,50000').split(',').map(Number);
  const output = resolve(arg('output', 'benchmarks/performance/results/issue-669/ab.json'));
  const fixture = join(head, 'benchmarks/performance/scaling-m2-fixture.mjs');
  const arms = ['base', 'head', 'ngspice'];
  const rows = [];
  for (const circuit of circuits) {
    for (const nodes of sizes) {
      const samples = { base: [], head: [], ngspice: [] };
      const digests = new Set();
      for (let round = 0; round < rounds; round++) {
        for (let i = 0; i < arms.length; i++) {
          const arm = arms[(i + round) % arms.length];
          if (arm === 'ngspice') {
            samples.ngspice.push((await ngspiceSample(circuit, nodes, fixture)).ms);
            continue;
          }
          const root = arm === 'base' ? base : head;
          const run = spawnSync(process.execPath, [scriptPath, '--child', root, circuit, String(nodes)], {
            encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
          });
          if (run.status !== 0) throw new Error(`${arm} child failed: ${run.stderr.slice(-2000)}`);
          const sample = JSON.parse(run.stdout);
          samples[arm].push(sample.ms);
          digests.add(sample.digest);
        }
      }
      if (digests.size !== 1) throw new Error(`${circuit} ${nodes}: base and head probe waveforms differ`);
      const ratios = samples.base.map((b, i) => b / samples.head[i]);
      const row = {
        circuit, nodes, probeDigest: [...digests][0], samplesMs: samples,
        medianMs: { base: median(samples.base), head: median(samples.head), ngspice: median(samples.ngspice) },
        medianPairedSpeedup: median(ratios),
      };
      row.headVsNgspice = row.medianMs.head / row.medianMs.ngspice;
      row.baseVsNgspice = row.medianMs.base / row.medianMs.ngspice;
      rows.push(row);
      process.stderr.write(`${circuit} ${nodes}: base ${row.medianMs.base.toFixed(1)} ms, head ${row.medianMs.head.toFixed(1)} ms, `
        + `ngspice ${row.medianMs.ngspice.toFixed(1)} ms, paired speedup ${row.medianPairedSpeedup.toFixed(2)}x, `
        + `head/ngspice ${row.headVsNgspice.toFixed(2)}x\n`);
    }
  }
  const git = (root) => spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const ngspiceVersion = (spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).stdout.match(/ngspice-\d+/) ?? ['unknown'])[0];
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    command: `node benchmarks/performance/results/issue-669/ab-669.mjs --base=<${git(base)}> --head=<${git(head)}> --rounds=${rounds} --circuits=${circuits.join(',')} --sizes=${sizes.join(',')}`,
    baseSha: git(base), headSha: git(head), node: process.version, ngspice: ngspiceVersion,
    methodology: 'rotating-order rounds; spice-ts sample = median of 3 simulate(netlist) after 1 warmup in a fresh process (parse+compile+analysis); ngspice sample = wall time of one fresh `ngspice -b` with option klu (includes process start and parse)',
    rows,
  }, null, 2)}\n`);
  process.stderr.write(`wrote ${output}\n`);
}

if (args[0] === '--child') await child(args[1], args[2], Number(args[3]));
else await main();
