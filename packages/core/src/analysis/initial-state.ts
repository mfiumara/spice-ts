import type { CompiledCircuit } from '../circuit.js';
import type { NodeInitialState } from '../types.js';
import type { DeviceModel, StampContext } from '../devices/device.js';
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
 * ngspice-47 cktload.c conductance (and RHS factor) that pins an `.ic` node
 * during the transient operating point.
 */
export const IC_HOLD_CONDUCTANCE = 1e10;

/**
 * Pseudo-devices that hold every `.ic` node at its value during the
 * transient operating point without UIC (ngspice MODETRANOP, SPICE3
 * semantics). ngspice cktload.c stamps `1e10` on the node diagonal and
 * `1e10 * ic * srcFact` on its RHS; the hold is released at t=0 because only
 * the operating-point solve stamps these devices (#531).
 */
export function initialConditionHolds(compiled: CompiledCircuit): DeviceModel[] {
  const holds: DeviceModel[] = [];
  for (const state of compiled.initialConditions) {
    const index = resolveNodeState(compiled, state);
    if (index >= 0) holds.push(new InitialConditionHold(state.node, index, state.value));
  }
  return holds;
}

class InitialConditionHold implements DeviceModel {
  readonly name: string;
  readonly nodes: number[];
  readonly branches: number[] = [];
  readonly isNonlinear = false;

  constructor(node: string, index: number, private readonly value: number) {
    this.name = `.ic V(${node})`;
    this.nodes = [index];
  }

  stamp(ctx: StampContext): void {
    const node = this.nodes[0];
    ctx.stampG(node, node, IC_HOLD_CONDUCTANCE);
    ctx.stampB(node, IC_HOLD_CONDUCTANCE * this.value * ctx.sourceScale);
  }
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
