import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Session } from 'node:inspector';
import { pathToFileURL } from 'node:url';

const coreUrl = process.env.CORE1077
  ? pathToFileURL(process.env.CORE1077).href
  : new URL('../../../packages/core/dist/index.js', import.meta.url).href;
const { simulate, parse } = await import(coreUrl);

const [file, destination, mode = 'cold'] = process.argv.slice(2);
const deck = readFileSync(file, 'utf8');
const session = new Session();
const post = method => new Promise((resolve, reject) =>
  session.post(method, (error, result) => error ? reject(error) : resolve(result)));
if (mode === 'profile') {
  session.connect();
  await post('Profiler.enable');
  await post('Profiler.start');
}
const start = performance.now();
const result = await simulate(parse(deck));
const wallMs = performance.now() - start;
if (mode === 'profile') {
  const { profile } = await post('Profiler.stop');
  writeFileSync(destination + '.cpuprofile', JSON.stringify(profile));
  session.disconnect();
}
const waveform = [result.transient.time, result.transient.voltage('20'), result.transient.voltage('66')];
const receipt = {
  inputSha256: createHash('sha256').update(deck).digest('hex'), mode, wallMs,
  points: result.transient.time.length, telemetry: result.convergence,
  waveformSha256: createHash('sha256').update(JSON.stringify(waveform)).digest('hex'),
};
writeFileSync(destination, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
