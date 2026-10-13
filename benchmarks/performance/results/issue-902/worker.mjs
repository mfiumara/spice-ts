// One fresh-process sample. Shape: timing, RSS, probe grid/values, convergence.
import { readFileSync, writeFileSync } from 'node:fs';
import { Session } from 'node:inspector';
import { simulate } from '../../../../packages/core/dist/index.js';
import { m2Netlist } from '../../scaling-m2-fixture.mjs';
const [circuit, size, deckPath, profilePath] = process.argv.slice(2);
const { probe } = m2Netlist(circuit, Number(size));
const deck = readFileSync(deckPath, 'utf8');
let session;
const post = (method) => new Promise((resolve, reject) => session.post(method, (error, result) => error ? reject(error) : resolve(result)));
if (profilePath) {
  session = new Session(); session.connect();
  await post('Profiler.enable'); await post('Profiler.start');
}
const start = performance.now();
const result = await simulate(deck);
const ms = performance.now() - start;
if (session) {
  const { profile } = await post('Profiler.stop');
  writeFileSync(profilePath, JSON.stringify(profile)); session.disconnect();
}
const grid = result.transient ? Array.from(result.transient.time) : [0];
const values = result.transient ? Array.from(result.transient.voltage(probe)) : [result.dc.voltage(probe)];
console.log(JSON.stringify({ ms, peakRssMiB: process.resourceUsage().maxRSS / 1024, grid, values, convergence: result.convergence }));
