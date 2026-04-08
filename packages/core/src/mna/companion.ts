import { MNAAssembler } from './assembler.js';
import type { DeviceModel } from '../devices/device.js';
import type { IntegrationMethod } from '../types.js';

export function buildCompanionSystem(
  assembler: MNAAssembler,
  devices: DeviceModel[],
  dt: number,
  method: IntegrationMethod,
  prevSolution: Float64Array,
): void {
  // Clear and re-stamp
  assembler.clear();
  const ctx = assembler.getStampContext();

  // Stamp DC contributions (G and b)
  for (const device of devices) {
    device.stamp(ctx);
  }

  // Stamp dynamic contributions (C matrix)
  for (const device of devices) {
    device.stampDynamic?.(ctx);
  }

  // Combine: G_eff = G + α*C/dt where α=1 for BE, α=2 for Trap
  const alpha = method === 'euler' ? 1 : 2;
  const factor = alpha / dt;

  // Add scaled C to G matrix
  assembler.G.addMatrix(assembler.C, factor);

  // Add history term to b: factor * C * x_prev
  for (let i = 0; i < assembler.systemSize; i++) {
    const row = assembler.C.getRow(i);
    for (const [j, cval] of row) {
      assembler.b[i] += factor * cval * prevSolution[j];
    }
  }
}
