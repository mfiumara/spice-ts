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

export class DCSweepResult {
  constructor(
    public readonly sweepValues: Float64Array,
    private readonly voltageArrays: Map<string, Float64Array>,
    private readonly currentArrays: Map<string, Float64Array>,
  ) {}

  voltage(node: string): Float64Array {
    const v = this.voltageArrays.get(node);
    if (v === undefined) throw new Error(`Unknown node: ${node}`);
    return v;
  }

  current(source: string): Float64Array {
    const i = this.currentArrays.get(source);
    if (i === undefined) throw new Error(`Unknown branch: ${source}`);
    return i;
  }
}

export interface SimulationResult {
  dc?: DCResult;
  dcSweep?: DCSweepResult;
  transient?: TransientResult;
  ac?: ACResult;
  warnings: SimulationWarning[];
}
