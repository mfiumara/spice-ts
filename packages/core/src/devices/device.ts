export interface StampContext {
  stampG(row: number, col: number, value: number): void;
  stampB(row: number, value: number): void;
  stampC(row: number, col: number, value: number): void;
  getVoltage(node: number): number;
  getCurrent(branch: number): number;
  time: number;
  dt: number;
}

export interface DeviceModel {
  readonly name: string;
  readonly nodes: number[];
  readonly branches: number[];
  stamp(ctx: StampContext): void;
  stampDynamic?(ctx: StampContext): void;
  stampAC?(ctx: StampContext, omega: number): void;
  readonly isNonlinear: boolean;
  getACExcitation?(): { magnitude: number; phase: number; branch: number } | null;
}
