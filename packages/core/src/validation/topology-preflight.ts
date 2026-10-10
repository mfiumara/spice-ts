import type { CompiledCircuit } from '../circuit.js';
import type { DeviceModel } from '../devices/device.js';
import { BJT } from '../devices/bjt.js';
import { BSIM3v3 } from '../devices/bsim3v3.js';
import { CCCS } from '../devices/cccs.js';
import { CCVS } from '../devices/ccvs.js';
import { Capacitor } from '../devices/capacitor.js';
import { CurrentSource } from '../devices/current-source.js';
import { Inductor } from '../devices/inductor.js';
import { MOSFET } from '../devices/mosfet.js';
import { VCCS } from '../devices/vccs.js';
import { VCVS } from '../devices/vcvs.js';
import { VoltageSource } from '../devices/voltage-source.js';
import { InvalidCircuitError } from '../errors.js';

const GROUND_INDEX = -1;
const MAX_DETAILS = 32;

export type TopologyFailureKind =
  | 'FLOATING_COMPONENT'
  | 'NO_DC_REFERENCE'
  | 'IDEAL_SOURCE_LOOP';

export type TopologySourcePath = (deviceName: string) => string;

/** A topology failure proven without assembling or solving the MNA system. */
export class TopologyPreflightError extends InvalidCircuitError {
  constructor(
    public readonly kind: TopologyFailureKind,
    public readonly involvedNodes: string[],
    public readonly sourcePaths: string[],
  ) {
    super(topologyMessage(kind));
    this.name = 'TopologyPreflightError';
  }
}

interface IdealEdge {
  device: DeviceModel;
  left: number;
  right: number;
}

interface ForestEdge {
  node: number;
  edge: IdealEdge;
}

/**
 * Reject topology singularities that can be established without numerical solve.
 * Diagnostics are code-point sorted and bounded so identical circuits produce
 * identical protocol details independent of declaration order.
 */
export function preflightTopology(
  compiled: CompiledCircuit,
  sourcePath: TopologySourcePath = compiledDevicePath,
): void {
  const allNodes = [GROUND_INDEX, ...compiled.nodeNames.map((_, index) => index)];
  const physical = graph(allNodes);

  for (const device of compiled.devices) connectAll(physical, device.nodes);

  const physicallyGrounded = reachable(physical, GROUND_INDEX);
  const floating = compiled.nodeNames
    .map((_, index) => index)
    .filter(index => !physicallyGrounded.has(index));
  if (floating.length > 0) {
    throw topologyError('FLOATING_COMPONENT', compiled, floating, sourcePath);
  }

  const needsDcOperatingPoint = compiled.analyses.some(analysis =>
    analysis.type !== 'tran' || !analysis.useInitialConditions,
  );
  if (needsDcOperatingPoint) {
    const dc = graph(allNodes);
    for (const device of compiled.devices) {
      for (const group of dcConnectionGroups(device)) connectAll(dc, group);
    }

    const dcGrounded = reachable(dc, GROUND_INDEX);
    const withoutDcReference = compiled.nodeNames
      .map((_, index) => index)
      .filter(index => !dcGrounded.has(index));
    if (withoutDcReference.length > 0) {
      throw topologyError('NO_DC_REFERENCE', compiled, withoutDcReference, sourcePath);
    }
  }

  const loop = findIdealConstraintLoop(compiled.devices, needsDcOperatingPoint);
  if (loop) {
    const nodes = uniqueSorted(loop.flatMap(edge => [edge.left, edge.right]))
      .map(index => nodeName(compiled, index));
    const paths = sortedBounded(loop.map(edge => sourcePath(edge.device.name)));
    throw new TopologyPreflightError('IDEAL_SOURCE_LOOP', nodes, paths);
  }
}

function topologyError(
  kind: Exclude<TopologyFailureKind, 'IDEAL_SOURCE_LOOP'>,
  compiled: CompiledCircuit,
  nodeIndices: number[],
  sourcePath: TopologySourcePath,
): TopologyPreflightError {
  const invalid = new Set(nodeIndices);
  const involvedNodes = sortedBounded(nodeIndices.map(index => nodeName(compiled, index)));
  const sourcePaths = sortedBounded(compiled.devices
    .filter(device => device.nodes.some(node => invalid.has(node)))
    .map(device => sourcePath(device.name)));
  return new TopologyPreflightError(kind, involvedNodes, sourcePaths);
}

