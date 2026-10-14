import type { CompiledCircuit } from '../circuit.js';
import type { NodeInitialState } from '../types.js';
import type { NodeHold } from '../mna/assembler.js';
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

/**
 * Row holds that pin every `.ic` node at its value during the transient
 * operating point without UIC (ngspice MODETRANOP, SPICE3 semantics). The
 * assembler applies them after each device load with ngspice-47 cktload.c
 * `ZeroNoncurRow` semantics (see `MNAAssembler.applyNodeHolds`, #588); the
 * hold is released at t=0 because only the operating-point solve sets them
 * (#531).
 *
 * `.nodeset` holds are separate: held only during junction/fixed loads and
 * released before the floating operating-point solve can converge.
 */
export function initialConditionHolds(compiled: CompiledCircuit): NodeHold[] {
  return nodeStateHolds(compiled, compiled.initialConditions);
}

/** ngspice MODEINITJCT / MODEINITFIX nodeset row holds. */
export function nodeSetHolds(compiled: CompiledCircuit): NodeHold[] {
  return nodeStateHolds(compiled, compiled.nodeSets);
}

function nodeStateHolds(compiled: CompiledCircuit, states: readonly NodeInitialState[]): NodeHold[] {
  const holds: NodeHold[] = [];
  for (const state of states) {
    const node = resolveNodeState(compiled, state);
    if (node >= 0) holds.push({ node, value: state.value });
  }
  return holds;
}

function applyNodeState(
  compiled: CompiledCircuit,
  solution: Float64Array,
  state: NodeInitialState,
): void {
  const index = resolveNodeState(compiled, state);
  if (index >= 0) solution[index] = state.value;
}

/** MNA index of an initial-state node; -1 for ground. */
function resolveNodeState(compiled: CompiledCircuit, state: NodeInitialState): number {
  const normalizedNode = state.node.toLowerCase();
  const index = compiled.nodeIndexMap.get(state.node)
    ?? [...compiled.nodeIndexMap].find(([node]) => node.toLowerCase() === normalizedNode)?.[1];
  if (index === undefined) {
    throw new InvalidCircuitError(`Initial state references unknown node '${state.node}'`);
  }
  if (index < 0 && state.value !== 0) {
    throw new InvalidCircuitError('Ground initial voltage must be 0 V');
  }
  return index;
}
