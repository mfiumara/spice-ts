// Receipt = {parseMs, simulateMs, lifetime, outputSha256, grid, values, convergence}.
// One cold call. Profile is an explicitly separate attribution child, not a timing sample.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Session } from 'node:inspector/promises';
import { gzipSync } from 'node:zlib';
const start = performance.now(), wall = Date.now();
const [deck, probe, prefix, profiling] = process.argv.slice(2);
const { parseAsync, simulate } = await import('../../../../packages/core/dist/index.js');
const netlist = readFileSync(deck, 'utf8');
let session;
if (profiling === '--profile') {
  session = new Session(); session.connect();
  await session.post('Profiler.enable');
  await session.post('Profiler.setSamplingInterval', { interval: 1000 });
  await session.post('Profiler.start');
}
const parseStart = performance.now();
const circuit = await parseAsync(netlist);
const parsed = performance.now();
const result = await simulate(circuit);
const finished = performance.now();
if (session) {
  const { profile } = await session.post('Profiler.stop');
  writeFileSync(prefix + '.cpuprofile.gz', gzipSync(JSON.stringify(profile)));
  session.disconnect();
}
const digest = createHash('sha256');
let vectors = 0, count = 0;
function add(name, data) {
  const array = Float64Array.from(data);
  digest.update(name + '\0').update(Buffer.from(array.buffer));
  vectors++; count += array.length;
}
if (result.dc) {
  for (const [name, value] of result.dc.voltages) add('dc-v:' + name, [value]);
  for (const [name, value] of result.dc.currents) add('dc-i:' + name, [value]);
}
if (result.transient) {
  add('time', result.transient.time);
  for (const [name, data] of result.transient.voltages) add('tran-v:' + name, data);
  for (const [name, data] of result.transient.currents) add('tran-i:' + name, data);
}
writeFileSync(prefix + '.result.json', JSON.stringify({
  deckSha256: createHash('sha256').update(netlist).digest('hex'),
  parseMs: parsed - parseStart, simulateMs: finished - parsed,
  outputSha256: digest.digest('hex'), vectors, count,
  grid: result.transient ? Array.from(result.transient.time) : [0],
  values: result.transient ? Array.from(result.transient.voltage(probe)) : [result.dc.voltage(probe)],
  convergence: result.convergence, memory: process.memoryUsage(),
  lifetime: { performanceMs: performance.now() - start, realtimeMs: Date.now() - wall },
}, null, 2) + '\n');
