import type { DeviceModel } from './devices/device.js';
import type { AnalysisCommand, SourceWaveform, ModelParams } from './types.js';
import { Resistor } from './devices/resistor.js';
import { VoltageSource } from './devices/voltage-source.js';
import { CurrentSource } from './devices/current-source.js';
import { Capacitor } from './devices/capacitor.js';
import { Inductor } from './devices/inductor.js';
import { Diode } from './devices/diode.js';
import { BJT } from './devices/bjt.js';
import { StubDevice } from './devices/stub-device.js';
import { GROUND_NODE } from './types.js';

export interface CompiledCircuit {
  devices: DeviceModel[];
  nodeCount: number;
  branchCount: number;
  nodeNames: string[];
  nodeIndexMap: Map<string, number>;
  branchNames: string[];
  analyses: AnalysisCommand[];
  models: Map<string, ModelParams>;
}

interface DeviceDescriptor {
  type: string;
  name: string;
  nodes: string[];
  value?: number;
  waveform?: Partial<SourceWaveform> & { dc?: number };
  modelName?: string;
  params?: Record<string, number>;
}

export class Circuit {
  private descriptors: DeviceDescriptor[] = [];
  private _analyses: AnalysisCommand[] = [];
  private _models = new Map<string, ModelParams>();
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
    return this.descriptors.filter(d => d.type === 'V' || d.type === 'L').length;
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

  addMOSFET(name: string, nodeDrain: string, nodeGate: string, nodeSource: string, modelName: string): void {
    this.nodeSet.add(nodeDrain);
    this.nodeSet.add(nodeGate);
    this.nodeSet.add(nodeSource);
    this.descriptors.push({ type: 'M', name, nodes: [nodeDrain, nodeGate, nodeSource], modelName });
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

    for (const desc of this.descriptors) {
      const nodeIndices = desc.nodes.map(resolveNode);

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
        case 'M':
          // Not yet implemented — stub placeholder tracked for future tasks
          devices.push(new StubDevice(desc.name, nodeIndices, desc.type));
          break;
        default:
          throw new Error(`Device type '${desc.type}' not yet implemented`);
      }
    }

    return {
      devices, nodeCount, branchCount: branchNames.length,
      nodeNames, nodeIndexMap, branchNames,
      analyses: this._analyses, models: this._models,
    };
  }
}
