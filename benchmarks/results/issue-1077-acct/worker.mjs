import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Session } from 'node:inspector';
const [deckPath, mode, destination] = process.argv.slice(2);
const diagnostic = mode === 'instrumented';
const totals = {}, calls = {}, depths = {};
globalThis.__acct = {
  enter(key) { calls[key] = (calls[key] ?? 0) + 1; depths[key] = (depths[key] ?? 0) + 1; return performance.now(); },
  exit(key, start) { if (--depths[key] === 0) totals[key] = (totals[key] ?? 0) + performance.now() - start; },
  measure(key, fn) { const start = this.enter(key); try { return fn(); } finally { this.exit(key, start); } },
};
const { parse, simulate } = await import(`./.generated/${diagnostic ? 'instrumented' : 'control'}.mjs`);
const deck = readFileSync(deckPath, 'utf8');
const hash = x => createHash('sha256').update(x).digest('hex');
const session = new Session();
const post = (method) => new Promise((resolve, reject) => session.post(method, (e, v) => e ? reject(e) : resolve(v)));
if (mode === 'profile') { session.connect(); await post('Profiler.enable'); await post('Profiler.start'); }
const rows = [];
for (let run = 0; run < (mode === 'warm' ? 6 : 1); run++) {
  for (const key of Object.keys(totals)) delete totals[key];
  for (const key of Object.keys(calls)) delete calls[key];
  const start = performance.now();
  const circuit = parse(deck);
  const parsed = performance.now();
  const result = await simulate(circuit);
  const stop = performance.now();
  const tran = result.transient;
  const waveforms = [tran.time, tran.voltage('20'), tran.voltage('66')].map(values => hash(Buffer.from(new Float64Array(values).buffer)));
  rows.push({ run, mode, inputSha256: hash(deck), apiMs: stop - start, parseMs: parsed - start,
    points: tran.time.length, convergence: result.convergence, waveforms,
    inclusiveMs: { ...totals }, calls: { ...calls } });
}
if (mode === 'profile') {
  const { profile } = await post('Profiler.stop');
  writeFileSync(destination + '.cpuprofile', JSON.stringify(profile)); session.disconnect();
}
writeFileSync(destination, JSON.stringify(rows, null, 2) + '\n');
console.log(JSON.stringify(rows));
