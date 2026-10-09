import type { CompiledCircuit } from '../circuit.js';
import type { NodeInitialState } from '../types.js';
import { InvalidCircuitError } from '../errors.js';

export type NodeStateMode = 'guess' | 'conditions';

/** Build an MNA state vector from typed node-voltage initial state. */
export function createNodeStateSolution(
  compiled: CompiledCircuit,
  mode: NodeStateMode,
): Float64Array {
  const solution = new Float64Array(compiled.nodeCount + compiled.branchCount);
  const states = mode === 'conditions'
    ? compiled.initialConditions
    : [...compiled.nodeSets, ...compiled.initialConditions];

  for (const state of states) applyNodeState(compiled, solution, state);
  return solution;
}

function applyNodeState(
  compiled: CompiledCircuit,
  solution: Float64Array,
  state: NodeInitialState,
): void {
  const normalizedNode = state.node.toLowerCase();
  const index = compiled.nodeIndexMap.get(state.node)
    ?? [...compiled.nodeIndexMap].find(([node]) => node.toLowerCase() === normalizedNode)?.[1];
  if (index === undefined) {
    throw new InvalidCircuitError(`Initial state references unknown node '${state.node}'`);
  }
  if (index < 0) {
    if (state.value !== 0) {
      throw new InvalidCircuitError('Ground initial voltage must be 0 V');
    }
    return;
  }
  solution[index] = state.value;
}
