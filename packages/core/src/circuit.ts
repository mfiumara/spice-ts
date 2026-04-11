import type { DeviceModel } from './devices/device.js';
import type { AnalysisCommand, SourceWaveform, ModelParams, SubcktDefinition } from './types.js';
import { Resistor } from './devices/resistor.js';
import { VoltageSource } from './devices/voltage-source.js';
import { CurrentSource } from './devices/current-source.js';
import { Capacitor } from './devices/capacitor.js';
import { Inductor } from './devices/inductor.js';
import { Diode } from './devices/diode.js';
import { BJT } from './devices/bjt.js';
import { MOSFET } from './devices/mosfet.js';
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
import { CycleError } from './errors.js';

export interface CompiledCircuit {
  devices: DeviceModel[];
  nodeCount: number;
  branchCount: number;
  nodeNames: string[];
  nodeIndexMap: Map<string, number>;
  branchNames: string[];
  analyses: AnalysisCommand[];
  models: Map<string, ModelParams>;
  subcircuits: Map<string, SubcktDefinition>;
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
}

export class Circuit {
  private descriptors: DeviceDescriptor[] = [];
  private _analyses: AnalysisCommand[] = [];
  private _models = new Map<string, ModelParams>();
  private _subcircuits = new Map<string, SubcktDefinition>();
  private nodeSet = new Set<string>();

