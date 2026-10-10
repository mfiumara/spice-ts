#!/usr/bin/env node
// Print a compact table from ab-summary.json, microbench.json, cold-start.json.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = name => JSON.parse(readFileSync(join(here, name), 'utf8'));
const ab = read('ab-summary.json');
const f = x => x.toFixed(3);
console.log('round nodes | before ms | after ms | before/after | ngspice internal ms (before run, after run) | RSS MiB before/after');
for (const [round, entry] of Object.entries(ab.rounds)) {
  for (const nodes of Object.keys(entry.before.scaling)) {
    const b = entry.before.scaling[nodes];
    const a = entry.after.scaling[nodes];
    console.log(`${round} ${nodes} | ${f(b.spiceTsMedianMs)} | ${f(a.spiceTsMedianMs)} | ${(b.spiceTsMedianMs / a.spiceTsMedianMs).toFixed(2)}x | ${f(b.ngspiceInternalMedianMs)}, ${f(a.ngspiceInternalMedianMs)} | ${b.spiceTsPeakRssMiB.toFixed(1)}/${a.spiceTsPeakRssMiB.toFixed(1)}`);
  }
  const s = side => entry[side].profile;
  console.log(`${round} profile self samples before ${JSON.stringify(s('before').selfSamples)} of ${s('before').totalSamples}; after ${JSON.stringify(s('after').selfSamples)} of ${s('after').totalSamples}`);
}
const mb = read('microbench.json');
for (const [name, w] of Object.entries(mb.workloads)) console.log(`microbench ${name}: ${f(w.before.medianMs)} -> ${f(w.after.medianMs)} ms (${w.speedup.toFixed(2)}x)`);
const cs = read('cold-start.json');
for (const [nodes, s] of Object.entries(cs.sizes)) {
  console.log(`cold ${nodes}: first call ${f(s.legacy.firstCallMedianMs)} -> ${f(s.current.firstCallMedianMs)} ms; window ${f(s.legacy.measuredWindowMedianMs)} -> ${f(s.current.measuredWindowMedianMs)} ms`);
}
