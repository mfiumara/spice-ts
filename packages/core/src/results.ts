import type { SimulationWarning } from './types.js';

export class DCResult {
  constructor(
    private readonly voltageMap: Map<string, number>,
    private readonly currentMap: Map<string, number>,
  ) {}

  voltage(node: string): number {
    const v = this.voltageMap.get(node);
    if (v === undefined) throw new Error(`Unknown node: ${node}`);
    return v;
  }

  current(source: string): number {
    const i = this.currentMap.get(source);
    if (i === undefined) throw new Error(`Unknown branch: ${source}`);
    return i;
  }

  get voltages(): Map<string, number> {
    return new Map(this.voltageMap);
  }

  get currents(): Map<string, number> {
    return new Map(this.currentMap);
  }
}

export class TransientResult {
  constructor(
    public readonly time: number[],
    private readonly voltageArrays: Map<string, number[]>,
    private readonly currentArrays: Map<string, number[]>,
  ) {}

  voltage(node: string): number[] {
    const v = this.voltageArrays.get(node);
    if (v === undefined) throw new Error(`Unknown node: ${node}`);
    return v;
  }

  current(source: string): number[] {
    const i = this.currentArrays.get(source);
    if (i === undefined) throw new Error(`Unknown branch: ${source}`);
    return i;
  }
}

export class ACResult {
  constructor(
    public readonly frequencies: number[],
    private readonly voltageArrays: Map<string, { magnitude: number; phase: number }[]>,
    private readonly currentArrays: Map<string, { magnitude: number; phase: number }[]>,
  ) {}

  voltage(node: string): { magnitude: number; phase: number }[] {
    const v = this.voltageArrays.get(node);
    if (v === undefined) throw new Error(`Unknown node: ${node}`);
    return v;
  }

  current(source: string): { magnitude: number; phase: number }[] {
    const i = this.currentArrays.get(source);
    if (i === undefined) throw new Error(`Unknown branch: ${source}`);
    return i;
  }
}

export interface DCSweepResult {
  sweepValues: number[];
  voltages: Map<string, number[]>;
  currents: Map<string, number[]>;
}

export interface SimulationResult {
  dc?: DCResult;
  dcSweep?: DCSweepResult;
  transient?: TransientResult;
  ac?: ACResult;
  warnings: SimulationWarning[];
}
