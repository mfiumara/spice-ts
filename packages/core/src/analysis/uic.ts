import type { CompiledCircuit } from '../circuit.js';
import { Capacitor } from '../devices/capacitor.js';
import { Inductor } from '../devices/inductor.js';

/**
 * Build the t=0 solution used by `.tran ... uic`.
 *
 * Explicit inductor currents map directly to their MNA branch entries.
 * Capacitor voltage constraints are propagated from ground and already-known
 * nodes; disconnected floating groups use an arbitrary zero common mode.
 */
export function computeUICInitialSolution(compiled: CompiledCircuit): Float64Array {
  const seed = new Float64Array(compiled.nodeCount + compiled.branchCount);
  const known = new Set<number>();
  const constraints: Array<{ positive: number; negative: number; voltage: number; name: string }> = [];

  for (const device of compiled.devices) {
    if (device instanceof Capacitor && device.ic !== undefined) {
      constraints.push({
        positive: device.nodes[0],
        negative: device.nodes[1],
        voltage: device.ic,
        name: device.name,
      });
    }
    if (device instanceof Inductor && device.ic !== undefined) {
      seed[compiled.nodeCount + device.branchIndex] = device.ic;
    }
  }

  const voltage = (node: number): number => node < 0 ? 0 : seed[node];
  const isKnown = (node: number): boolean => node < 0 || known.has(node);
  const pending = constraints.slice();

  while (pending.length > 0) {
    let progressed = false;
    for (let index = pending.length - 1; index >= 0; index--) {
      const constraint = pending[index];
      const positiveKnown = isKnown(constraint.positive);
      const negativeKnown = isKnown(constraint.negative);
      if (!positiveKnown && !negativeKnown) continue;

      if (!positiveKnown) {
        seed[constraint.positive] = voltage(constraint.negative) + constraint.voltage;
        known.add(constraint.positive);
      } else if (!negativeKnown) {
        seed[constraint.negative] = voltage(constraint.positive) - constraint.voltage;
        known.add(constraint.negative);
      } else {
        const actual = voltage(constraint.positive) - voltage(constraint.negative);
        if (Math.abs(actual - constraint.voltage) > 1e-9) {
          throw new Error(
            `Inconsistent initial condition on '${constraint.name}': expected ${constraint.voltage} V, got ${actual} V`,
          );
        }
      }
      pending.splice(index, 1);
      progressed = true;
    }

    if (!progressed) {
      // A floating capacitor group has no absolute reference. Ground one end
      // at zero common mode, then continue propagating relative constraints.
      const constraint = pending[pending.length - 1];
      if (constraint.negative >= 0) known.add(constraint.negative);
      else if (constraint.positive >= 0) known.add(constraint.positive);
    }
  }

  return seed;
}
