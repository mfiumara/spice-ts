// Receipt = clocks + exclusive phase times + convergence + full-output hash + probe.
const [mode, directory, id, circuitName, size] = process.argv.slice(2);
const { readFileSync, writeFileSync } = await import('node:fs');
const { join } = await import('node:path');
const { pathToFileURL } = await import('node:url');
const { createHash } = await import('node:crypto');
const { spawnSync } = await import('node:child_process');
const { parseRaw, hashVectors } = await import('../../performance/rc1k-attribution-data.mjs');
const totals = {}, calls = {}, stack = [];
globalThis.__rc1k = {
  enter(key) { const span = { key, start: performance.now(), children: 0 }; stack.push(span); return span; },
  leave(span) {
    const elapsed = performance.now() - span.start;
    if (stack.pop() !== span) throw new Error('unbalanced instrumentation');
    totals[span.key] = (totals[span.key] ?? 0) + elapsed - span.children;
    calls[span.key] = (calls[span.key] ?? 0) + 1;
    if (stack.length) stack.at(-1).children += elapsed;
  },
};
const prepared = JSON.parse(readFileSync(join(directory, 'prepared.json')));
const deck = join(directory, `${circuitName}-${size}.cir`), text = readFileSync(deck, 'utf8');
const deckSha256 = createHash('sha256').update(text).digest('hex');
if (prepared.decks.find(d => d.circuit === circuitName && d.size === Number(size))?.deckSha256 !== deckSha256) throw new Error('deck mismatch');
const phases = {};
let vectors, convergence = null, native = null;
if (mode === 'ngspice') {
  const start = performance.now();
  const child = spawnSync('ngspice', ['-b', '-r', join(directory, id + '.raw'), deck], { cwd: directory, encoding: 'utf8', timeout: 110000, maxBuffer: 64 * 1024 * 1024 });
  phases.nativeWall = performance.now() - start;
  writeFileSync(join(directory, id + '.stdout.txt'), child.stdout ?? '');
  writeFileSync(join(directory, id + '.stderr.txt'), child.stderr ?? '');
  if (child.status !== 0 || !/Using KLU/.test(child.stdout + child.stderr)) throw new Error('native failure: ' + child.error);
  const log = child.stdout + child.stderr;
  const metric = label => { const m = log.match(new RegExp(label + '\\s*=\\s*([\\d.eE+-]+)')); return m ? Number(m[1]) : null; };
  for (const [key, label] of Object.entries({ parse: 'Netlist loading time', analysis: 'Total analysis time \\(seconds\\)', loadStamp: 'Matrix load time', factor: 'Matrix factor time', solve: 'Matrix solve time', reorder: 'Matrix reorder time' })) phases[key] = metric(label) === null ? null : metric(label) * 1000;
  native = Object.fromEntries(['Transient iterations', 'Transient timepoints', 'Accepted timepoints', 'Rejected timepoints', 'Total iterations'].map(k => [k, metric(k)]));
  vectors = parseRaw(readFileSync(join(directory, id + '.raw')));
} else {
  const core = await import(pathToFileURL(join(directory, mode, 'index.js')).href);
  const start = performance.now();
  const circuit = await core.parseAsync(text);
  phases.parse = performance.now() - start;
  const before = performance.now();
  const result = await core.simulate(circuit);
  phases.analysis = performance.now() - before;
  phases.api = phases.parse + phases.analysis;
  convergence = result.convergence;
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
  if (mode === 'instrumented') {
    Object.assign(phases, totals);
    phases.residual = phases.analysis - Object.values(totals).reduce((a, b) => a + b, 0);
  }
}
const probeName = circuitName.startsWith('cmos') ? 'tran-v:s20' : circuitName.startsWith('rc-') ? 'tran-v:n10' : null;
const grid = vectors.find(([name]) => name === 'time')?.[1];
const probe = vectors.find(([name]) => name === probeName)?.[1];
console.log(JSON.stringify({ mode, circuit: circuitName, size: Number(size), deckSha256, phases, calls, convergence, native, output: hashVectors(vectors), grid: grid ? Array.from(grid) : null, probe: probe ? Array.from(probe) : null }));
