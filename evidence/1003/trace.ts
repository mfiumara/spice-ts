import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { MOS2 } from '../../packages/core/src/devices/mos2.js';
import { createTransientSim } from '../../packages/core/src/analysis/transient-driver.js';
import type { StampContext } from '../../packages/core/src/devices/device.js';

type Observed = {
  lastLoad: { vgs: number; vds: number; vbs: number };
  transientLoadContext?: StampContext;
  charges: { acceptedCharge: Float64Array; acceptedCurrent: Float64Array; acceptedVoltage: Float64Array; acceptedCapacitance: Float64Array; truncation?: object };
};
const loads: object[] = [];
const accepted: object[] = [];
const stamp = MOS2.prototype.stampTransientCharge;
MOS2.prototype.stampTransientCharge = function(ctx, integration) {
  stamp.call(this, ctx, integration);
  if (ctx.time >= 3.1e-9) return;
  const device = this as unknown as Observed;
  const [d, g, s, b] = this.nodes;
  const voltage = (n: number) => n >= 0 ? ctx.getVoltage(n) : 0;
  const type = this.model.polarity;
  loads.push({ time: ctx.time, device: this.name, integration,
    rawTerminals: [g, d, b].map(n => type * (voltage(n) - voltage(s))),
    loadedTerminals: [device.lastLoad.vgs, device.lastLoad.vds, device.lastLoad.vbs],
    predicted: device.transientLoadContext !== undefined });
};
const accept = MOS2.prototype.acceptTransientStep;
MOS2.prototype.acceptTransientStep = function(ctx) {
  accept.call(this, ctx);
  if (ctx.time >= 3.1e-9) return;
  const device = this as unknown as Observed;
  if (device.charges.truncation) return;
  accepted.push({ time: ctx.time, device: this.name,
    charge: [...device.charges.acceptedCharge], current: [...device.charges.acceptedCurrent],
    voltage: [...device.charges.acceptedVoltage], capacitance: [...device.charges.acceptedCapacitance] });
};
async function main() {
  const sim = await createTransientSim(readFileSync('evidence/996/repro/ring.cir', 'utf8'));
  const steps: object[] = [];
  while (!sim.isDone) {
    const prior = sim.convergence.transient.newtonIterations;
    const before = sim.simTime;
    sim.advance();
    steps.push({ time: sim.simTime, dt: sim.simTime - before, iterations: sim.convergence.transient.newtonIterations - prior });
  }
  writeFileSync(`evidence/1003/${process.argv[2] ?? 'current'}-trace.json.gz`, gzipSync(JSON.stringify({ loads, accepted, steps, convergence: sim.convergence }) + '\n'));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
