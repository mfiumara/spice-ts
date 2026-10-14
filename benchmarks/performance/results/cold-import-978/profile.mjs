// Diagnostic import-only runs. No simulator source or built artifacts are edited.
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync, writeFileSync, realpathSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadavg, platform, arch } from 'node:os';
import { Session } from 'node:inspector';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
const root = resolve(new URL('../../../../', import.meta.url).pathname);
const out = new URL('.', import.meta.url).pathname;
// Row = {round, mode, importMs, wallMs, loadBefore, loadAfter, modules?, profile?}.
if (process.argv[2] === 'child') {
  const mode = process.argv[3];
  let session;
  const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params, (e, r) => e ? reject(e) : resolve(r)));
  if (mode === 'profile') {
    session = new Session(); session.connect();
    await post('Profiler.enable'); await post('Profiler.setSamplingInterval', { interval: 100 }); await post('Profiler.start');
  }
  globalThis.__moduleTimes = [];
  const start = performance.now();
  await import(pathToFileURL(join(mode === 'evaluation' ? join(out, 'evaluation') : join(root, 'packages/core/dist'), 'index.js')));
  const importMs = performance.now() - start;
  const row = { importMs };
  if (session) { row.profile = (await post('Profiler.stop')).profile; session.disconnect(); }
  if (mode === 'evaluation') row.modules = globalThis.__moduleTimes;
  console.log(JSON.stringify(row));
} else {
  const summarizeOnly = process.argv[2] === 'summarize';
  if (!summarizeOnly && (existsSync(join(out, 'import-samples.json')) || existsSync(join(out, 'import-samples.json.gz')))) throw new Error('Retained receipt exists. Archive it before a fresh measurement.');
  const dist = join(root, 'packages/core/dist');
  const destination = join(out, 'evaluation'); mkdirSync(destination, { recursive: true });
  writeFileSync(join(destination, 'package.json'), '{"type":"module"}\n');
  for (const name of readdirSync(dist).filter(n => n.endsWith('.js'))) {
    let source = readFileSync(join(dist, name), 'utf8');
    const markers = [...source.matchAll(/^\/\/ src\/([^\n]+)$/gm)];
    const edits = [];
    for (let i = 0; i < markers.length; i++) {
      const marker = markers[i];
      const end = markers[i + 1]?.index ?? source.indexOf('//# sourceMappingURL=');
      if (end < marker.index) throw new Error('missing source map marker');
      edits.push([marker.index, `const __m${i} = performance.now();\n`]);
      edits.push([end, `globalThis.__moduleTimes.push({module:${JSON.stringify(marker[1])},ms:performance.now()-__m${i}});\n`]);
    }
    for (const [position, text] of edits.sort((a,b) => b[0]-a[0])) source = source.slice(0, position) + text + source.slice(position);
    writeFileSync(join(destination, name), source);
  }
  const rows = summarizeOnly ? JSON.parse(existsSync(join(out, 'import-samples.json')) ? readFileSync(join(out, 'import-samples.json'), 'utf8') : gunzipSync(readFileSync(join(out, 'import-samples.json.gz'))).toString()).rows : [];
  for (let round = 0; !summarizeOnly && round < 15; round++) {
    const modes = ['control', 'profile', 'evaluation'];
    for (const mode of [...modes.slice(round % 3), ...modes.slice(0, round % 3)]) {
      const loadBefore = loadavg(), start = performance.now();
      const child = spawnSync(process.execPath, [new URL(import.meta.url).pathname, 'child', mode], { cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 20e6 });
      if (child.status !== 0) throw new Error(child.stderr || String(child.error));
      const row = { round: round + 1, mode, wallMs: performance.now()-start, loadBefore, loadAfter: loadavg(), ...JSON.parse(child.stdout) };
      rows.push(row);
      writeFileSync(join(out, 'import-samples.json'), JSON.stringify({ platform: platform(), arch: arch(), node: process.version, rows }, null, 2)+'\n');
    }
  }
  const require = createRequire(realpathSync(join(root, 'packages/core/node_modules/tsup/package.json')));
  const { TraceMap, originalPositionFor } = require('@jridgewell/trace-mapping');
  const maps = Object.fromEntries(readdirSync(dist).filter(n => n.endsWith('.js.map')).map(n => [n.slice(0,-4), new TraceMap(JSON.parse(readFileSync(join(dist,n),'utf8')))]));
  function stats(values) {
    const a = [...values].sort((a,b)=>a-b);
    const q = p => {const x = (a.length-1)*p, i = Math.floor(x); return a[i]+(a[Math.ceil(x)]-a[i])*(x-i);};
    return { n:a.length, median:q(.5), q1:q(.25), q3:q(.75), iqr:q(.75)-q(.25) };
  }
  const samples = [];
  for (const row of rows.filter(r => r.mode === 'profile')) {
    const nodes = new Map(row.profile.nodes.map(n => [n.id,n]));
    const totals = {};
    for (let i = 0; i < row.profile.samples.length; i++) {
      const frame = nodes.get(row.profile.samples[i]).callFrame;
      const name = frame.url.split('/').at(-1), map = maps[name];
      const position = map && frame.lineNumber >= 0 ? originalPositionFor(map, {line:frame.lineNumber+1,column:frame.columnNumber}) : null;
      const module = position?.source ?? `[unattributed] ${frame.functionName || frame.url || 'V8'}`;
      totals[module] = (totals[module] ?? 0) + row.profile.timeDeltas[i]/1000;
    }
    samples.push(totals);
  }
  const all = [...new Set(samples.flatMap(r => Object.keys(r)))];
  const cpu = all.map(module => ({module, sampledMs:stats(samples.map(r => r[module] ?? 0))})).sort((a,b)=>b.sampledMs.median-a.sampledMs.median);
  const evaluationRows = rows.filter(r=>r.mode==='evaluation');
  const names = [...new Set(evaluationRows.flatMap(r=>r.modules.map(m=>m.module)))];
  const evaluation = names.map(module => ({module, ms:stats(evaluationRows.map(r=>r.modules.filter(m=>m.module===module).reduce((sum,m)=>sum+m.ms,0)))})).sort((a,b)=>b.ms.median-a.ms.median);
  const summary = {control:stats(rows.filter(r=>r.mode==='control').map(r=>r.importMs)), profiled:stats(rows.filter(r=>r.mode==='profile').map(r=>r.importMs)), instrumented:stats(evaluationRows.map(r=>r.importMs)), cpu, evaluation};
  writeFileSync(join(out,'import-summary.json'),JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify({control:summary.control,cpu:cpu.slice(0,12),evaluation:evaluation.slice(0,12)},null,2));
}
