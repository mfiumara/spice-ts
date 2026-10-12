// Dump error vs time for selected signals (diagnostic only).
import { readFile } from 'node:fs/promises';
import { runNativeNgspice, runNativeSpiceTs, type ClassicCircuit } from '../../corpus/classic/report.js';

async function main(): Promise<void> {
const [file, signalList, options] = process.argv.slice(2);
let text = await readFile(file, 'utf8');
if (options) text = text.replace(/^\.END\s*$/im, `.OPTIONS ${options}\n.END`);
const input = Buffer.from(text);
const circuit = { id: 'diag', category: 'digital', analyses: ['tran'], localPath: file, sha256: '',
  ngspice: { expectedStatus: 'pass' }, spiceTs: { expectedStatus: 'pass' } } as unknown as ClassicCircuit;
const [s, n] = await Promise.all([runNativeSpiceTs(input, circuit), runNativeNgspice(input, circuit)]);
const sa = s.analyses[0]!.series as any, na = n.analyses[0]!.series as any;
function interp(grid: number[], v: number[], t: number) {
  let i = 1; while (i < grid.length - 1 && grid[i] < t) i++;
  const a = grid[i - 1], b = grid[i]; if (b === a) return v[i];
  return v[i - 1] + (v[i] - v[i - 1]) * (t - a) / (b - a);
}
const sigs = signalList.split(',');
if (process.env.GRID) {
  for (let i = 0; i < Math.max(sa.grid.length, na.grid.length); i++) console.log(i, ((sa.grid[i] ?? NaN) * 1e9).toFixed(5), ((na.grid[i] ?? NaN) * 1e9).toFixed(5));
  return;
}
const keys = Object.keys(sa.signals ?? sa.values ?? {});
if (!sa.signals) console.log(Object.keys(sa));
for (const sig of sigs) {
  const sv = sa.signals[sig]?.map((c: any) => c.re), nv = na.signals[sig]?.map((c: any) => c.re);
  if (!sv || !nv) { console.log('missing', sig, keys.slice(0, 10)); continue; }
  let worst = 0, at = 0, sq = 0;
  for (let i = 0; i < na.grid.length; i++) {
    const e = Math.abs(interp(sa.grid, sv, na.grid[i]) - nv[i]);
    sq += e * e;
    if (e > worst) { worst = e; at = na.grid[i]; }
  }
  console.log('#', sig, 'ngspice-grid max', worst.toExponential(3), 'at', (at * 1e9).toFixed(3), 'ns rms', Math.sqrt(sq / na.grid.length).toExponential(3), 'points', sa.grid.length, na.grid.length);
  if (process.env.AT) {
    for (const ns of process.env.AT.split(',').map(Number)) {
      console.log('at', ns, 'ngspice', interp(na.grid, nv, ns * 1e-9).toPrecision(17), 'spice-ts', interp(sa.grid, sv, ns * 1e-9).toPrecision(17));
    }
    continue;
  }
  if (process.env.QUIET) continue;
  if (process.env.WIN) {
    const [lo, hi] = process.env.WIN.split(':').map(Number);
    for (let i = 0; i < na.grid.length; i++) if (na.grid[i] * 1e9 >= lo && na.grid[i] * 1e9 <= hi) console.log('ng', (na.grid[i] * 1e9).toFixed(4), nv[i].toExponential(6), interp(sa.grid, sv, na.grid[i]).toExponential(6));
    for (let i = 0; i < sa.grid.length; i++) if (sa.grid[i] * 1e9 >= lo && sa.grid[i] * 1e9 <= hi) console.log('st', (sa.grid[i] * 1e9).toFixed(4), sv[i].toExponential(6), interp(na.grid, nv, sa.grid[i]).toExponential(6));
    continue;
  }
  const step = Math.max(1, Math.floor(na.grid.length / 60));
  for (let i = 0; i < na.grid.length; i += step) {
    const t = na.grid[i];
    const st = interp(sa.grid, sv, t);
    console.log((t * 1e9).toFixed(2).padStart(8), nv[i].toFixed(5).padStart(10), st.toFixed(5).padStart(10), (st - nv[i]).toExponential(2));
  }
}
}
main().catch(e => { console.error(e); process.exitCode = 1; });