  get analyses(): AnalysisCommand[] {
    return this._analyses;
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

  addResistor(name: string, nodePos: string, nodeNeg: string, resistance: number): void {
    this.nodeSet.add(nodePos);
    this.nodeSet.add(nodeNeg);
    this.descriptors.push({ type: 'R', name, nodes: [nodePos, nodeNeg], value: resistance });
  }

  addCapacitor(name: string, nodePos: string, nodeNeg: string, capacitance: number): void {
    this.nodeSet.add(nodePos);
    this.nodeSet.add(nodeNeg);
    this.descriptors.push({ type: 'C', name, nodes: [nodePos, nodeNeg], value: capacitance });
  }

  addInductor(name: string, nodePos: string, nodeNeg: string, inductance: number): void {
    this.nodeSet.add(nodePos);
    this.nodeSet.add(nodeNeg);
    this.descriptors.push({ type: 'L', name, nodes: [nodePos, nodeNeg], value: inductance });
  }

  addVoltageSource(
    name: string, nodePos: string, nodeNeg: string,
    waveform: Partial<SourceWaveform> & { dc?: number },
  ): void {
    this.nodeSet.add(nodePos);
    this.nodeSet.add(nodeNeg);
    this.descriptors.push({ type: 'V', name, nodes: [nodePos, nodeNeg], waveform });
  }

  addCurrentSource(
    name: string, nodePos: string, nodeNeg: string,
    waveform: Partial<SourceWaveform> & { dc?: number },
  ): void {
    this.nodeSet.add(nodePos);
    this.nodeSet.add(nodeNeg);
    this.descriptors.push({ type: 'I', name, nodes: [nodePos, nodeNeg], waveform });
  }

  addVCVS(name: string, nOutP: string, nOutN: string, nCtrlP: string, nCtrlN: string, gain: number): void {
    this.nodeSet.add(nOutP);
    this.nodeSet.add(nOutN);
    this.nodeSet.add(nCtrlP);
    this.nodeSet.add(nCtrlN);
    this.descriptors.push({ type: 'E', name, nodes: [nOutP, nOutN, nCtrlP, nCtrlN], value: gain });
  }

  addVCCS(name: string, nOutP: string, nOutN: string, nCtrlP: string, nCtrlN: string, gm: number): void {
    this.nodeSet.add(nOutP);
    this.nodeSet.add(nOutN);
    this.nodeSet.add(nCtrlP);
    this.nodeSet.add(nCtrlN);
    this.descriptors.push({ type: 'G', name, nodes: [nOutP, nOutN, nCtrlP, nCtrlN], value: gm });
  }

  addCCVS(name: string, nOutP: string, nOutN: string, controlSource: string, gain: number): void {
    this.nodeSet.add(nOutP);
    this.nodeSet.add(nOutN);
    this.descriptors.push({ type: 'H', name, nodes: [nOutP, nOutN], value: gain, controlSource });
  }

  addCCCS(name: string, nOutP: string, nOutN: string, controlSource: string, gain: number): void {
    this.nodeSet.add(nOutP);
    this.nodeSet.add(nOutN);
    this.descriptors.push({ type: 'F', name, nodes: [nOutP, nOutN], value: gain, controlSource });
  }

  addDiode(name: string, nodeAnode: string, nodeCathode: string, modelName?: string): void {
    this.nodeSet.add(nodeAnode);
    this.nodeSet.add(nodeCathode);
    this.descriptors.push({ type: 'D', name, nodes: [nodeAnode, nodeCathode], modelName });
  }

  addBJT(name: string, nodeCollector: string, nodeBase: string, nodeEmitter: string, modelName: string): void {
    this.nodeSet.add(nodeCollector);
    this.nodeSet.add(nodeBase);
    this.nodeSet.add(nodeEmitter);
    this.descriptors.push({ type: 'Q', name, nodes: [nodeCollector, nodeBase, nodeEmitter], modelName });
  }

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

  addSubcircuit(def: SubcktDefinition): void {
    this._subcircuits.set(def.name.toUpperCase(), def);
  }

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

  addModel(params: ModelParams): void {
    this._models.set(params.name, params);
  }

  addAnalysis(type: 'op'): void;
  addAnalysis(type: 'dc', params: { source: string; start: number; stop: number; step: number }): void;
  addAnalysis(type: 'tran', params: { timestep: number; stopTime: number; startTime?: number; maxTimestep?: number }): void;
  addAnalysis(type: 'ac', params: { variation: 'dec' | 'oct' | 'lin'; points: number; startFreq: number; stopFreq: number }): void;
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
        const tranCmd: { type: 'tran'; timestep: number; stopTime: number; startTime?: number; maxTimestep?: number } = {
          type: 'tran',
          timestep: params!.timestep as number,
          stopTime: params!.stopTime as number,
        };
        if (params?.startTime !== undefined) tranCmd.startTime = params.startTime as number;
        if (params?.maxTimestep !== undefined) tranCmd.maxTimestep = params.maxTimestep as number;
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
    }
  }

  compile(): CompiledCircuit {
    // Pre-expand subcircuit instances into flat device descriptors
    const expandedDescriptors = this.expandAllSubcircuits();

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
      if (wf.dc !== undefined) return { type: 'dc', value: wf.dc };
      if (wf.type) return wf as SourceWaveform;
      return { type: 'dc', value: 0 };
    };

    const devices: DeviceModel[] = [];
    const deviceMap = new Map<string, DeviceModel>();

    for (const desc of expandedDescriptors) {
      const nodeIndices = desc.nodes.map(resolveNode);
      const prevLength = devices.length;

      switch (desc.type) {
        case 'R':
          devices.push(new Resistor(desc.name, nodeIndices, desc.value!));
          break;
        case 'V': {
          const bi = branchIndex++;
          branchNames.push(desc.name);
          devices.push(new VoltageSource(desc.name, nodeIndices, bi, resolveWaveform(desc.waveform)));
          break;
        }
        case 'I':
          devices.push(new CurrentSource(desc.name, nodeIndices, resolveWaveform(desc.waveform)));
          break;
        case 'C':
          devices.push(new Capacitor(desc.name, nodeIndices, desc.value!));
          break;
        case 'L': {
          const bi = branchIndex++;
          branchNames.push(desc.name);
          devices.push(new Inductor(desc.name, nodeIndices, bi, desc.value!));
          break;
        }
        case 'D': {
          const modelName = desc.modelName;
          const modelParams = modelName ? this._models.get(modelName)?.params ?? {} : {};
          devices.push(new Diode(desc.name, nodeIndices, modelParams));
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
      analyses: this._analyses, models: this._models,
      subcircuits: this._subcircuits,
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
          const valStr = evalToken(tokens[3]);
          result.push({
            type: 'C', name: devName,
            nodes: [mapNode(tokens[1]), mapNode(tokens[2])],
            value: parseNumber(valStr),
          });
          break;
        }
        case 'L': {
          const valStr = evalToken(tokens[3]);
          result.push({
            type: 'L', name: devName,
            nodes: [mapNode(tokens[1]), mapNode(tokens[2])],
            value: parseNumber(valStr),
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
          result.push({
            type: 'D', name: devName,
            nodes: [mapNode(tokens[1]), mapNode(tokens[2])],
            modelName,
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
