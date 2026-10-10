import type { DeviceModel } from './devices/device.js';
import type {
  AnalysisDirective, PoleZeroAnalysis, SensitivityAnalysis, SourceWaveform, ModelParams, SubcktDefinition, StepAnalysis,
  SimulationOptions, NodeInitialState,
} from './types.js';
import type { CircuitIR } from './ir/types.js';
import { buildIR } from './ir/builder.js';
import { Resistor } from './devices/resistor.js';
import { VoltageSource } from './devices/voltage-source.js';
import { CurrentSource } from './devices/current-source.js';
import { Capacitor } from './devices/capacitor.js';
import { Inductor } from './devices/inductor.js';
import { MutualInductor } from './devices/mutual-inductor.js';
import { Diode } from './devices/diode.js';
import { BJT } from './devices/bjt.js';
import { MOSFET } from './devices/mosfet.js';
import { JFET, resolveNJFETParams } from './devices/jfet.js';
import { BSIM3v3 } from './devices/bsim3v3.js';
import { VCCS } from './devices/vccs.js';
import { VCVS } from './devices/vcvs.js';
import { CCCS } from './devices/cccs.js';
import { CCVS } from './devices/ccvs.js';
import { GROUND_NODE } from './types.js';
import { evaluateExpression } from './parser/expression.js';
import { parseNumber, tokenizeNetlist } from './parser/tokenizer.js';
import { parseModelCard } from './parser/model-parser.js';
import { parseSourceWaveform, parseInstanceParams } from './parser/waveform-parser.js';
import { parsePassiveElement } from './parser/passive-parser.js';
import {
  parseDiodeInstanceParams,
  type DiodeInstanceParams,
} from './parser/diode-parser.js';
import { assertSupportedPoleZero } from './validation/pole-zero.js';
import { assertSupportedSensitivity } from './validation/sensitivity.js';
import {
  resolveCapacitance,
  resolveCapacitorModel,
  resolveInductance,
  resolveInductorModel,
  type ResolvedCapacitorModel,
  type ResolvedInductorModel,
} from './devices/passive-model.js';
import { CycleError, InvalidCircuitError } from './errors.js';

/**
 * The compiled representation of a circuit, ready for numerical simulation.
 *
 * Produced by {@link Circuit.compile}. Contains instantiated device models,
 * node/branch mappings, and analysis commands.
 */
export interface CompiledCircuit {
  /** Instantiated device models with resolved node indices */
  devices: DeviceModel[];
  /** Number of non-ground nodes */
  nodeCount: number;
  /** Number of MNA branches (voltage sources, inductors, controlled sources) */
  branchCount: number;
  /** Ordered list of node names (excludes ground) */
  nodeNames: string[];
  /** Map from node name to its matrix index (-1 for ground) */
  nodeIndexMap: Map<string, number>;
  /** Ordered list of branch names */
  branchNames: string[];
  /** Analysis commands to execute */
  analyses: AnalysisDirective[];
  /** Bounded native pole-zero commands, kept outside adapters without `.pz` result support. */
  poleZeroAnalyses: PoleZeroAnalysis[];
  /** Device model parameter cards */
  models: Map<string, ModelParams>;
  /** Subcircuit definitions */
  subcircuits: Map<string, SubcktDefinition>;
  /** Step directives for parametric sweeps */
  steps: StepAnalysis[];
  /** Solver options declared by `.options` cards in the netlist */
  simulationOptions: SimulationOptions;
  /** Node voltages from `.ic`; forced only for transient UIC, otherwise Newton guesses. */
  initialConditions: NodeInitialState[];
  /** Node-voltage Newton guesses from `.nodeset`. */
  nodeSets: NodeInitialState[];
}

interface DeviceDescriptor {
  type: string;
  name: string;
  nodes: string[];
  value?: number;
  waveform?: Partial<SourceWaveform> & { dc?: number };
  modelName?: string;
  params?: Record<string, number>;
  controlSource?: string;
  /** Volts for capacitors, amps for inductors. */
  ic?: number;
  coupledA?: string;
  coupledB?: string;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toString() : String(value);
}

function formatParams(params?: Record<string, number>): string {
  if (!params) return '';
  return Object.entries(params)
    .map(([key, value]) => `${key}=${formatNumber(value)}`)
    .join(' ');
}

function formatModel(model: ModelParams): string {
  const params = formatParams(model.params);
  return params
    ? `.model ${model.name} ${model.type} (${params})`
    : `.model ${model.name} ${model.type}`;
}

function formatWaveform(wf?: Partial<SourceWaveform> & { dc?: number }): string {
  if (!wf) return 'DC 0';
  if (!wf.type) return wf.dc !== undefined ? `DC ${formatNumber(wf.dc)}` : 'DC 0';

  switch (wf.type) {
    case 'dc':
      return `DC ${formatNumber(wf.value ?? 0)}`;
    case 'ac': {
      const ac = `AC ${formatNumber(wf.magnitude ?? 1)} ${formatNumber(wf.phase ?? 0)}`;
      return wf.dc !== undefined ? `DC ${formatNumber(wf.dc)} ${ac}` : ac;
    }
    case 'pulse':
      return `PULSE(${[
        wf.v1 ?? 0,
        wf.v2 ?? 0,
        wf.delay ?? 0,
        wf.rise ?? 1e-12,
        wf.fall ?? 1e-12,
        wf.width ?? Infinity,
        wf.period ?? Infinity,
      ].map(formatNumber).join(' ')})`;
    case 'sin':
      return `SIN(${[
        wf.offset ?? 0,
        wf.amplitude ?? 0,
        wf.frequency ?? 0,
        wf.delay,
        wf.damping,
        wf.phase,
      ].filter(v => v !== undefined).map(v => formatNumber(v as number)).join(' ')})`;
    case 'pwl':
      return `PWL(${(wf.points ?? [])
        .flatMap(point => [point.time, point.value])
        .map(formatNumber)
        .join(' ')})`;
    default:
      return 'DC 0';
  }
}

function formatDevice(desc: DeviceDescriptor): string {
  const params = formatParams(desc.params);
  const tail = params ? ` ${params}` : '';

  switch (desc.type) {
    case 'R':
      return `${desc.name} ${desc.nodes[0]} ${desc.nodes[1]} ${formatNumber(desc.value ?? 0)}`;
    case 'C':
    case 'L': {
      const value = desc.value !== undefined ? formatNumber(desc.value) : undefined;
      const valueAndModel = [value, desc.modelName].filter(Boolean).join(' ');
      const ic = desc.ic === undefined ? '' : ` IC=${formatNumber(desc.ic)}`;
      return `${desc.name} ${desc.nodes[0]} ${desc.nodes[1]} ${valueAndModel || '0'}${tail}${ic}`;
    }
    case 'K':
      return `${desc.name} ${desc.coupledA} ${desc.coupledB} ${formatNumber(desc.value ?? 0)}`;
    case 'V':
    case 'I':
      return `${desc.name} ${desc.nodes[0]} ${desc.nodes[1]} ${formatWaveform(desc.waveform)}`;
    case 'D':
      return `${desc.name} ${desc.nodes[0]} ${desc.nodes[1]} ${desc.modelName ?? ''}${tail}`.trim();
    case 'Q':
      return `${desc.name} ${desc.nodes[0]} ${desc.nodes[1]} ${desc.nodes[2]} ${desc.modelName ?? ''}`.trim();
    case 'J':
      return `${desc.name} ${desc.nodes[0]} ${desc.nodes[1]} ${desc.nodes[2]} ${desc.modelName ?? ''}`.trim();
    case 'M':
      return `${desc.name} ${desc.nodes.join(' ')} ${desc.modelName ?? ''}${tail}`.trim();
    case 'E':
    case 'G':
      return `${desc.name} ${desc.nodes.join(' ')} ${formatNumber(desc.value ?? 0)}`;
    case 'F':
    case 'H':
      return `${desc.name} ${desc.nodes[0]} ${desc.nodes[1]} ${desc.controlSource ?? ''} ${formatNumber(desc.value ?? 0)}`.trim();
    case 'X':
      return `${desc.name} ${desc.nodes.join(' ')} ${desc.modelName ?? ''}${tail}`.trim();
    default:
      return `${desc.name} ${desc.nodes.join(' ')}`;
  }
}

