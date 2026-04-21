import { MNAAssembler } from './assembler.js';
import type { DeviceModel } from '../devices/device.js';
import type { IntegrationMethod } from '../types.js';
import { MOSFET } from '../devices/mosfet.js';

/**
 * Build the effective conductance matrix for transient analysis.
 *
 * Backward Euler: (G + C/dt) * x(n+1) = b(n+1) + (C/dt) * x(n)
 * Trapezoidal:    (G + 2C/dt) * x(n+1) = b(n+1) + b(n) + (2C/dt - G) * x(n)
 * Gear-2 (BDF2):  (G + a1*C) * x(n+1) = b(n+1) + a2*C*x(n) - a3*C*x(n-1)  (dynamic rows)
 *
 * For BDF2 with variable timestep, let α = dt(n-1) / dt(n). Then dx/dt at t(n+1)
 * is approximated by the Lagrange-interpolated polynomial through
 * (t(n-1), x(n-1)), (t(n), x(n)), (t(n+1), x(n+1)):
 *   a1 = (2 + α)     / ((1 + α) * dt(n))        // coef of x(n+1) in dx/dt
 *   a2 = (1 + α)     /  (α * dt(n))             // coef of x(n) (moved to RHS)
 *   a3 = 1           / (α * (1 + α) * dt(n))    // coef of x(n-1)
 * At α = 1 (constant step): a1 = 3/(2dt), a2 = 2/dt, a3 = 1/(2dt) — standard BDF2.
 * On the first step (no x(n-1)), BDF2 bootstraps with Backward Euler.
 *
 * IMPORTANT: For trap and gear2, history terms (b(n) for trap, C*x history
 * for gear2) apply only to DYNAMIC rows (rows with non-zero C entries).
 * Algebraic rows (C=0) are solved as G*x(n+1) = b(n+1) without history
 * coupling. This prevents NR oscillation on nonlinear algebraic equations
 * (e.g., diode KCL at nodes without capacitors).
 */
export function buildCompanionSystem(
  assembler: MNAAssembler,
  devices: DeviceModel[],
  dt: number,
  method: IntegrationMethod,
  prevSolution: Float64Array,
  prevB?: Float64Array,
  gmin = 1e-12,
  prevPrevSolution?: Float64Array,
  prevDt?: number,
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

  // Gear-2 bootstraps with Backward Euler when x(n-1) is unavailable.
  const useGear2 = method === 'gear2' && prevPrevSolution !== undefined && prevDt !== undefined;
  const effectiveMethod: IntegrationMethod =
    method === 'gear2' && !useGear2 ? 'euler' : method;

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

    if (effectiveMethod === 'euler') {
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
    } else if (effectiveMethod === 'gear2') {
      // Gear-2 (BDF2) with variable timestep. α = prevDt / dt.
      const alpha = prevDt! / dt;
      const a1 = (2 + alpha) / ((1 + alpha) * dt);
      const a2 = (1 + alpha) / (alpha * dt);
      const a3 = 1 / (alpha * (1 + alpha) * dt);
      const nnz = colPtr[n];

      // Dynamic-row mask (C has at least one non-zero entry in that row)
      const isDynamic = new Uint8Array(n);
      for (let p = 0; p < nnz; p++) {
        if (cv[p] !== 0) isDynamic[rowIdx[p]] = 1;
      }

      // Save b(n+1) before we overwrite it with the BDF2 RHS
      const bCurrent = new Float64Array(b);

      // G_eff = G + a1 * C
      for (let i = 0; i < nnz; i++) gv[i] += a1 * cv[i];

      // Build b_eff: for dynamic rows use the BDF2 RHS; algebraic rows keep b(n+1)
      // Compute (a2 * C * x(n) - a3 * C * x(n-1)) via two CSC SpMV passes
      const histDyn = new Float64Array(n);
      const xNm1 = prevPrevSolution!;
      for (let j = 0; j < n; j++) {
        const xj = prevSolution[j];
        const xjm1 = xNm1[j];
        if (xj === 0 && xjm1 === 0) continue;
        for (let p = colPtr[j]; p < colPtr[j + 1]; p++) {
          const cp = cv[p];
          if (cp === 0) continue;
          histDyn[rowIdx[p]] += a2 * cp * xj - a3 * cp * xjm1;
        }
      }

      b.fill(0);
      for (let i = 0; i < n; i++) {
        b[i] = bCurrent[i];
        if (isDynamic[i]) b[i] += histDyn[i];
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

    if (effectiveMethod === 'euler') {
      // BE: G_eff = G + C/dt, b_eff = b(n+1) + (C/dt)*x(n)
      const factor = 1 / dt;
      assembler.G.addMatrix(assembler.C, factor);

      for (let i = 0; i < assembler.systemSize; i++) {
        const row = assembler.C.getRow(i);
        for (const [j, cval] of row) {
          assembler.b[i] += factor * cval * prevSolution[j];
        }
      }
    } else if (effectiveMethod === 'gear2') {
      // Gear-2 (BDF2) with variable timestep — slow-path sparse operations.
      const alpha = prevDt! / dt;
      const a1 = (2 + alpha) / ((1 + alpha) * dt);
      const a2 = (1 + alpha) / (alpha * dt);
      const a3 = 1 / (alpha * (1 + alpha) * dt);

      const bCurrent = new Float64Array(assembler.b);
      assembler.G.addMatrix(assembler.C, a1);

      assembler.b.fill(0);
      const xNm1 = prevPrevSolution!;
      for (let i = 0; i < assembler.systemSize; i++) {
        assembler.b[i] = bCurrent[i];
        const cRow = assembler.C.getRow(i);
        if (cRow.size === 0) continue; // algebraic row — leave as b(n+1)
        for (const [j, cval] of cRow) {
          assembler.b[i] += a2 * cval * prevSolution[j] - a3 * cval * xNm1[j];
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
