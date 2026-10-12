/**
 * Issue #779: where does one M2 deck spend its analysis time?
 *
 *   npx tsx benchmarks/performance/results/issue-779/scripts/breakdown.mts <circuit> <nodes> [runs]
 *
 * Wraps the real solver's analyzePattern / factorize / solve and the
 * assembler's lockTopology with timers (src build via tsx), then runs one
 * warmup plus `runs` timed parseAsync() + simulate() calls of the M2 deck.
 * Prints per-run milliseconds; "other" is simulate() minus the timed phases.
 */
import { parseAsync, simulate } from '../../../../../packages/core/src/index.js';
import { GilbertPeierlsSolver } from '../../../../../packages/core/src/solver/gilbert-peierls.js';
import { MNAAssembler } from '../../../../../packages/core/src/mna/assembler.js';
import { Circuit } from '../../../../../packages/core/src/circuit.js';
import { m2Netlist } from '../../../scaling-m2-fixture.mjs';

const circuit = process.argv[2] ?? 'resistor-mesh-op';
const nodes = Number(process.argv[3] ?? 50000);
const runs = Number(process.argv[4] ?? 3);

const acc: Record<string, number> = {};
const calls: Record<string, number> = {};
function wrap(proto: Record<string, unknown>, name: string, label = name): void {
  const original = proto[name] as (...args: unknown[]) => unknown;
  proto[name] = function (this: unknown, ...args: unknown[]) {
    const t = performance.now();
    try { return original.apply(this, args); } finally {
      acc[label] = (acc[label] ?? 0) + performance.now() - t;
      calls[label] = (calls[label] ?? 0) + 1;
    }
  };
}
const gp = GilbertPeierlsSolver.prototype as unknown as Record<string, unknown>;
wrap(gp, 'analyzePattern');
wrap(gp, 'factorize');
wrap(gp, 'solve');
wrap(MNAAssembler.prototype as unknown as Record<string, unknown>, 'lockTopology');
wrap(Circuit.prototype as unknown as Record<string, unknown>, 'compile');

const { netlist } = m2Netlist(circuit, nodes);
const rows: Record<string, number>[] = [];
for (let run = -1; run < runs; run++) {
  for (const key of Object.keys(acc)) { acc[key] = 0; calls[key] = 0; }
  const t0 = performance.now();
  const parsed = await parseAsync(netlist);
  const t1 = performance.now();
  await simulate(parsed);
  const t2 = performance.now();
  if (run < 0) continue;
  const timed = Object.values(acc).reduce((a, b) => a + b, 0);
  rows.push({ parse: t1 - t0, simulate: t2 - t1, ...acc, other: t2 - t1 - timed });
  if (runs > 5) continue;
  const parts = Object.keys(acc).map(k => `${k} ${acc[k].toFixed(1)} (${calls[k]})`).join(' | ');
  console.log(`${circuit}:${nodes} run ${run}: parse ${(t1 - t0).toFixed(1)} simulate ${(t2 - t1).toFixed(1)} | ${parts} | other ${(t2 - t1 - timed).toFixed(1)}`);
}
const median = (key: string): number => {
  const v = rows.map(r => r[key]).sort((a, b) => a - b);
  return v[v.length >> 1];
};
console.log(`${circuit}:${nodes} median of ${runs}: ` + Object.keys(rows[0]).map(k => `${k} ${median(k).toFixed(2)}`).join(' | '));
