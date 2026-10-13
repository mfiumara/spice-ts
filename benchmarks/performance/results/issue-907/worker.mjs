// Receipt: {phases, memory, ms, grid, values, convergence}; profiles cover simulate only.
import { readFileSync, writeFileSync } from 'node:fs';
import { Session } from 'node:inspector';
import { gzipSync } from 'node:zlib';
const [deck, probe, prefix, warmup] = process.argv.slice(2);
const memory = () => process.memoryUsage();
const phases = [{ phase: 'worker-entry', ms: performance.now(), memory: memory() }];
const { simulate } = await import('../../../../packages/core/dist/index.js');
phases.push({ phase: 'core-imported', ms: performance.now(), memory: memory() });
const netlist = readFileSync(deck, 'utf8');
if (warmup === '--warm') {
  const start = performance.now();
  await simulate(netlist);
  phases.push({ phase: 'warmup-complete', ms: performance.now(), warmupMs: performance.now() - start, memory: memory() });
}
const session = new Session(); session.connect();
const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params, (error, result) => error ? reject(error) : resolve(result)));
await post('Profiler.enable');
await post('HeapProfiler.enable');
await post('HeapProfiler.startSampling', { samplingInterval: 32768, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
await post('Profiler.start');
const start = performance.now();
phases.push({ phase: 'simulate-start', ms: start, memory: memory() });
const result = await simulate(netlist);
const end = performance.now();
phases.push({ phase: 'simulate-end', ms: end, memory: memory() });
const cpu = await post('Profiler.stop');
const heap = await post('HeapProfiler.stopSampling');
writeFileSync(`${prefix}.cpuprofile.gz`, gzipSync(JSON.stringify(cpu.profile)));
writeFileSync(`${prefix}.heapprofile.gz`, gzipSync(JSON.stringify(heap.profile)));
session.disconnect();
const grid = result.transient ? Array.from(result.transient.time) : [0];
const values = result.transient ? Array.from(result.transient.voltage(probe)) : [result.dc.voltage(probe)];
writeFileSync(`${prefix}.result.json`, JSON.stringify({ phases, ms: end - start, peakRssMiB: process.resourceUsage().maxRSS / 1024, grid, values, convergence: result.convergence }, null, 2));
