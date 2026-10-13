// Receipt shape: phase timings, peak RSS, full IEEE output digest, convergence.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const [bundle, deck, mode] = process.argv.slice(2);
const entryMs = performance.now();
const { simulate } = await import(pathToFileURL(bundle));
const importMs = performance.now() - entryMs;
const netlist = readFileSync(deck, 'utf8');
let warmupMs = 0;
if (mode === 'warm') {
  const start = performance.now();
  await simulate(netlist);
  warmupMs = performance.now() - start;
}
const start = performance.now();
const result = await simulate(netlist);
const simulateMs = performance.now() - start;
const digest = createHash('sha256');
let vectors = 0, values = 0;
const add = (name, data) => {
  digest.update(name + '\0');
  const a = Float64Array.from(data);
  digest.update(Buffer.from(a.buffer));
  vectors++; values += a.length;
};
if (result.dc) {
  for (const [name, value] of result.dc.voltages) add('dc-v:' + name, [value]);
  for (const [name, value] of result.dc.currents) add('dc-i:' + name, [value]);
}
if (result.transient) {
  add('time', result.transient.time);
  for (const [name, data] of result.transient.voltages) add('tran-v:' + name, data);
  for (const [name, data] of result.transient.currents) add('tran-i:' + name, data);
}
console.log(JSON.stringify({ importMs, warmupMs, simulateMs, peakRssMiB: process.resourceUsage().maxRSS / 1024, outputSha256: digest.digest('hex'), vectors, values, convergence: result.convergence }));
