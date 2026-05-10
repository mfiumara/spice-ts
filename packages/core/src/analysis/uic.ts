import type { Circuit, CompiledCircuit } from '../circuit.js';
import type { ResolvedOptions } from '../types.js';
import { solveDCOperatingPoint } from './dc.js';
import { Inductor } from '../devices/inductor.js';

/**
 * Compute the initial solution vector for a `.tran ... uic` run.
 *
 * Substitutes capacitors with `ic=` for DC voltage sources, inductors with
 * `ic=` for DC current sources, and drops mutual-inductance K-elements
 * (which contribute nothing at DC). Solves the resulting linear DC system,
 * then maps node voltages and branch currents back to the *original*
 * compiled circuit's solution layout — which uses different branch indices
 * because inductors-with-ic become branchless current sources, and
 * capacitors-with-ic gain new branches.
 *
 * Storage elements without `ic` keep their default DC behaviour: caps act
 * as opens, inductors as shorts. This matches the ngspice convention where
 * the unspecified element settles to the value implied by the surrounding
 * topology rather than being forced to zero.
 *
 * @returns Initial solution sized for the original `compiled` system.
 */
export function computeUICInitialSolution(
  circuit: Circuit,
  compiled: CompiledCircuit,
  options: ResolvedOptions,
): Float64Array {
  const icCompiled = circuit.compileForUIC();
  const { assembler: icAsm } = solveDCOperatingPoint(icCompiled, options);

  const seed = new Float64Array(compiled.nodeCount + compiled.branchCount);

  // Map node voltages by name. The IC system has the same node set as the
  // original (substitutions only swap device types, not topology).
  for (const [name, origIdx] of compiled.nodeIndexMap) {
    if (origIdx < 0) continue;
    const icIdx = icCompiled.nodeIndexMap.get(name);
    if (icIdx !== undefined && icIdx >= 0) {
      seed[origIdx] = icAsm.solution[icIdx];
    }
  }

  // Map branch currents. Original branches come from V sources, inductors
  // (all of them), and controlled sources (E/H). After substitution:
  //   - V sources keep their branches (currents transfer directly).
  //   - Inductors WITH ic became I sources (no branch in IC system); use the
  //     declared ic as the seed current, with the same dot/sign convention
  //     as the inductor's own KCL stamp (branch current enters n+).
  //   - Inductors WITHOUT ic stayed as inductors (DC short, branch present).
  //   - E/H controlled sources keep their branches.
  for (let i = 0; i < compiled.branchNames.length; i++) {
    const name = compiled.branchNames[i];
    const origBranchAbs = compiled.nodeCount + i;

    // Look up the original device to know what kind of element this branch
    // belongs to.
    const dev = compiled.devices.find(d => d.name === name);

    if (dev instanceof Inductor && dev.ic !== undefined) {
      seed[origBranchAbs] = dev.ic;
      continue;
    }

    // Otherwise, find the same name in the IC system's branch layout.
    const icBranchIdx = icCompiled.branchNames.indexOf(name);
    if (icBranchIdx >= 0) {
      seed[origBranchAbs] = icAsm.solution[icCompiled.nodeCount + icBranchIdx];
    }
  }

  return seed;
}
