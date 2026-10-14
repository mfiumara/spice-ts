// First statement before imports. Node22 macOS hrtime uses mach_continuous_time;
// Linux uses CLOCK_MONOTONIC. Controller records both epochs and certifies them.
const first = process.hrtime.bigint();
const realtime = Date.now();
const ms = (end, start) => Number(end - start) / 1e6;
const [mode, directory, id] = process.argv.slice(2);
const importStart = process.hrtime.bigint();
const { readFileSync, writeFileSync } = await import('node:fs');
const { createHash } = await import('node:crypto');
const { join } = await import('node:path');
const { pathToFileURL } = await import('node:url');
const { spawn, execFileSync } = await import('node:child_process');
const { loadavg } = await import('node:os');
const { hashVectors, parseRaw } = await import('./rc1k-attribution-data.mjs');
const totals = {}, calls = {}, stack = [];
globalThis.__rc1k = {
  enter(key) { const span = { key, start: process.hrtime.bigint(), children: 0n }; stack.push(span); return span; },
  leave(span) {
    const elapsed = process.hrtime.bigint() - span.start;
    if (stack.pop() !== span) throw new Error('unbalanced instrumentation');
    totals[span.key] = (totals[span.key] ?? 0) + Number(elapsed - span.children) / 1e6;
    calls[span.key] = (calls[span.key] ?? 0) + 1;
    if (stack.length) stack.at(-1).children += elapsed;
  },
};
const boundaries = {}, evidence = {};
let status = 'ok';
try {
let result, core;
if (mode !== 'ngspice') core = await import(pathToFileURL(join(directory, mode, 'index.js')).href);
const imported = process.hrtime.bigint();
boundaries.import = ms(imported, importStart);
const text = readFileSync(join(directory, 'rc1k.cir'), 'utf8');
evidence.deckSha256 = createHash('sha256').update(text).digest('hex');
const read = process.hrtime.bigint();
boundaries.deckRead = ms(read, imported);
let vectors;
if (mode === 'ngspice') {

  const host = () => ({ loadavg: loadavg(), processCount: execFileSync('ps', ['-A', '-o', 'pid='], { encoding: 'utf8' }).trim().split('\n').length });
  const before = host();
  const start = process.hrtime.bigint();
  const child = spawn('ngspice', ['-b', '-r', join(directory, id + '.raw'), join(directory, 'rc1k.cir')], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
  writeFileSync(join(directory, id + '.native.started.json'), JSON.stringify({ pid: child.pid, startNs: String(start), before }));
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  const closed = process.hrtime.bigint();
  const after = host();
  evidence.native = { pid: child.pid, code, startNs: String(start), closeNs: String(closed), wallMs: ms(closed, start), before, after };
  writeFileSync(join(directory, id + '.stdout.txt'), stdout);
  writeFileSync(join(directory, id + '.stderr.txt'), stderr);
  if (code !== 0 || !/Using KLU/.test(stdout + stderr)) throw new Error('ngspice failed or KLU not selected');
  const metric = label => {
    const match = (stdout + stderr).match(new RegExp(label + '\\s*=\\s*([\\d.eE+-]+)'));
    return match ? Number(match[1]) * 1000 : null;
  };
  boundaries.nativeWall = evidence.native.wallMs;
  boundaries.parse = metric('Netlist loading time');
  boundaries.compile = null; // No independent ngspice compilation clock.
  boundaries.loadStamp = metric('Matrix load time');
  boundaries.factor = metric('Matrix factor time');
  boundaries.solve = metric('Matrix solve time');
  boundaries.reorder = metric('Matrix reorder time');
  boundaries.nativeAnalysis = metric('Total analysis time \\(seconds\\)');
  evidence.native.transientIterations = Number((stdout + stderr).match(/Transient iterations\s*=\s*(\d+)/)?.[1]);
  const outputStart = process.hrtime.bigint();
  vectors = parseRaw(readFileSync(join(directory, id + '.raw')));
  const hash = hashVectors(vectors);
  boundaries.outputHash = ms(process.hrtime.bigint(), outputStart);
  evidence.output = hash;
  // Native raw emission is already in nativeWall and cannot be split by acct.
  boundaries.outputMaterialization = null;
} else {
  const parsedStart = process.hrtime.bigint();
  const circuit = await core.parseAsync(text);
  const parsed = process.hrtime.bigint();
  boundaries.parse = ms(parsed, parsedStart);
  result = await core.simulate(circuit);
  const simulated = process.hrtime.bigint();
  boundaries.simulate = ms(simulated, parsed);
  vectors = [];
  if (result.dc) {
    for (const [name, value] of result.dc.voltages) vectors.push(['dc-v:' + name, [value]]);
    for (const [name, value] of result.dc.currents) vectors.push(['dc-i:' + name, [value]]);
  }
  if (result.transient) {
    vectors.push(['time', result.transient.time]);
    for (const [name, data] of result.transient.voltages) vectors.push(['tran-v:' + name, data]);
    for (const [name, data] of result.transient.currents) vectors.push(['tran-i:' + name, data]);
  }
  evidence.output = hashVectors(vectors);
  boundaries.outputHash = ms(process.hrtime.bigint(), simulated);
  evidence.convergence = result.convergence;
  for (const key of ['compile', 'loadStamp', 'factor', 'solve', 'outputMaterialization']) boundaries[key] = mode === 'instrumented' ? totals[key] ?? 0 : null;
  if (mode === 'instrumented') Object.assign(boundaries, totals);
  if (mode === 'instrumented') boundaries.simulateResidual = boundaries.simulate - Object.values(totals).reduce((a, b) => a + b, 0);
  evidence.calls = calls;
}
// Retain matched-point/probe evidence alongside the full-output hash.
evidence.grid = Array.from(vectors.find(([name]) => name === 'time')[1]);
evidence.probe = Array.from(vectors.find(([name]) => name === 'tran-v:n10')[1]);
} catch (error) {
  status = 'failed';
  evidence.error = String(error?.stack ?? error);
}
const done = process.hrtime.bigint();
process.stdout.write(JSON.stringify({ mode, status, firstNs: String(first), doneNs: String(done), lifetime: { performanceMs: ms(done, first), realtimeMs: Date.now() - realtime }, boundaries, evidence }) + '\n');
if (status !== 'ok') process.exitCode = 1;
