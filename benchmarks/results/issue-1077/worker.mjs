import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Session } from 'node:inspector';
import { simulate, parse, createTransientSim } from '../../../packages/core/dist/index.js';

// Receipt shape: input hash, mode, run, wall/parse/solve ms, points, telemetry.
const [file, mode = 'cold', destination] = process.argv.slice(2);
const deck = readFileSync(file, 'utf8');
const inputSha256 = createHash('sha256').update(deck).digest('hex');
const receipts = [];
const session = new Session();
const post = (method, params = {}) => new Promise((resolve, reject) =>
  session.post(method, params, (error, result) => error ? reject(error) : resolve(result)));
if (mode === 'profile') {
  session.connect();
  await post('Profiler.enable');
  await post('Profiler.start');
}
for (let run = 0; run < (mode === 'warm' ? 6 : 1); run++) {
  const start = performance.now();
  const circuit = parse(deck);
  const parsed = performance.now();
  const result = await simulate(circuit);
  const stop = performance.now();
  receipts.push({ inputSha256, mode, run, wallMs: stop - start,
    parseMs: parsed - start, compileDcTransientRecordMs: stop - parsed,
    points: result.transient.time.length, telemetry: result.convergence,
    final20: result.transient.voltage('20').at(-1), final66: result.transient.voltage('66').at(-1) });
}
if (mode === 'profile') {
  const { profile } = await post('Profiler.stop');
  writeFileSync(destination + '.cpuprofile', JSON.stringify(profile));
  session.disconnect();
}
if (mode === 'split') {
  for (let run = 0; run < 6; run++) {
    const start = performance.now();
    const circuit = parse(deck);
    const parsed = performance.now();
    const sim = await createTransientSim(circuit);
    const setup = performance.now();
    while (!sim.isDone) sim.advance();
    const stop = performance.now();
    receipts.push({ inputSha256, mode: 'driver-diagnostic', run, parseMs: parsed - start,
      compileDcSetupMs: setup - parsed, transientWithStepMapsMs: stop - setup,
      telemetry: sim.convergence });
    sim.dispose();
  }
}
writeFileSync(destination, JSON.stringify(receipts, null, 2) + '\n');
console.log(JSON.stringify(receipts));