function formatAnalysis(analysis: AnalysisDirective | PoleZeroAnalysis): string {
  switch (analysis.type) {
    case 'op':
      return '.op';
    case 'dc':
      return `.dc ${analysis.source} ${formatNumber(analysis.start)} ${formatNumber(analysis.stop)} ${formatNumber(analysis.step)}`;
    case 'tran': {
      const parts = ['.tran', formatNumber(analysis.timestep), formatNumber(analysis.stopTime)];
      if (analysis.startTime !== undefined) parts.push(formatNumber(analysis.startTime));
      if (analysis.maxTimestep !== undefined) parts.push(formatNumber(analysis.maxTimestep));
      if (analysis.useInitialConditions) parts.push('UIC');
      return parts.join(' ');
    }
    case 'ac':
      return `.ac ${analysis.variation} ${analysis.points} ${formatNumber(analysis.startFreq)} ${formatNumber(analysis.stopFreq)}`;
    case 'noise':
      return `.noise v(${analysis.outputNode}) ${analysis.inputSource} ${analysis.variation} ${analysis.points} ${formatNumber(analysis.startFreq)} ${formatNumber(analysis.stopFreq)}`;
    case 'tf':
      return `.tf v(${analysis.outputNode}) ${analysis.inputSource}`;
    case 'pz':
      return `.pz ${analysis.inputPositive} ${analysis.inputNegative} ${analysis.outputPositive} ${analysis.outputNegative} ${analysis.inputType} ${analysis.mode}`;
    case 'sens':
      return analysis.mode === 'dc'
        ? `.sens v(${analysis.outputNode})`
        : `.sens v(${analysis.outputNode}) ac dec ${analysis.points} ${formatNumber(analysis.startFreq)} ${formatNumber(analysis.stopFreq)}`;
  }
}

function formatStep(step: StepAnalysis): string {
  if (step.sweepMode === 'list') {
    return `.step ${step.param} LIST ${(step.values ?? []).map(formatNumber).join(' ')}`;
  }
  if (step.sweepMode === 'lin') {
    return `.step ${step.param} ${formatNumber(step.start ?? 0)} ${formatNumber(step.stop ?? 0)} ${formatNumber(step.increment ?? 0)}`;
  }
  return `.step ${step.sweepMode.toUpperCase()} ${step.param} ${formatNumber(step.start ?? 0)} ${formatNumber(step.stop ?? 0)} ${step.points ?? 0}`;
}

