import { MNAAssembler } from './assembler.js';
import type { DeviceModel } from '../devices/device.js';
import type { IntegrationMethod } from '../types.js';
import { MOSFET } from '../devices/mosfet.js';

/**
 * Build the effective conductance matrix for transient analysis.
 *
 * Backward Euler: (G + C/dt) * x(n+1) = b(n+1) + (C/dt) * x(n)
 * Trapezoidal:    (G + 2C/dt) * x(n+1) = b(n+1) + b(n) + (2C/dt - G) * x(n)
 *
 * IMPORTANT: For the trapezoidal method, the history terms (b(n) - G*x(n))
 * are only applied to DYNAMIC rows (rows with non-zero C entries). Algebraic
 * rows (C=0) are solved as G*x(n+1) = b(n+1) without history coupling. This
 * prevents NR oscillation on nonlinear algebraic equations (e.g., diode KCL
 * at nodes without capacitors).
 */
export function buildCompanionSystem(
  assembler: MNAAssembler,
  devices: DeviceModel[],
  dt: number,
  method: IntegrationMethod,
  prevSolution: Float64Array,
  prevB?: Float64Array,
  gmin = 1e-12,
): void {
  // Clear and re-stamp at current time
  assembler.clear();
  const ctx = assembler.getStampContext();

  if (assembler.isFastPath && assembler.posMap.length > 0) {
    // Batch-stamp MOSFETs with direct array writes, fall back for others
    let hasMosfets = false;
    const mosfets: MOSFET[] = [];
    for (const d of devices) {
      if (d instanceof MOSFET) { mosfets.push(d); hasMosfets = true; }
      else d.stamp(ctx);
    }
    if (hasMosfets) {
      MOSFET.batchStamp(
        mosfets, assembler.gValues, assembler.b, assembler.solution,
        assembler.posMap, assembler.systemSize,
      );
    }
  } else {
    for (const device of devices) {
      device.stamp(ctx);
    }
  }

  for (const device of devices) {
    device.stampDynamic?.(ctx);
  }

  if (assembler.isFastPath) {
    // ---- Fast path: typed-array CSC arithmetic ----
    const gv = assembler.gValues;
    const cv = assembler.cValues;
    const colPtr = assembler.colPtr;
    const rowIdx = assembler.rowIdx;
    const diag = assembler.diagIdx;
    const n = assembler.systemSize;
    const b = assembler.b;

    // Add GMIN to all node diagonals for numerical stability
    for (let i = 0; i < assembler.numNodes; i++) {
      gv[diag[i]] += gmin;
    }

    if (method === 'euler') {
      // BE: G_eff = G + C/dt, b_eff = b(n+1) + (C/dt)*x(n)
      const factor = 1 / dt;
      const nnz = colPtr[n];

      // G_eff = G + C/dt (one tight loop over all non-zeros)
      for (let i = 0; i < nnz; i++) gv[i] += factor * cv[i];

      // b += (C/dt) * x(n)  — CSC SpMV
      for (let j = 0; j < n; j++) {
        const xj = prevSolution[j];
        if (xj === 0) continue;
        for (let p = colPtr[j]; p < colPtr[j + 1]; p++) {
          b[rowIdx[p]] += factor * cv[p] * xj;
        }
      }
    } else {
      // Trapezoidal: G_eff = G + 2C/dt
      // b_eff depends on whether a row is dynamic (C≠0) or algebraic (C=0):
      //   Dynamic: b(n+1) + (2C/dt)*x(n) - G*x(n) + b(n)
      //   Algebraic: b(n+1) only
      const factor = 2 / dt;
      const nnz = colPtr[n];

      // Determine which rows have dynamic (C≠0) entries
      const isDynamic = new Uint8Array(n);
      for (let p = 0; p < nnz; p++) {
        if (cv[p] !== 0) isDynamic[rowIdx[p]] = 1;
      }

      // Save b(n+1) before modification
      const bCurrent = new Float64Array(b);

      // Compute G*x(n) before modifying G — CSC SpMV
      // Only needed for dynamic rows, but computing for all is simpler
      const Gx = new Float64Array(n);
      for (let j = 0; j < n; j++) {
        const xj = prevSolution[j];
        if (xj === 0) continue;
        for (let p = colPtr[j]; p < colPtr[j + 1]; p++) {
          Gx[rowIdx[p]] += gv[p] * xj;
        }
      }

      // G_eff = G + 2C/dt (one tight loop)
      for (let i = 0; i < nnz; i++) gv[i] += factor * cv[i];

      // Build b_eff
      b.fill(0);

      // Start with b(n+1) for all rows
      for (let i = 0; i < n; i++) b[i] = bCurrent[i];

      // Add (2C/dt)*x(n) — CSC SpMV (only affects dynamic rows via cv)
      for (let j = 0; j < n; j++) {
        const xj = prevSolution[j];
        if (xj === 0) continue;
        for (let p = colPtr[j]; p < colPtr[j + 1]; p++) {
          b[rowIdx[p]] += factor * cv[p] * xj;
        }
      }

      // Subtract G*x(n) and add b(n) ONLY for dynamic rows
      for (let i = 0; i < n; i++) {
        if (isDynamic[i]) {
          b[i] -= Gx[i];
          if (prevB) b[i] += prevB[i];
        }
      }
    }
  } else {
    // ---- Slow path: Map-of-Maps sparse operations ----

    // Add GMIN to all node diagonals for numerical stability
    for (let i = 0; i < assembler.numNodes; i++) {
      assembler.G.add(i, i, gmin);
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
      // History terms only for dynamic rows (C≠0)
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

      // Build b_eff
      assembler.b.fill(0);
      for (let i = 0; i < assembler.systemSize; i++) {
        assembler.b[i] = bCurrent[i]; // b(n+1)

        const cRow = assembler.C.getRow(i);
        const hasDynamic = cRow.size > 0;

        // Add (2C/dt)*x(n) for dynamic rows
        for (const [j, cval] of cRow) {
          assembler.b[i] += factor * cval * prevSolution[j];
        }

        // Subtract G*x(n) and add b(n) ONLY for dynamic rows
        if (hasDynamic) {
          assembler.b[i] -= Gx[i];
          if (prevB) {
            assembler.b[i] += prevB[i];
          }
        }
      }
    }
  }
}
