import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { MOS3 } from '../../../packages/core/src/devices/mos3.js';
import { simulate } from '../../../packages/core/src/simulate.js';
import type { StampContext } from '../../../packages/core/src/devices/device.js';

// Data shape: read-only snapshots of private diagnostic state, never a production API.
interface ChargeSnapshot {
  truncation?: unknown;
  acceptedCharge: Float64Array; acceptedCurrent: Float64Array;
  acceptedVoltage: Float64Array; acceptedCapacitance: Float64Array;
  pending?: { method: string; dt: number }; factor: number;
}
interface DiagnosticMOS {
  charges: ChargeSnapshot;
  lastLoad: { vgs: number; vds: number; vbs: number };
  meyerHalf(voltage: (node: number) => number, out: Float64Array): void;
}
const here = dirname(fileURLToPath(import.meta.url));
const accept = MOS3.prototype.acceptTransientStep;
const counts = new Map<string, number>();
const rows: unknown[] = [];
MOS3.prototype.acceptTransientStep = function (ctx: StampContext) {
  const state = this as unknown as DiagnosticMOS;
  if (state.charges.truncation !== undefined) { accept.call(this, ctx); return; }
  const count = counts.get(this.name) ?? 0;
  counts.set(this.name, count + 1);
  const pending = state.charges.pending;
  const loaded = { ...state.lastLoad };
  accept.call(this, ctx);
  if (count > 2) return;
  const half = new Float64Array(3);
  state.meyerHalf(node => node >= 0 ? ctx.getVoltage(node) : 0, half);
  rows.push({ name: this.name, point: count, integration: pending, factor: state.charges.factor,
    prime: this.nodes.map(node => node >= 0 ? ctx.getVoltage(node) : 0), half: Array.from(half), loaded,
    q: Array.from(state.charges.acceptedCharge), cq: Array.from(state.charges.acceptedCurrent),
    voltage: Array.from(state.charges.acceptedVoltage), capacitance: Array.from(state.charges.acceptedCapacitance) });
};
async function main() {
try {
  await simulate(readFileSync(resolve(here, process.argv[2] ?? 'original.cir'), 'utf8'));
  writeFileSync(resolve(here, 'ts-state.json.gz'), gzipSync(JSON.stringify(rows), { level: 9 }));
} finally { MOS3.prototype.acceptTransientStep = accept; }
}
void main();
