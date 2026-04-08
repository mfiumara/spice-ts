import { MNAAssembler } from './assembler.js';
import type { DeviceModel } from '../devices/device.js';
import type { IntegrationMethod } from '../types.js';

/**
 * Build the effective conductance matrix for transient analysis.
 *
 * Backward Euler: (G + C/dt) * x(n+1) = b(n+1) + (C/dt) * x(n)
 * Trapezoidal:    (G + 2C/dt) * x(n+1) = b(n+1) + b(n) + (2C/dt - G) * x(n)
 */
export function buildCompanionSystem(
  assembler: MNAAssembler,
  devices: DeviceModel[],
  dt: number,
  method: IntegrationMethod,
  prevSolution: Float64Array,
  prevB?: Float64Array,
): void {
  // Clear and re-stamp at current time
  assembler.clear();
  const ctx = assembler.getStampContext();

  for (const device of devices) {
    device.stamp(ctx);
  }

  for (const device of devices) {
    device.stampDynamic?.(ctx);
  }

  if (method === 'euler') {
    // BE: G_eff = G + C/dt, b_eff = b(n+1) + (C/dt)*x(n)
    const factor = 1 / dt;
    assembler.G.addMatrix(assembler.C, factor);

    for (let i = 0; i < assembler.systemSize; i++) {
      const row = assembler.C.getRow(i);
      for (const [j, cval] of row) {
        assembler.b[i] += factor * cval * prevSolution[j];
      }
    }
  } else {
    // Trapezoidal: G_eff = G + 2C/dt
    // b_eff = b(n+1) + b(n) + (2C/dt - G)*x(n)
    //       = b(n+1) + b(n) + (2C/dt)*x(n) - G*x(n)
    const factor = 2 / dt;

    // Save b(n+1) and G before modification
    const bCurrent = new Float64Array(assembler.b);

    // Compute G*x(n) before modifying G
    const Gx = new Float64Array(assembler.systemSize);
    for (let i = 0; i < assembler.systemSize; i++) {
      const row = assembler.G.getRow(i);
      for (const [j, gval] of row) {
        Gx[i] += gval * prevSolution[j];
      }
    }

    // Modify G: G_eff = G + 2C/dt
    assembler.G.addMatrix(assembler.C, factor);

    // Build b_eff = b(n+1) + (2C/dt)*x(n) - G*x(n) + b(n)
    assembler.b.fill(0);
    for (let i = 0; i < assembler.systemSize; i++) {
      assembler.b[i] = bCurrent[i]; // b(n+1)

      // Add (2C/dt)*x(n)
      const row = assembler.C.getRow(i);
      for (const [j, cval] of row) {
        assembler.b[i] += factor * cval * prevSolution[j];
      }

      // Subtract G*x(n)
      assembler.b[i] -= Gx[i];

      // Add b(n)
      if (prevB) {
        assembler.b[i] += prevB[i];
      }
    }
  }
}
