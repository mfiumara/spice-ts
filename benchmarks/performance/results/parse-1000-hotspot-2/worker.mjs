// WorkerReceipt = {status, firstNs, doneNs, lifetime, boundaries, evidence}.
const first = process.hrtime.bigint(), realtime = Date.now();
const ms = (end, start) => Number(end - start) / 1e6;
const [mode, directory, id, circuitName, size] = process.argv.slice(2);
const importStart = process.hrtime.bigint();
const { readFileSync, writeFileSync } = await import('node:fs');
const { createHash } = await import('node:crypto');
const { join } = await import('node:path');
const { pathToFileURL } = await import('node:url');
const { spawn } = await import('node:child_process');
const { hashVectors } = await import('../../rc1k-attribution-data.mjs');
const { parsePhases } = await import('../../parse-1000-targets.mjs');
const prepared = JSON.parse(readFileSync(join(directory, 'prepared.json'), 'utf8'));
const parserAttribution = prepared.attribution === 'parse';
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
  let core;
  if (mode !== 'ngspice') core = await import(pathToFileURL(join(directory, mode, 'index.js')).href);
  const imported = process.hrtime.bigint();
  boundaries.import = ms(imported, importStart);
  const deck = join(directory, `${circuitName}-${size}.cir`);
  const text = readFileSync(deck, 'utf8');
  evidence.deckSha256 = createHash('sha256').update(text).digest('hex');
  boundaries.deckRead = ms(process.hrtime.bigint(), imported);
  if (mode === 'ngspice') {
    const start = process.hrtime.bigint();
    const child = spawn('ngspice', ['-b', '-r', join(directory, id + '.raw'), deck], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
    writeFileSync(join(directory, id + '.native.started.json'), JSON.stringify({ pid: child.pid, startNs: String(start) }));
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    boundaries.nativeWall = ms(process.hrtime.bigint(), start);
    evidence.native = { pid: child.pid, code };
    writeFileSync(join(directory, id + '.stdout.txt'), stdout);
    writeFileSync(join(directory, id + '.stderr.txt'), stderr);
    if (code !== 0 || !/Using KLU/.test(stdout + stderr)) throw new Error('ngspice failed or KLU not selected');
    for (const [key, label] of Object.entries({ parse: 'Netlist loading time', loadStamp: 'Matrix load time', factor: 'Matrix factor time', solve: 'Matrix solve time', ordering: 'Matrix reorder time' })) {
      const match = (stdout + stderr).match(new RegExp(label + '\\s*=\\s*([\\d.eE+-]+)'));
      boundaries[key] = match ? Number(match[1]) * 1000 : null;
    }
    const outputStart = process.hrtime.bigint();
    const raw = readFileSync(join(directory, id + '.raw'));
    const marker = raw.indexOf(Buffer.from('Binary:\n'));
    if (marker < 0) throw new Error('missing binary raw output');
    // Hash the complete numeric payload. Native header embeds a changing date.
    evidence.output = { outputSha256: createHash('sha256').update(raw.subarray(marker + 8)).digest('hex'), bytes: raw.length - marker - 8 };
    boundaries.outputHash = ms(process.hrtime.bigint(), outputStart);
  } else {
    const parseStart = process.hrtime.bigint();
    const circuit = await core.parseAsync(text);
    const parsed = process.hrtime.bigint();
    boundaries.parse = ms(parsed, parseStart);
    if (mode === 'instrumented' && parserAttribution) {
      for (const key of parsePhases.filter(k => k !== 'parseResidual')) boundaries[key] = totals[key] ?? 0;
      for (const [key, value] of Object.entries(totals).filter(([key]) => key.includes('.'))) {
        boundaries[key] = value;
        boundaries[key.split('.')[0]] += value;
      }
      boundaries.parseResidual = boundaries.parse - Object.values(totals).reduce((a, b) => a + b, 0);
      evidence.parseCalls = { ...calls };
      // Freeze parser spans before simulation can invoke Circuit/numparam helpers again.
      globalThis.__rc1k = { enter() { return null; }, leave() {} };
    }
    if (parserAttribution) evidence.parseSha256 = createHash('sha256').update(JSON.stringify(circuit, (_key, value) =>
      value instanceof Map ? { map: [...value] } : value instanceof Set ? { set: [...value] } : value)).digest('hex');
    const simulationStart = process.hrtime.bigint();
    if (parserAttribution) boundaries.parseEqualityHash = ms(simulationStart, parsed);
    const result = await core.simulate(circuit);
    const simulated = process.hrtime.bigint();
    boundaries.simulate = ms(simulated, parserAttribution ? simulationStart : parsed);
    const vectors = [];
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
    for (const key of ['compile', 'matrixBuild', 'ordering', 'loadStamp', 'factor', 'solve', 'outputMaterialization']) boundaries[key] = mode === 'instrumented' && !parserAttribution ? totals[key] ?? 0 : null;
    if (mode === 'instrumented' && !parserAttribution) boundaries.simulateResidual = boundaries.simulate - Object.values(totals).reduce((a, b) => a + b, 0);
    evidence.calls = calls;
    if (prepared.factorComparison) {
      boundaries.factor = (totals.factor ?? 0) + (totals.growth ?? 0);
      boundaries.growth = totals.growth ?? 0;
      evidence.maxRssKiB = process.resourceUsage().maxRSS;
    }
  }
} catch (error) {
  status = 'failed'; evidence.error = String(error?.stack ?? error);
}
const done = process.hrtime.bigint();
process.stdout.write(JSON.stringify({ status, firstNs: String(first), doneNs: String(done), lifetime: { performanceMs: ms(done, first), realtimeMs: Date.now() - realtime }, boundaries, evidence }) + '\n');
if (status !== 'ok') process.exitCode = 1;
