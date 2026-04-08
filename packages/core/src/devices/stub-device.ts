import type { DeviceModel, StampContext } from './device.js';

/**
 * Placeholder device for types not yet implemented (C, L, D, Q, M).
 * Stamps nothing — exists so compiled.devices reflects the full device count.
 */
export class StubDevice implements DeviceModel {
  readonly isNonlinear = false;
  readonly branches: number[] = [];

  constructor(
    readonly name: string,
    readonly nodes: number[],
    readonly deviceType: string,
  ) {}

  stamp(_ctx: StampContext): void {
    // Not yet implemented
  }
}
