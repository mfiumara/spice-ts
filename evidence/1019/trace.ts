// Observation only, no solver inputs/options changed.
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { MOS2 } from '../../packages/core/src/devices/mos2.js';
import { createTransientSim } from '../../packages/core/src/analysis/transient-driver.js';

type Observed = {
  charges: { acceptedCharge: Float64Array; acceptedCurrent: Float64Array; acceptedVoltage: Float64Array; acceptedCapacitance: Float64Array; truncation?: object; pending?: { method: string; dt: number } };
};
const charges: object[] = [];
const accept = MOS2.prototype.acceptTransientStep;
MOS2.prototype.acceptTransientStep = function(ctx) {
  const device = this as unknown as Observed;
  const integration = device.charges.pending;
  accept.call(this, ctx);
  if (device.charges.truncation) return;
  charges.push({ time: ctx.time, device: this.name, integration,
    charge: [...device.charges.acceptedCharge], current: [...device.charges.acceptedCurrent],
    voltage: [...device.charges.acceptedVoltage], capacitance: [...device.charges.acceptedCapacitance] });
};
async function main() {
  const sim = await createTransientSim(readFileSync('benchmarks/corpus/corpus-k/fixtures/xyce/Netlists/CircuitSim90/MOS2/pump.cir', 'utf8'));
  const observed = sim as unknown as { chargeTruncationTimestep(dt: number, integration: object, order?: number): number };
  const truncation = observed.chargeTruncationTimestep.bind(sim);
  const lte: object[] = [];
  observed.chargeTruncationTimestep = (dt, integration, order) => {
    const bound = truncation(dt, integration, order);
    lte.push({ time: sim.simTime + dt, dt, integration, orderOverride: order, bound: Number.isFinite(bound) ? bound : 'Infinity' });
    return bound;
  };
  const steps: object[] = [];
  while (!sim.isDone) {
    const prior = sim.convergence.transient.newtonIterations;
    const before = sim.simTime;
    sim.advance();
    steps.push({ time: sim.simTime, dt: sim.simTime - before, iterations: sim.convergence.transient.newtonIterations - prior });
  }
  writeFileSync('evidence/1019/ts-trace.json.gz', gzipSync(JSON.stringify({ charges, steps, lte, convergence: sim.convergence }) + '\n'));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