function isPositiveFinite(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

function hasCapacitorParasitics(model: ResolvedCapacitorModel): boolean {
  return isPositiveFinite(model.seriesResistance)
    || isPositiveFinite(model.seriesInductance)
    || isPositiveFinite(model.parallelResistance);
}

function hasInductorParasitics(model: ResolvedInductorModel): boolean {
  return isPositiveFinite(model.seriesResistance)
    || isPositiveFinite(model.parallelResistance)
    || isPositiveFinite(model.parallelCapacitance);
}

function internalNodeName(deviceName: string, suffix: string): string {
  return `${deviceName}.${suffix}`;
}

/**
 * Programmatic circuit builder for constructing SPICE circuits without a netlist.
 *
 * Add devices, models, subcircuits, and analysis commands via the `add*` methods,
 * then call {@link Circuit.compile} to produce a {@link CompiledCircuit} for simulation.
 *
 * @example
 * ```ts
 * const ckt = new Circuit();
 * ckt.addVoltageSource('V1', 'in', '0', { dc: 5 });
 * ckt.addResistor('R1', 'in', 'out', 1000);
 * ckt.addResistor('R2', 'out', '0', 1000);
 * ckt.addAnalysis('op');
 * const result = await simulate(ckt);
 * ```
 */
export class Circuit {
  private descriptors: DeviceDescriptor[] = [];
  private _analyses: AnalysisDirective[] = [];
  private _poleZeroAnalyses: PoleZeroAnalysis[] = [];
  private _steps: StepAnalysis[] = [];
  private _models = new Map<string, ModelParams>();
  private _subcircuits = new Map<string, SubcktDefinition>();
  private _simulationOptions: SimulationOptions = {};
  private _initialConditions: NodeInitialState[] = [];
  private _nodeSets: NodeInitialState[] = [];
  private nodeSet = new Set<string>();

  get analyses(): AnalysisDirective[] {
    return this._analyses;
  }

  get poleZeroAnalyses(): PoleZeroAnalysis[] {
    return this._poleZeroAnalyses;
  }

  get simulationOptions(): Readonly<SimulationOptions> {
    return { ...this._simulationOptions };
  }

  setSimulationOptions(options: SimulationOptions): void {
    this._simulationOptions = { ...this._simulationOptions, ...options };
  }

  get initialConditions(): readonly NodeInitialState[] {
    return this._initialConditions;
  }

  get nodeSets(): readonly NodeInitialState[] {
    return this._nodeSets;
  }

  get nodeCount(): number {
    const nodes = new Set(this.nodeSet);
    nodes.delete(GROUND_NODE);
    return nodes.size;
  }

  get branchCount(): number {
    return this.descriptors.filter(d =>
      d.type === 'V' || d.type === 'L' || d.type === 'E' || d.type === 'H',
    ).length;
  }

  getNodeIndex(name: string): number {
    if (name === GROUND_NODE) return -1;
    const nodes = [...this.nodeSet].filter(n => n !== GROUND_NODE).sort();
    return nodes.indexOf(name);
  }

  /**
   * Add a resistor to the circuit.
   *
   * @param name - Device name (e.g., `'R1'`)
   * @param nodePos - Positive terminal node
   * @param nodeNeg - Negative terminal node
   * @param resistance - Resistance value in ohms
   */
  addResistor(name: string, nodePos: string, nodeNeg: string, resistance: number): void {
    this.nodeSet.add(nodePos);
    this.nodeSet.add(nodeNeg);
    this.descriptors.push({ type: 'R', name, nodes: [nodePos, nodeNeg], value: resistance });
  }

  /**
   * Add a capacitor to the circuit.
   *
   * @param name - Device name (e.g., `'C1'`)
   * @param nodePos - Positive terminal node
   * @param nodeNeg - Negative terminal node
   * @param capacitance - Capacitance value in farads. Omit when using a `.model C` card value.
   * @param modelName - Optional name of a `.model C` card
   * @param instanceParams - Per-instance model parameters (e.g., `{ L: 10e-6, W: 1e-6, M: 2 }`)
   */
  addCapacitor(
    name: string,
    nodePos: string,
    nodeNeg: string,
    capacitance?: number,
    modelName?: string,
    instanceParams?: Record<string, number>,
    ic?: number,
  ): void {
    this.nodeSet.add(nodePos);
    this.nodeSet.add(nodeNeg);
    this.descriptors.push({
      type: 'C',
      name,
      nodes: [nodePos, nodeNeg],
      value: capacitance,
      modelName,
      params: instanceParams,
      ic,
    });
  }

  /**
   * Add an inductor to the circuit.
   *
   * @param name - Device name (e.g., `'L1'`)
   * @param nodePos - Positive terminal node
   * @param nodeNeg - Negative terminal node
   * @param inductance - Inductance value in henries. Omit when using a `.model L` card value.
   * @param modelName - Optional name of a `.model L` card
   * @param instanceParams - Per-instance model parameters (e.g., `{ NT: 10, SCALE: 2 }`)
   */
  addInductor(
    name: string,
    nodePos: string,
    nodeNeg: string,
    inductance?: number,
    modelName?: string,
    instanceParams?: Record<string, number>,
    ic?: number,
  ): void {
    this.nodeSet.add(nodePos);
    this.nodeSet.add(nodeNeg);
    this.descriptors.push({
      type: 'L',
      name,
      nodes: [nodePos, nodeNeg],
      value: inductance,
      modelName,
      params: instanceParams,
      ic,
    });
  }

  /** Add a SPICE K-element coupling two previously declared inductors. */
  addInductorCoupling(name: string, indA: string, indB: string, coupling: number): void {
    this.descriptors.push({
      type: 'K', name, nodes: [], value: coupling,
      coupledA: indA, coupledB: indB,
    });
  }

  /**
   * Add a voltage source to the circuit.
   *
   * @param name - Device name (e.g., `'V1'`)
   * @param nodePos - Positive terminal node
   * @param nodeNeg - Negative terminal node
   * @param waveform - Source waveform specification (DC, pulse, sine, or AC)
   */
  addVoltageSource(
    name: string, nodePos: string, nodeNeg: string,
    waveform: Partial<SourceWaveform> & { dc?: number },
  ): void {
    this.nodeSet.add(nodePos);
    this.nodeSet.add(nodeNeg);
    this.descriptors.push({ type: 'V', name, nodes: [nodePos, nodeNeg], waveform });
  }

  /**
   * Add a current source to the circuit.
   *
   * @param name - Device name (e.g., `'I1'`)
   * @param nodePos - Positive terminal node (current flows from pos to neg)
   * @param nodeNeg - Negative terminal node
   * @param waveform - Source waveform specification (DC, pulse, sine, or AC)
   */
  addCurrentSource(
    name: string, nodePos: string, nodeNeg: string,
    waveform: Partial<SourceWaveform> & { dc?: number },
  ): void {
    this.nodeSet.add(nodePos);
    this.nodeSet.add(nodeNeg);
    this.descriptors.push({ type: 'I', name, nodes: [nodePos, nodeNeg], waveform });
  }

  /**
   * Add a voltage-controlled voltage source (VCVS, E-element).
   *
   * @param name - Device name (e.g., `'E1'`)
   * @param nOutP - Positive output node
   * @param nOutN - Negative output node
   * @param nCtrlP - Positive control (sensing) node
   * @param nCtrlN - Negative control (sensing) node
   * @param gain - Voltage gain (V/V)
   */
  addVCVS(name: string, nOutP: string, nOutN: string, nCtrlP: string, nCtrlN: string, gain: number): void {
    this.nodeSet.add(nOutP);
    this.nodeSet.add(nOutN);
    this.nodeSet.add(nCtrlP);
    this.nodeSet.add(nCtrlN);
    this.descriptors.push({ type: 'E', name, nodes: [nOutP, nOutN, nCtrlP, nCtrlN], value: gain });
  }

  /**
   * Add a voltage-controlled current source (VCCS, G-element).
   *
   * @param name - Device name (e.g., `'G1'`)
   * @param nOutP - Positive output node
   * @param nOutN - Negative output node
   * @param nCtrlP - Positive control (sensing) node
   * @param nCtrlN - Negative control (sensing) node
   * @param gm - Transconductance (A/V)
   */
  addVCCS(name: string, nOutP: string, nOutN: string, nCtrlP: string, nCtrlN: string, gm: number): void {
    this.nodeSet.add(nOutP);
    this.nodeSet.add(nOutN);
    this.nodeSet.add(nCtrlP);
    this.nodeSet.add(nCtrlN);
    this.descriptors.push({ type: 'G', name, nodes: [nOutP, nOutN, nCtrlP, nCtrlN], value: gm });
  }

  /**
   * Add a current-controlled voltage source (CCVS, H-element).
   *
   * @param name - Device name (e.g., `'H1'`)
   * @param nOutP - Positive output node
   * @param nOutN - Negative output node
   * @param controlSource - Name of the voltage source whose current controls this device
   * @param gain - Transresistance (V/A)
   */
  addCCVS(name: string, nOutP: string, nOutN: string, controlSource: string, gain: number): void {
    this.nodeSet.add(nOutP);
    this.nodeSet.add(nOutN);
    this.descriptors.push({ type: 'H', name, nodes: [nOutP, nOutN], value: gain, controlSource });
  }

  /**
   * Add a current-controlled current source (CCCS, F-element).
   *
   * @param name - Device name (e.g., `'F1'`)
   * @param nOutP - Positive output node
   * @param nOutN - Negative output node
   * @param controlSource - Name of the voltage source whose current controls this device
   * @param gain - Current gain (A/A)
   */
  addCCCS(name: string, nOutP: string, nOutN: string, controlSource: string, gain: number): void {
    this.nodeSet.add(nOutP);
    this.nodeSet.add(nOutN);
    this.descriptors.push({ type: 'F', name, nodes: [nOutP, nOutN], value: gain, controlSource });
  }

  /**
   * Add a diode to the circuit.
   *
   * @param name - Device name (e.g., `'D1'`)
   * @param nodeAnode - Anode node
   * @param nodeCathode - Cathode node
   * @param modelName - Name of a `.model D` card (optional; uses default diode model if omitted)
   * @param instanceParams - Per-instance geometry (`AREA`, `PJ`, and multiplier `M`)
   */
  addDiode(
    name: string,
    nodeAnode: string,
    nodeCathode: string,
    modelName?: string,
    instanceParams?: DiodeInstanceParams,
  ): void {
    this.nodeSet.add(nodeAnode);
    this.nodeSet.add(nodeCathode);
    this.descriptors.push({
      type: 'D',
      name,
      nodes: [nodeAnode, nodeCathode],
      modelName,
      params: instanceParams ? { ...instanceParams } : undefined,
    });
  }

  /**
   * Add a bipolar junction transistor (BJT) to the circuit.
   *
   * @param name - Device name (e.g., `'Q1'`)
   * @param nodeCollector - Collector node
   * @param nodeBase - Base node
   * @param nodeEmitter - Emitter node
   * @param modelName - Name of a `.model NPN` or `.model PNP` card
   */
  addBJT(name: string, nodeCollector: string, nodeBase: string, nodeEmitter: string, modelName: string): void {
    this.nodeSet.add(nodeCollector);
    this.nodeSet.add(nodeBase);
    this.nodeSet.add(nodeEmitter);
    this.descriptors.push({ type: 'Q', name, nodes: [nodeCollector, nodeBase, nodeEmitter], modelName });
  }

  /** Add a bounded level-1 N-channel junction field-effect transistor. */
  addJFET(name: string, nodeDrain: string, nodeGate: string, nodeSource: string, modelName: string): void {
    this.nodeSet.add(nodeDrain);
    this.nodeSet.add(nodeGate);
    this.nodeSet.add(nodeSource);
    this.descriptors.push({
      type: 'J', name, nodes: [nodeDrain, nodeGate, nodeSource], modelName,
    });
  }

  /**
   * Add a MOSFET to the circuit.
   *
   * Supports Level 1 (Shichman-Hodges) and Level 49/8 (BSIM3v3) models.
   *
   * @param name - Device name (e.g., `'M1'`)
   * @param nodeDrain - Drain node
   * @param nodeGate - Gate node
   * @param nodeSource - Source node
   * @param modelName - Name of a `.model NMOS` or `.model PMOS` card
   * @param instanceParams - Per-instance parameters (e.g., `{ W: 1e-6, L: 0.18e-6 }`)
   * @param nodeBulk - Bulk/body node (optional; defaults to source if omitted)
   */
  addMOSFET(
    name: string,
    nodeDrain: string, nodeGate: string, nodeSource: string,
    modelName: string,
    instanceParams?: Record<string, number>,
    nodeBulk?: string,
  ): void {
    this.nodeSet.add(nodeDrain);
    this.nodeSet.add(nodeGate);
    this.nodeSet.add(nodeSource);
    if (nodeBulk) this.nodeSet.add(nodeBulk);
    this.descriptors.push({
      type: 'M', name,
      nodes: nodeBulk ? [nodeDrain, nodeGate, nodeSource, nodeBulk] : [nodeDrain, nodeGate, nodeSource],
      modelName, params: instanceParams,
    });
  }

  /**
   * Register a subcircuit definition for later instantiation with {@link addSubcircuitInstance}.
   *
   * @param def - Subcircuit definition (name, ports, default parameters, and body lines)
   */
  addSubcircuit(def: SubcktDefinition): void {
    this._subcircuits.set(def.name.toUpperCase(), def);
  }

  /**
   * Instantiate a subcircuit (X-element).
   *
   * The subcircuit must have been previously registered via {@link addSubcircuit}.
   * Internal nodes are automatically prefixed with the instance name.
   *
   * @param name - Instance name (e.g., `'X1'`)
   * @param ports - Actual node names to connect to the subcircuit's ports
   * @param subcktName - Name of the subcircuit definition to instantiate
   * @param params - Parameter overrides for this instance
   */
  addSubcircuitInstance(
    name: string,
    ports: string[],
    subcktName: string,
    params?: Record<string, number>,
  ): void {
    for (const p of ports) this.nodeSet.add(p);
    this.descriptors.push({
      type: 'X', name, nodes: ports, modelName: subcktName, params,
    });
  }

  /**
   * Register a device model parameter card (`.model`).
   *
   * @param params - Model parameters including name, type (e.g., `'NPN'`, `'NMOS'`), and parameter values
   */
  addModel(params: ModelParams): void {
    this._models.set(params.name, params);
  }

  /**
   * Add a simulation analysis command to the circuit.
   *
   * @param type - Analysis type: `'op'` (DC operating point), `'dc'` (DC sweep),
   *   `'tran'` (transient), or `'ac'` (AC small-signal)
   * @param params - Analysis-specific parameters (not required for `'op'`)
   */
  addAnalysis(type: 'op'): void;
  addAnalysis(type: 'dc', params: { source: string; start: number; stop: number; step: number }): void;
  addAnalysis(type: 'tran', params: { timestep: number; stopTime: number; startTime?: number; maxTimestep?: number; useInitialConditions?: boolean }): void;
  addAnalysis(type: 'ac', params: { variation: 'dec' | 'oct' | 'lin'; points: number; startFreq: number; stopFreq: number }): void;
  addAnalysis(type: 'noise', params: { outputNode: string; inputSource: string; variation: 'dec' | 'oct' | 'lin'; points: number; startFreq: number; stopFreq: number }): void;
  addAnalysis(type: 'tf', params: { outputNode: string; inputSource: string }): void;
  addAnalysis(type: 'pz', params: { inputPositive: string; inputNegative: string; outputPositive: string; outputNegative: string; inputType: 'cur'; mode: 'pol' | 'pz' }): void;
  addAnalysis(type: 'sens', params: { outputNode: string; mode: 'dc' }): void;
  addAnalysis(type: 'sens', params: { outputNode: string; mode: 'ac'; variation: 'dec'; points: number; startFreq: number; stopFreq: number }): void;
  addAnalysis(type: string, params?: Record<string, unknown>): void {
    switch (type) {
      case 'op':
        this._analyses.push({ type: 'op' });
        break;
      case 'dc':
        this._analyses.push({
          type: 'dc',
          source: params!.source as string,
          start: params!.start as number,
          stop: params!.stop as number,
          step: params!.step as number,
        });
        break;
      case 'tran': {
        const tranCmd: { type: 'tran'; timestep: number; stopTime: number; startTime?: number; maxTimestep?: number; useInitialConditions?: boolean } = {
          type: 'tran',
          timestep: params!.timestep as number,
          stopTime: params!.stopTime as number,
        };
        if (params?.startTime !== undefined) tranCmd.startTime = params.startTime as number;
        if (params?.maxTimestep !== undefined) tranCmd.maxTimestep = params.maxTimestep as number;
        if (params?.useInitialConditions) tranCmd.useInitialConditions = true;
        this._analyses.push(tranCmd);
        break;
      }
      case 'ac':
        this._analyses.push({
          type: 'ac',
          variation: params!.variation as 'dec' | 'oct' | 'lin',
          points: params!.points as number,
          startFreq: params!.startFreq as number,
          stopFreq: params!.stopFreq as number,
        });
        break;
      case 'noise':
        this._analyses.push({
          type: 'noise',
          outputNode: params!.outputNode as string,
          inputSource: params!.inputSource as string,
          variation: params!.variation as 'dec' | 'oct' | 'lin',
          points: params!.points as number,
          startFreq: params!.startFreq as number,
          stopFreq: params!.stopFreq as number,
        });
        break;
      case 'tf':
        this._analyses.push({
          type: 'tf',
          outputNode: params!.outputNode as string,
          inputSource: params!.inputSource as string,
        });
        break;
      case 'pz':
        if (this._steps.length > 0) {
          throw new InvalidCircuitError('.step cannot be combined with .pz');
        }
        const analysis: PoleZeroAnalysis = {
          type: 'pz',
          inputPositive: params!.inputPositive as string,
          inputNegative: params!.inputNegative as string,
          outputPositive: params!.outputPositive as string,
          outputNegative: params!.outputNegative as string,
          inputType: params!.inputType as 'cur',
          mode: params!.mode as 'pol' | 'pz',
        };
        assertSupportedPoleZero(analysis);
        this._poleZeroAnalyses.push(analysis);
        break;
      case 'sens': {
        if (this._steps.length > 0) {
          throw new InvalidCircuitError('.step cannot be combined with .sens');
        }
        if (this._analyses.some(existing => existing.type === 'sens')) {
          throw new InvalidCircuitError('Multiple .sens analyses are not supported');
        }
        const analysis = { type: 'sens', ...params } as SensitivityAnalysis;
        assertSupportedSensitivity(analysis);
        this._analyses.push(analysis);
        break;
      }
    }
  }

  /** Add a node voltage from `.ic` or `.nodeset`. */
  addInitialState(kind: 'ic' | 'nodeset', state: NodeInitialState): void {
    const target = kind === 'ic' ? this._initialConditions : this._nodeSets;
    const normalizedNode = state.node.toLowerCase();
    const existing = target.findIndex(entry => entry.node.toLowerCase() === normalizedNode);
    if (existing >= 0) target[existing] = state;
    else target.push(state);
  }

  /**
   * Add a .step parametric sweep directive.
   *
   * @param param - Device name to sweep (e.g., 'R1')
   * @param opts - Sweep configuration
   */
  addStep(param: string, opts: {
    mode?: 'lin' | 'dec' | 'oct';
    start?: number;
    stop?: number;
    step?: number;
    points?: number;
    values?: number[];
  }): void {
    if (this._poleZeroAnalyses.length > 0) {
      throw new InvalidCircuitError('.step cannot be combined with .pz');
    }
    if (this._analyses.some(analysis => analysis.type === 'sens')) {
      throw new InvalidCircuitError('.step cannot be combined with .sens');
    }
    if (opts.values) {
      this._steps.push({ type: 'step', param, sweepMode: 'list', values: opts.values });
    } else {
      const sweepMode = opts.mode ?? 'lin';
      this._steps.push({
        type: 'step', param, sweepMode,
        start: opts.start, stop: opts.stop,
        increment: sweepMode === 'lin' ? opts.step : undefined,
        points: sweepMode !== 'lin' ? opts.points : undefined,
      });
    }
  }

  /**
   * Convert the circuit to an intermediate representation (IR).
   *
   * The IR is a flat, serialisable snapshot of every component with named ports,
   * typed parameters, and human-readable display values. It is suitable for
   * visualisation, export, or further transformation without running a simulation.
   *
   * @returns A {@link CircuitIR} with components and net names
   */
  toIR(): CircuitIR {
    return buildIR(this.descriptors, this._models);
  }

  /**
   * Serialize the programmatic circuit to a SPICE-like netlist.
   *
   * This is primarily used by external simulator backends that consume text
   * netlists. Raw subcircuit bodies are preserved exactly as registered.
   */
  toNetlist(): string {
    const lines: string[] = ['* spice-ts generated netlist'];

    const optionNames: Array<[keyof SimulationOptions, string, (value: unknown) => string]> = [
      ['abstol', 'abstol', String],
      ['vntol', 'vntol', String],
      ['reltol', 'reltol', String],
      ['gmin', 'gmin', String],
      ['maxIterations', 'itl1', String],
      ['maxTransientIterations', 'itl4', String],
      ['integrationMethod', 'method', value => value === 'trapezoidal' ? 'trap' : value === 'gear2' ? 'gear' : String(value)],
      ['trtol', 'trtol', String],
    ];
    const serializedOptions = optionNames.flatMap(([key, name, format]) => {
      const value = this._simulationOptions[key];
      return value === undefined ? [] : [`${name}=${format(value)}`];
    });
    if (serializedOptions.length > 0) lines.push(`.options ${serializedOptions.join(' ')}`);

    for (const model of this._models.values()) {
      lines.push(formatModel(model));
    }

    for (const subckt of this._subcircuits.values()) {
      const params = formatParams(subckt.params);
      const header = `.subckt ${subckt.name} ${subckt.ports.join(' ')}${params ? ` ${params}` : ''}`;
      lines.push(header.trim());
      lines.push(...subckt.body);
      lines.push(`.ends ${subckt.name}`);
    }

    for (const desc of this.descriptors) {
      lines.push(formatDevice(desc));
    }

    if (this._initialConditions.length > 0) {
      lines.push(`.ic ${this._initialConditions.map(state => `V(${state.node})=${formatNumber(state.value)}`).join(' ')}`);
    }
    if (this._nodeSets.length > 0) {
      lines.push(`.nodeset ${this._nodeSets.map(state => `V(${state.node})=${formatNumber(state.value)}`).join(' ')}`);
    }

    for (const step of this._steps) {
      lines.push(formatStep(step));
    }

    for (const analysis of this._analyses) {
      lines.push(formatAnalysis(analysis));
    }
    for (const analysis of this._poleZeroAnalyses) {
      lines.push(formatAnalysis(analysis));
    }

    lines.push('.end');
    return lines.join('\n');
  }

  /**
   * Compile the circuit into a form ready for numerical simulation.
   *
   * Expands subcircuit instances, assigns node indices, instantiates device
   * models, and resolves model parameter cards.
   *
   * @returns A {@link CompiledCircuit} with device models and node/branch mappings
   * @throws Error if a referenced subcircuit or control source is undefined
   * @throws {@link CycleError} if subcircuit instances form a circular dependency
   */
  compile(): CompiledCircuit {
    // Pre-expand subcircuit instances into flat device descriptors
    const expandedDescriptors = this.expandPassiveParasitics(this.expandAllSubcircuits());

    // Collect all nodes from expanded descriptors
    for (const desc of expandedDescriptors) {
      for (const n of desc.nodes) {
        this.nodeSet.add(n);
      }
    }

    const nodeNames = [...this.nodeSet].filter(n => n !== GROUND_NODE).sort();
    const nodeIndexMap = new Map<string, number>();
    nodeNames.forEach((name, i) => nodeIndexMap.set(name, i));
    nodeIndexMap.set(GROUND_NODE, -1);

    const nodeCount = nodeNames.length;
    let branchIndex = 0;
    const branchNames: string[] = [];

    const resolveNode = (name: string): number => {
      if (name === GROUND_NODE) return -1;
      return nodeIndexMap.get(name)!;
    };

    const resolveWaveform = (wf?: Partial<SourceWaveform> & { dc?: number }): SourceWaveform => {
      if (!wf) return { type: 'dc', value: 0 };
      if (wf.type === 'ac') {
        return {
          type: 'ac',
          dc: wf.dc ?? 0,
          magnitude: wf.magnitude ?? 1,
          phase: wf.phase ?? 0,
        };
      }
      if (wf.type) return wf as SourceWaveform;
      if (wf.dc !== undefined) return { type: 'dc', value: wf.dc };
      return { type: 'dc', value: 0 };
    };

    const devices: DeviceModel[] = [];
    const deviceMap = new Map<string, DeviceModel>();

    for (const desc of expandedDescriptors) {
      const nodeIndices = desc.nodes.map(resolveNode);
      const prevLength = devices.length;

      switch (desc.type) {
        case 'R': {
          // A zero-ohm resistor is an ideal voltage constraint, not infinite
          // conductance. Give it an MNA branch so its equation and current are
          // represented exactly. Stepped resistors also use branch form because
          // their value may cross zero without changing matrix topology.
          const usesBranch = desc.value === 0 || this._steps.some(step => step.param === desc.name);
          const bi = usesBranch ? branchIndex++ : undefined;
          if (bi !== undefined) branchNames.push(desc.name);
          devices.push(new Resistor(desc.name, nodeIndices, desc.value!, bi));
          break;
        }
        case 'V': {
          const bi = branchIndex++;
          branchNames.push(desc.name);
          devices.push(new VoltageSource(desc.name, nodeIndices, bi, resolveWaveform(desc.waveform)));
          break;
        }
        case 'I':
          devices.push(new CurrentSource(desc.name, nodeIndices, resolveWaveform(desc.waveform)));
          break;
        case 'C': {
          const model = desc.modelName ? this._models.get(desc.modelName) : undefined;
          if (desc.modelName && !model) {
            throw new Error(`Capacitor '${desc.name}' references unknown model '${desc.modelName}'`);
          }
          const { value } = resolveCapacitance(desc.value, model, desc.params);
          devices.push(new Capacitor(desc.name, nodeIndices, value, desc.ic));
          break;
        }
        case 'L': {
          const model = desc.modelName ? this._models.get(desc.modelName) : undefined;
          if (desc.modelName && !model) {
            throw new Error(`Inductor '${desc.name}' references unknown model '${desc.modelName}'`);
          }
          const { value } = resolveInductance(desc.value, model, desc.params);
          const bi = branchIndex++;
          branchNames.push(desc.name);
          devices.push(new Inductor(desc.name, nodeIndices, bi, value, desc.ic));
          break;
        }
        case 'K': {
          const indA = deviceMap.get(desc.coupledA!);
          const indB = deviceMap.get(desc.coupledB!);
          if (!(indA instanceof Inductor) || !(indB instanceof Inductor)) {
            throw new Error(
              `K-element '${desc.name}' references unknown or non-inductor device(s): ${desc.coupledA}, ${desc.coupledB}`,
            );
          }
          devices.push(new MutualInductor(desc.name, indA, indB, desc.value!));
          break;
        }
        case 'D': {
          const modelName = desc.modelName;
          const modelParams = modelName ? this._models.get(modelName)?.params ?? {} : {};
          const { RS: seriesResistanceOverride, ...instanceParams } = desc.params ?? {};
          const hasExpandedSeriesResistance = isPositiveFinite(modelParams.RS)
            && seriesResistanceOverride === 0;
          devices.push(new Diode(
            desc.name,
            nodeIndices,
            seriesResistanceOverride === undefined
              ? modelParams
              : { ...modelParams, RS: seriesResistanceOverride },
            hasExpandedSeriesResistance,
            instanceParams,
          ));
          break;
        }
        case 'Q': {
          const modelName = desc.modelName;
          const model = modelName ? this._models.get(modelName) : undefined;
          const modelParams = model?.params ?? {};
          const polarity = model?.type === 'PNP' ? -1 : 1;
          devices.push(new BJT(desc.name, nodeIndices, { ...modelParams, polarity }));
          break;
        }
        case 'J': {
          const modelName = desc.modelName!;
          const model = this._models.get(modelName);
          if (!model) throw new Error(`JFET '${desc.name}' references unknown model '${modelName}'`);
          if (model.type !== 'NJF') {
            throw new Error(`Unsupported JFET model type: '${model.type}'`);
          }
          devices.push(new JFET(desc.name, nodeIndices, model.params));
          break;
        }
        case 'M': {
          const modelName = desc.modelName;
          const model = modelName ? this._models.get(modelName) : undefined;
          const modelParams = model?.params ?? {};
          const polarity = model?.type === 'PMOS' ? -1 : 1;
          const level = modelParams.LEVEL ?? 1;

          if (level === 49 || level === 8) {
            // BSIM3v3 — 4-terminal
            const bulkNode = desc.nodes.length >= 4 ? desc.nodes[3] : desc.nodes[2]; // default bulk=source
            const nodeIdxs = [
              resolveNode(desc.nodes[0]),
              resolveNode(desc.nodes[1]),
              resolveNode(desc.nodes[2]),
              resolveNode(bulkNode),
            ];
            devices.push(new BSIM3v3(
              desc.name, nodeIdxs, modelParams,
              { W: desc.params?.W ?? 1e-6, L: desc.params?.L ?? 1e-6 },
              polarity,
            ));
          } else {
            // Level 1 — existing behavior
            const nodeIdxs = desc.nodes.slice(0, 3).map(resolveNode);
            devices.push(new MOSFET(desc.name, nodeIdxs, { ...modelParams, ...desc.params, polarity }));
          }
          break;
        }
        case 'G': {
          devices.push(new VCCS(desc.name, nodeIndices, desc.value!));
          break;
        }
        case 'E': {
          const bi = branchIndex++;
          branchNames.push(desc.name);
          devices.push(new VCVS(desc.name, nodeIndices, bi, desc.value!));
          break;
        }
        case 'F': {
          const ctrlName = desc.controlSource!;
          const ctrlDev = deviceMap.get(ctrlName);
          if (!ctrlDev || ctrlDev.branches.length === 0) {
            throw new Error(
              `CCCS '${desc.name}' references unknown or branchless source '${ctrlName}'`,
            );
          }
          devices.push(new CCCS(desc.name, nodeIndices, ctrlDev.branches[0], desc.value!));
          break;
        }
        case 'H': {
          const ctrlName = desc.controlSource!;
          const ctrlDev = deviceMap.get(ctrlName);
          if (!ctrlDev || ctrlDev.branches.length === 0) {
            throw new Error(
              `CCVS '${desc.name}' references unknown or branchless source '${ctrlName}'`,
            );
          }
          const bi = branchIndex++;
          branchNames.push(desc.name);
          devices.push(new CCVS(desc.name, nodeIndices, ctrlDev.branches[0], bi, desc.value!));
          break;
        }
        default:
          throw new Error(`Device type '${desc.type}' not yet implemented`);
      }

      if (devices.length > prevLength) {
        deviceMap.set(desc.name, devices[devices.length - 1]);
      }
    }

    return {
      devices, nodeCount, branchCount: branchNames.length,
      nodeNames, nodeIndexMap, branchNames,
      analyses: this._analyses, poleZeroAnalyses: this._poleZeroAnalyses, models: this._models,
      subcircuits: this._subcircuits,
      steps: this._steps,
      simulationOptions: { ...this._simulationOptions },
      initialConditions: this._initialConditions.map(state => ({ ...state })),
      nodeSets: this._nodeSets.map(state => ({ ...state })),
    };
  }

  /**
   * Expand all subcircuit instances (type 'X') in the descriptor list
   * into flat device descriptors. Non-X descriptors pass through unchanged.
   */
  private expandAllSubcircuits(): DeviceDescriptor[] {
    const result: DeviceDescriptor[] = [];
    for (const desc of this.descriptors) {
      if (desc.type === 'X') {
        const expanded = this.expandSubcircuit(
          desc.name,
          desc.nodes,
          desc.modelName!,
          desc.params ?? {},
          new Set<string>(),
        );
        result.push(...expanded);
      } else {
        result.push(desc);
      }
    }
    return result;
  }

  private expandPassiveParasitics(descriptors: DeviceDescriptor[]): DeviceDescriptor[] {
    const result: DeviceDescriptor[] = [];

    for (const desc of descriptors) {
      if (desc.type === 'C') {
        const model = desc.modelName ? this._models.get(desc.modelName) : undefined;
        if (desc.modelName && !model) {
          throw new Error(`Capacitor '${desc.name}' references unknown model '${desc.modelName}'`);
        }
        const resolved = resolveCapacitorModel(desc.value, model, desc.params);
        if (hasCapacitorParasitics(resolved)) {
          result.push(...this.expandCapacitorDescriptor(desc, resolved));
        } else {
          result.push(desc);
        }
        continue;
      }

      if (desc.type === 'L') {
        const model = desc.modelName ? this._models.get(desc.modelName) : undefined;
        if (desc.modelName && !model) {
          throw new Error(`Inductor '${desc.name}' references unknown model '${desc.modelName}'`);
        }
        const resolved = resolveInductorModel(desc.value, model, desc.params);
        if (hasInductorParasitics(resolved)) {
          result.push(...this.expandInductorDescriptor(desc, resolved));
        } else {
          result.push(desc);
        }
        continue;
      }

      if (desc.type === 'D') {
        const model = desc.modelName ? this._models.get(desc.modelName) : undefined;
        const seriesResistance = desc.params?.RS ?? model?.params.RS;
        const junctionCapacitance = desc.params?.CJ0 ?? model?.params.CJ0;
        const sidewallCapacitance = model?.params.CJSW ?? model?.params.CJP;
        const effectiveArea = (desc.params?.AREA ?? 1) * (desc.params?.M ?? 1);
        const effectivePerimeter = (desc.params?.PJ ?? 0) * (desc.params?.M ?? 1);
        const transitTime = desc.params?.TT ?? model?.params.TT;
        const hasJunctionCharge = isPositiveFinite(junctionCapacitance)
          || (isPositiveFinite(sidewallCapacitance) && effectivePerimeter > 0)
          || isPositiveFinite(transitTime);
        if (isPositiveFinite(seriesResistance) && hasJunctionCharge) {
          const [anode, cathode] = desc.nodes;
          const junction = internalNodeName(desc.name, 'rs');
          result.push({
            type: 'R',
            name: `${desc.name}.RS`,
            nodes: [anode, junction],
            value: seriesResistance / effectiveArea,
          });
          result.push({
            ...desc,
            nodes: [junction, cathode],
            params: { ...desc.params, RS: 0 },
          });
        } else {
          result.push(desc);
        }
        continue;
      }

      if (desc.type === 'J') {
        const modelName = desc.modelName!;
        const model = this._models.get(modelName);
        if (!model) throw new Error(`JFET '${desc.name}' references unknown model '${modelName}'`);
        if (model.type !== 'NJF') {
          throw new Error(`Unsupported JFET model type: '${model.type}'`);
        }
        const params = resolveNJFETParams(model.params);
        let [drain, gate, source] = desc.nodes;
        if (params.RD > 0) {
          const drainPrime = internalNodeName(desc.name, 'rd');
          result.push({
            type: 'R', name: `${desc.name}.RD`, nodes: [drain, drainPrime], value: params.RD,
          });
          drain = drainPrime;
        }
        if (params.RS > 0) {
          const sourcePrime = internalNodeName(desc.name, 'rs');
          result.push({
            type: 'R', name: `${desc.name}.RS`, nodes: [source, sourcePrime], value: params.RS,
          });
          source = sourcePrime;
        }
        result.push({ ...desc, nodes: [drain, gate, source] });
        continue;
      }

      result.push(desc);
    }

    return result;
  }

  private expandCapacitorDescriptor(
    desc: DeviceDescriptor,
    model: ResolvedCapacitorModel,
  ): DeviceDescriptor[] {
    const [p, n] = desc.nodes;
    const result: DeviceDescriptor[] = [];

    if (isPositiveFinite(model.parallelResistance)) {
      result.push({
        type: 'R',
        name: `${desc.name}.RLEAK`,
        nodes: [p, n],
        value: model.parallelResistance,
      });
    }

    let left = p;
    if (isPositiveFinite(model.seriesInductance)) {
      const right = internalNodeName(desc.name, 'esl');
      result.push({
        type: 'L',
        name: `${desc.name}.ESL`,
        nodes: [left, right],
        value: model.seriesInductance,
      });
      left = right;
    }

    if (isPositiveFinite(model.seriesResistance)) {
      const right = internalNodeName(desc.name, 'esr');
      result.push({
        type: 'R',
        name: `${desc.name}.ESR`,
        nodes: [left, right],
        value: model.seriesResistance,
      });
      left = right;
    }

    result.push({
      type: 'C',
      name: desc.name,
      nodes: [left, n],
      value: model.capacitance,
      ic: desc.ic,
    });

    return result;
  }

  private expandInductorDescriptor(
    desc: DeviceDescriptor,
    model: ResolvedInductorModel,
  ): DeviceDescriptor[] {
    const [p, n] = desc.nodes;
    const result: DeviceDescriptor[] = [];

    if (isPositiveFinite(model.parallelResistance)) {
      result.push({
        type: 'R',
        name: `${desc.name}.RPAR`,
        nodes: [p, n],
        value: model.parallelResistance,
      });
    }

    if (isPositiveFinite(model.parallelCapacitance)) {
      result.push({
        type: 'C',
        name: `${desc.name}.CPAR`,
        nodes: [p, n],
        value: model.parallelCapacitance,
      });
    }

    let left = p;
    if (isPositiveFinite(model.seriesResistance)) {
      const right = internalNodeName(desc.name, 'rser');
      result.push({
        type: 'R',
        name: `${desc.name}.RSER`,
        nodes: [left, right],
        value: model.seriesResistance,
      });
      left = right;
    }

    result.push({
      type: 'L',
      name: desc.name,
      nodes: [left, n],
      value: model.inductance,
      ic: desc.ic,
    });

    return result;
  }

  /**
   * Recursively expand a single subcircuit instance into flat device descriptors.
   *
   * @param instanceName  e.g. "X1" or "X0.X1" for nested
   * @param connectedPorts  actual node names connected to this instance's ports
   * @param subcktName  name of the subcircuit definition to instantiate
   * @param instanceParams  parameter overrides from the X line
   * @param visited  set of subcircuit names currently being expanded (cycle detection)
   */
  private expandSubcircuit(
    instanceName: string,
    connectedPorts: string[],
    subcktName: string,
    instanceParams: Record<string, number>,
    visited: Set<string>,
  ): DeviceDescriptor[] {
    const key = subcktName.toUpperCase();

    if (visited.has(key)) {
      throw new CycleError([...visited, key]);
    }

    const def = this._subcircuits.get(key);
    if (!def) {
      throw new Error(`Undefined subcircuit '${subcktName}'`);
    }

    if (connectedPorts.length !== def.ports.length) {
      throw new Error(
        `Subcircuit '${subcktName}' expects ${def.ports.length} port(s) but ${connectedPorts.length} provided`,
      );
    }

    // Build port-to-node mapping
    const portMap = new Map<string, string>();
    for (let i = 0; i < def.ports.length; i++) {
      portMap.set(def.ports[i].toUpperCase(), connectedPorts[i]);
    }

    // Merge parameters: definition defaults overridden by instance params
    const mergedParams: Record<string, number> = { ...def.params };
    for (const [k, v] of Object.entries(instanceParams)) {
      mergedParams[k.toUpperCase()] = v;
    }

    // Map a node name from the subcircuit body to the actual circuit node
    const mapNode = (bodyNode: string): string => {
      if (bodyNode === GROUND_NODE) return GROUND_NODE;
      const upper = bodyNode.toUpperCase();
      // If it's a port, map to the connected node
      if (portMap.has(upper)) return portMap.get(upper)!;
      // Otherwise it's an internal node — prefix with instance name
      return `${instanceName}.${bodyNode}`;
    };

    // Evaluate {expr} in a token using merged parameters
    // Handles both standalone {expr} and key={expr} patterns
    const evalToken = (token: string): string => {
      if (token.startsWith('{') && token.endsWith('}')) {
        const expr = token.slice(1, -1);
        return evaluateExpression(expr, localParams).toString();
      }
      const eqIdx = token.indexOf('=');
      if (eqIdx > 0) {
        const val = token.slice(eqIdx + 1);
        if (val.startsWith('{') && val.endsWith('}')) {
          const expr = val.slice(1, -1);
          return token.slice(0, eqIdx + 1) + evaluateExpression(expr, localParams).toString();
        }
      }
      return token;
    };

    // Local params from .param lines inside subcircuit body
    const localParams: Record<string, number> = { ...mergedParams };

    const result: DeviceDescriptor[] = [];

    // Tokenize body lines
    const parsedLines = tokenizeNetlist(def.body.join('\n'));

    for (const { tokens } of parsedLines) {
      if (tokens.length === 0) continue;
      const first = tokens[0].toUpperCase();

      // Handle .model inside subcircuit — register locally AND globally
      if (first === '.MODEL') {
        const modelParams = parseModelCard(tokens, 0);
        // Register in the circuit's global model map so compile() can find it
        this._models.set(modelParams.name, modelParams);
        continue;
      }

      // Handle .param inside subcircuit body
      if (first === '.PARAM') {
        const paramContent = tokens.slice(1).join(' ');
        const eqIdx = paramContent.indexOf('=');
        if (eqIdx > 0) {
          const name = paramContent.slice(0, eqIdx).trim().toUpperCase();
          let valStr = paramContent.slice(eqIdx + 1).trim();
          if (valStr.startsWith('{') && valStr.endsWith('}')) {
            valStr = valStr.slice(1, -1);
          }
          try {
            localParams[name] = evaluateExpression(valStr, localParams);
          } catch {
            localParams[name] = parseNumber(valStr);
          }
        }
        continue;
      }

      // Skip other dot commands (like .ends that leaked, etc.)
      if (first.startsWith('.')) continue;

      const devName = `${instanceName}.${tokens[0]}`;
      const devType = tokens[0][0].toUpperCase();

      switch (devType) {
        case 'R': {
          const valStr = evalToken(tokens[3]);
          result.push({
            type: 'R', name: devName,
            nodes: [mapNode(tokens[1]), mapNode(tokens[2])],
            value: parseNumber(valStr),
          });
          break;
        }
        case 'C': {
          const evaluatedTokens = tokens.map(t => evalToken(t));
          const parsed = parsePassiveElement(evaluatedTokens, 3, 'C');
          result.push({
            type: 'C', name: devName,
            nodes: [mapNode(tokens[1]), mapNode(tokens[2])],
            value: parsed.value,
            modelName: parsed.modelName,
            params: parsed.params,
          });
          break;
        }
        case 'L': {
          const evaluatedTokens = tokens.map(t => evalToken(t));
          const parsed = parsePassiveElement(evaluatedTokens, 3, 'L');
          result.push({
            type: 'L', name: devName,
            nodes: [mapNode(tokens[1]), mapNode(tokens[2])],
            value: parsed.value,
            modelName: parsed.modelName,
            params: parsed.params,
          });
          break;
        }
        case 'V': {
          const mappedTokens = [devName, mapNode(tokens[1]), mapNode(tokens[2])];
          // Evaluate expressions in remaining tokens
          for (let i = 3; i < tokens.length; i++) {
            mappedTokens.push(evalToken(tokens[i]));
          }
          const waveform = parseSourceWaveform(mappedTokens, 3);
          result.push({
            type: 'V', name: devName,
            nodes: [mapNode(tokens[1]), mapNode(tokens[2])],
            waveform,
          });
          break;
        }
        case 'I': {
          const mappedTokens = [devName, mapNode(tokens[1]), mapNode(tokens[2])];
          for (let i = 3; i < tokens.length; i++) {
            mappedTokens.push(evalToken(tokens[i]));
          }
          const waveform = parseSourceWaveform(mappedTokens, 3);
          result.push({
            type: 'I', name: devName,
            nodes: [mapNode(tokens[1]), mapNode(tokens[2])],
            waveform,
          });
          break;
        }
        case 'D': {
          const modelName = tokens[3];
          const evaluatedTokens = tokens.map(t => evalToken(t));
          result.push({
            type: 'D', name: devName,
            nodes: [mapNode(tokens[1]), mapNode(tokens[2])],
            modelName,
            params: { ...parseDiodeInstanceParams(evaluatedTokens, 4) },
          });
          break;
        }
        case 'Q': {
          result.push({
            type: 'Q', name: devName,
            nodes: [mapNode(tokens[1]), mapNode(tokens[2]), mapNode(tokens[3])],
            modelName: tokens[4],
          });
          break;
        }
        case 'M': {
          let modelName: string;
          let instanceParamStart: number;
          let bulkNode: string | undefined;
          if (tokens[5] && !tokens[5].includes('=')) {
            bulkNode = mapNode(tokens[4]);
            modelName = tokens[5];
            instanceParamStart = 6;
          } else {
            modelName = tokens[4];
            instanceParamStart = 5;
          }
          // Evaluate {expr} in instance params
          const evaluatedTokens = tokens.map(t => evalToken(t));
          const mParams = parseInstanceParams(evaluatedTokens, instanceParamStart);
          const nodes = bulkNode
            ? [mapNode(tokens[1]), mapNode(tokens[2]), mapNode(tokens[3]), bulkNode]
            : [mapNode(tokens[1]), mapNode(tokens[2]), mapNode(tokens[3])];
          result.push({
            type: 'M', name: devName, nodes, modelName, params: mParams,
          });
          break;
        }
        case 'E': {
          const valStr = evalToken(tokens[5]);
          result.push({
            type: 'E', name: devName,
            nodes: [mapNode(tokens[1]), mapNode(tokens[2]), mapNode(tokens[3]), mapNode(tokens[4])],
            value: parseNumber(valStr),
          });
          break;
        }
        case 'G': {
          const valStr = evalToken(tokens[5]);
          result.push({
            type: 'G', name: devName,
            nodes: [mapNode(tokens[1]), mapNode(tokens[2]), mapNode(tokens[3]), mapNode(tokens[4])],
            value: parseNumber(valStr),
          });
          break;
        }
        case 'H': {
          const valStr = evalToken(tokens[4]);
          result.push({
            type: 'H', name: devName,
            nodes: [mapNode(tokens[1]), mapNode(tokens[2])],
            controlSource: `${instanceName}.${tokens[3]}`,
            value: parseNumber(valStr),
          });
          break;
        }
        case 'F': {
          const valStr = evalToken(tokens[4]);
          result.push({
            type: 'F', name: devName,
            nodes: [mapNode(tokens[1]), mapNode(tokens[2])],
            controlSource: `${instanceName}.${tokens[3]}`,
            value: parseNumber(valStr),
          });
          break;
        }
        case 'X': {
          // Nested subcircuit instance — recursively expand
          let subcktIdx = tokens.length - 1;
          while (subcktIdx > 1 && tokens[subcktIdx].includes('=')) {
            subcktIdx--;
          }
          const nestedSubcktName = tokens[subcktIdx];
          const nestedPorts = tokens.slice(1, subcktIdx).map(mapNode);
          const evaluatedTokens = tokens.map(t => evalToken(t));
          const nestedParams = parseInstanceParams(evaluatedTokens, subcktIdx + 1);

          const newVisited = new Set(visited);
          newVisited.add(key);

          const nested = this.expandSubcircuit(
            devName,
            nestedPorts,
            nestedSubcktName,
            nestedParams,
            newVisited,
          );
          result.push(...nested);
          break;
        }
        // Skip unknown device types inside subcircuits silently
      }
    }

    return result;
  }
}
