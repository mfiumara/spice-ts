#!/usr/bin/env node
/** Fresh-process OP comparison. No warmups, rotated engine order, identical decks.
 * node benchmarks/performance/op-interleaved.mjs OUT.json baseline=/path/index.js before=/path/index.js after=/path/index.js
 * Preserve the complete before dist directory, not just its entry (ESM chunks).
 * Core timings include dynamic import, parse precheck, simulate and OP mapping;
 * ngspice timings include launch and ASCII raw parsing. Node launch is excluded.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, cpus } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resistorMeshOp } from './scaling-m2-fixture.mjs';

const script = fileURLToPath(import.meta.url);
const hash = text => createHash('sha256').update(text).digest('hex');
if (process.argv[2] === '--worker') {
  const text = readFileSync(process.argv[4], 'utf8');
  const started = performance.now();
  const core = await import(pathToFileURL(process.argv[3]).href);
  const imported = performance.now();
  core.parse(text); // same precheck as the release adapter
  const prechecked = performance.now();
  const result = await core.simulate(text);
  const values = [...result.dc.voltages, ...result.dc.currents];
  const probe = result.dc.voltage(process.argv[5]);
  const serialized = JSON.stringify(values);
  const finished = performance.now();
  console.log(JSON.stringify({ ms: finished - started, importMs: imported - started,
    precheckMs: prechecked - imported, simulationAndMappingMs: finished - prechecked,
    probe, resultHash: hash(serialized) }));
} else {
  const output = process.argv[2];
  const modules = process.argv.slice(3).map(arg => {
    const split = arg.indexOf('=');
    if (split < 1) throw new Error('expected label=/absolute/path/to/core/index.js');
    return { label: arg.slice(0, split), entry: resolve(arg.slice(split + 1)) };
  });
  if (!output || modules.length < 2 || new Set(modules.map(m => m.label)).size !== modules.length
    || modules.some(m => m.label === 'ngspice')) throw new Error('OUT.json and >=2 uniquely labelled modules required');
  const fixture = resistorMeshOp(1000);
  // Exactly the deck used by the release scaling comparison (including .save).
  const deck = fixture.netlist.replace(/\.end\s*$/, `.save v(${fixture.probe})\n.end\n`);
  const directory = mkdtempSync(join(tmpdir(), 'spice-op-interleaved-'));
  const deckPath = join(directory, 'mesh.cir');
  writeFileSync(deckPath, deck);
  const samples = [];
  const engines = [...modules, { label: 'ngspice' }];
  const run = (command, args, options = {}) => {
    const child = spawnSync(command, args, { encoding: 'utf8', timeout: 120000, ...options });
    if (child.error || child.status !== 0) throw new Error(`${command}: ${child.error ?? child.stderr}`);
    return child.stdout;
  };
  try {
    for (let round = 0; round < 7; round++) {
      const order = [...engines.slice(round % engines.length), ...engines.slice(0, round % engines.length)];
      for (const engine of order) {
        let sample;
        if (engine.label === 'ngspice') {
          const rawPath = join(directory, 'op.raw');
          const started = performance.now();
          run('ngspice', ['-b', '-r', rawPath, deckPath], {
            cwd: directory, env: { ...process.env, SPICE_ASCIIRAWFILE: '1' },
          });
          const raw = readFileSync(rawPath, 'utf8');
          const match = /Values:\s*0\s+([-+\d.eE]+)/.exec(raw);
          if (!match) throw new Error('missing ngspice OP probe');
          sample = { ms: performance.now() - started, probe: Number(match[1]) };
        } else {
          sample = JSON.parse(run(process.execPath, [script, '--worker', engine.entry, deckPath, fixture.probe]));
        }
        if (!Number.isFinite(sample.probe)) throw new Error('nonfinite OP probe');
        samples.push({ round, engine: engine.label, ...sample });
      }
    }
    const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const summary = engines.map(({ label }) => {
      const rows = samples.filter(s => s.engine === label);
      const references = samples.filter(s => s.engine === 'ngspice');
      const maxProbeError = Math.max(...rows.map((s, i) => Math.abs(s.probe - references[i].probe)));
      if (rows.length !== 7 || maxProbeError > 1e-10) throw new Error(`${label}: OP probe mismatch`);
      return { engine: label, samples: rows.length, medianMs: median(rows.map(s => s.ms)),
        maxProbeError, resultHashes: [...new Set(rows.map(s => s.resultHash).filter(Boolean))] };
    });
    const report = { node: process.version, cpu: cpus()[0].model,
      ngspice: run('ngspice', ['--version']).trim(), netlistSha256: hash(deck), modules,
      summary, samples };
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