function dcConnectionGroups(device: DeviceModel): number[][] {
  if (
    device instanceof Capacitor
    || device instanceof CurrentSource
    || device instanceof CCCS
  ) return [];

  if (device instanceof VCCS) {
    const [outP, outN, ctrlP, ctrlN] = device.nodes;
    // The control port is high impedance and cannot give either port a DC
    // reference. The one topology-equivalent conductance is a self-controlled
    // VCCS, whose control and output node pairs are identical (in either
    // polarity).
    return outP === ctrlP && outN === ctrlN || outP === ctrlN && outN === ctrlP
      ? [[outP!, outN!]]
      : [];
  }

  if (device instanceof VCVS || device instanceof CCVS) {
    return [device.nodes.slice(0, 2)];
  }

  if (device instanceof MOSFET || device instanceof BSIM3v3) {
    return [[device.nodes[0]!, device.nodes[2]!, device.nodes[3] ?? device.nodes[2]!]];
  }

  if (device instanceof BJT) return [device.nodes];
  return device.nodes.length > 0 ? [device.nodes] : [];
}

function findIdealConstraintLoop(
  devices: DeviceModel[],
  includeInductors: boolean,
): IdealEdge[] | undefined {
  const edges = devices
    .filter(device =>
      device instanceof VoltageSource
      || device instanceof VCVS
      || device instanceof CCVS
      || includeInductors && device instanceof Inductor,
    )
    .map(device => ({ device, left: device.nodes[0]!, right: device.nodes[1]! }))
    .sort((left, right) => compareCodePoints(left.device.name, right.device.name));
  const forest = new Map<number, ForestEdge[]>();

  for (const edge of edges) {
    const path = forestPath(forest, edge.left, edge.right);
    if (path) return [...path, edge];
    addForestEdge(forest, edge.left, edge.right, edge);
    addForestEdge(forest, edge.right, edge.left, edge);
  }
  return undefined;
}

function forestPath(
  forest: Map<number, ForestEdge[]>,
  start: number,
  target: number,
): IdealEdge[] | undefined {
  if (start === target) return [];
  const queue: Array<{ node: number; path: IdealEdge[] }> = [{ node: start, path: [] }];
  const seen = new Set([start]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = [...(forest.get(current.node) ?? [])]
      .sort((left, right) => compareCodePoints(left.edge.device.name, right.edge.device.name));
    for (const next of neighbors) {
      if (seen.has(next.node)) continue;
      const path = [...current.path, next.edge];
      if (next.node === target) return path;
      seen.add(next.node);
      queue.push({ node: next.node, path });
    }
  }
  return undefined;
}

function addForestEdge(
  forest: Map<number, ForestEdge[]>,
  from: number,
  to: number,
  edge: IdealEdge,
): void {
  const neighbors = forest.get(from) ?? [];
  neighbors.push({ node: to, edge });
  forest.set(from, neighbors);
}

function graph(nodes: number[]): Map<number, Set<number>> {
  return new Map(nodes.map(node => [node, new Set<number>()]));
}

function connectAll(adjacency: Map<number, Set<number>>, nodes: readonly number[]): void {
  const unique = [...new Set(nodes)];
  for (let index = 1; index < unique.length; index++) {
    connect(adjacency, unique[0]!, unique[index]!);
  }
}

function connect(adjacency: Map<number, Set<number>>, left: number, right: number): void {
  adjacency.get(left)?.add(right);
  adjacency.get(right)?.add(left);
}

function reachable(adjacency: Map<number, Set<number>>, start: number): Set<number> {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

function nodeName(compiled: CompiledCircuit, index: number): string {
  return index === GROUND_INDEX ? '0' : compiled.nodeNames[index]!;
}

function compiledDevicePath(name: string): string {
  return `/compiled/devices/${jsonPointerSegment(name)}`;
}

function jsonPointerSegment(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function sortedBounded(values: string[]): string[] {
  return [...new Set(values)].sort(compareCodePoints).slice(0, MAX_DETAILS);
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left, character => character.codePointAt(0)!);
  const b = Array.from(right, character => character.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return a.length - b.length;
}

function topologyMessage(kind: TopologyFailureKind): string {
  switch (kind) {
    case 'FLOATING_COMPONENT': return 'Circuit contains a floating connected component';
    case 'NO_DC_REFERENCE': return 'Circuit contains nodes without a DC reference path';
    case 'IDEAL_SOURCE_LOOP': return 'Circuit contains an ideal voltage-source/inductor loop';
  }
}
