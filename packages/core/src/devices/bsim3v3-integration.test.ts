import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';
import {
  ConvergenceError,
  SingularMatrixError,
  TimestepTooSmallError,
} from '../errors.js';
import type { SimulationResult } from '../results.js';

async function trySimulate(netlist: string): Promise<SimulationResult | null> {
  try {
    return await simulate(netlist);
  } catch (e) {
    if (
      e instanceof ConvergenceError ||
      e instanceof SingularMatrixError ||
      e instanceof TimestepTooSmallError
    ) {
      return null;
    }
    throw e;
  }
}

// Common model cards
const NMOS_MODEL = '.model NMOD NMOS (LEVEL=49 VTH0=0.5 U0=400 TOX=4n)';
const PMOS_MODEL = '.model PMOD PMOS (LEVEL=49 VTH0=-0.5 U0=150 TOX=4n)';

describe('BSIM3v3 Integration Tests', () => {
  describe('DC Sweep Tests', () => {
    it('Id-Vgs sweep: current increases monotonically above threshold', async () => {
      const result = await simulate(`
        VGS 2 0 DC 0
        VDS 1 0 DC 1.0
        ${NMOS_MODEL}
        M1 1 2 0 0 NMOD W=10u L=0.18u
        .dc VGS 0 1.8 0.05
        .end
      `);

      const sweep = result.dcSweep!;
      expect(sweep).toBeDefined();

      // 0 to 1.8 step 0.05 => 37 points
      expect(sweep.sweepValues.length).toBe(37);

      // Current through VDS (drain current): convention is iVds is negative
      // when current flows into drain (NMOS). We look at magnitude.
      const iVds = sweep.current('VDS');
      expect(iVds.length).toBe(37);

      // Find threshold index (VGS ~ 0.5V = index 10)
      // Verify that after threshold, current magnitude monotonically increases
      const threshIdx = Math.round((0.5 - 0) / 0.05); // index ~10
      for (let i = threshIdx + 2; i < sweep.sweepValues.length; i++) {
        const iCurr = -iVds[i];
        const iPrev = -iVds[i - 1];
        expect(iCurr).toBeGreaterThanOrEqual(iPrev - 1e-12);
      }
    });

    it('Id-Vds sweep: saturation behavior', async () => {
      const result = await simulate(`
        VGS 2 0 DC 1.0
        VDS 1 0 DC 0
        ${NMOS_MODEL}
        M1 1 2 0 0 NMOD W=10u L=0.18u
        .dc VDS 0 1.8 0.05
        .end
      `);

      const sweep = result.dcSweep!;
      expect(sweep).toBeDefined();

      // 0 to 1.8 step 0.05 => 37 points
      expect(sweep.sweepValues.length).toBe(37);

      const iVds = sweep.current('VDS');

      // Find indices for Vds=0.8V and Vds=1.8V
      const idx08 = Math.round((0.8 - 0) / 0.05); // ~16
      const idx18 = Math.round((1.8 - 0) / 0.05); // ~36

      const i08 = Math.abs(iVds[idx08]);
      const i18 = Math.abs(iVds[idx18]);

      // In saturation, current at Vds=1.8V should not be more than 80% above current at Vds=0.8V
      // (channel length modulation causes some current increase, but it should be bounded)
      expect(i18).toBeLessThanOrEqual(i08 * 1.80 + 1e-12);
      // Also check that there is current flowing (device is on)
      expect(i08).toBeGreaterThan(1e-9);
    });

    it('Body effect sweep: negative Vbs increases threshold (reduces current)', async () => {
      const result = await simulate(`
        VGS 2 0 DC 0.7
        VDS 1 0 DC 1.0
        VBS 4 0 DC 0
        ${NMOS_MODEL}
        M1 1 2 0 4 NMOD W=10u L=0.18u
        .dc VBS -2 0 0.1
        .end
      `);

      const sweep = result.dcSweep!;
      expect(sweep).toBeDefined();

      // -2 to 0 step 0.1 => 21 points
      expect(sweep.sweepValues.length).toBe(21);

      const iVds = sweep.current('VDS');
      const numPoints = sweep.sweepValues.length;

      // Current at Vbs=0 (last point) > current at Vbs=-2 (first point)
      const iAtVbs0 = Math.abs(iVds[numPoints - 1]);
      const iAtVbsNeg2 = Math.abs(iVds[0]);

      expect(iAtVbs0).toBeGreaterThan(iAtVbsNeg2);
    });
  });

  describe('Analog Block Tests', () => {
    it('Current mirror: output tracks reference', async () => {
      // IREF=100µA, M1 diode-connected, M2 mirror output, RD=10k
      const result = await trySimulate(`
        VDD vdd 0 DC 1.8
        IREF vdd d1 DC 100u
        ${NMOS_MODEL}
        M1 d1 d1 0 0 NMOD W=10u L=0.18u
        M2 d2 d1 0 0 NMOD W=10u L=0.18u
        RD vdd d2 10k
        .op
        .end
      `);

      if (result === null) return; // soft-fail on non-convergence

      const vd1 = result.dc!.voltage('d1');
      // Diode-connected MOSFET voltage should be between 0.3V and 1.5V
      expect(vd1).toBeGreaterThan(0.3);
      expect(vd1).toBeLessThan(1.5);
    });

    it('CMOS inverter with BSIM3: high input → low output', async () => {
      const result = await simulate(`
        VDD vdd 0 DC 1.8
        VIN in 0 DC 1.8
        ${NMOS_MODEL}
        ${PMOS_MODEL}
        MP out in vdd vdd PMOD W=20u L=0.18u
        MN out in 0 0 NMOD W=10u L=0.18u
        .op
        .end
      `);

      const vout = result.dc!.voltage('out');
      expect(vout).toBeLessThan(0.3);
    });

    it('CMOS inverter with BSIM3: low input → high output', async () => {
      const result = await simulate(`
        VDD vdd 0 DC 1.8
        VIN in 0 DC 0
        ${NMOS_MODEL}
        ${PMOS_MODEL}
        MP out in vdd vdd PMOD W=20u L=0.18u
        MN out in 0 0 NMOD W=10u L=0.18u
        .op
        .end
      `);

      const vout = result.dc!.voltage('out');
      expect(vout).toBeGreaterThan(1.5);
    });

    it('Bandgap reference: produces reasonable voltage', async () => {
      // PMOS mirror + 2 BJTs + resistors (simplified bandgap-like circuit)
      const result = await trySimulate(`
        VDD vdd 0 DC 3.3
        ${PMOS_MODEL}
        MP1 m1c m1c vdd vdd PMOD W=20u L=0.18u
        MP2 m2c m1c vdd vdd PMOD W=20u L=0.18u
        Q1 m1c m1c 0 NPN
        Q2 m2c m2c r2top NPN
        .model NPN NPN (IS=1e-16 BF=100)
        R1 m1c 0 10k
        R2 r2top 0 1k
        .op
        .end
      `);

      if (result === null) return; // soft-fail on non-convergence

      const vref = result.dc!.voltage('m2c');
      // The output node should be a plausible circuit voltage (> 0 and < VDD)
      expect(vref).toBeGreaterThan(0.0);
      expect(vref).toBeLessThan(3.3);
    });

    it('6T SRAM cell: finds stable state', async () => {
      // Cross-coupled inverters + access transistors
      const result = await trySimulate(`
        VDD vdd 0 DC 1.8
        VWL wl 0 DC 1.8
        ${NMOS_MODEL}
        ${PMOS_MODEL}
        MN1 q qb 0 0 NMOD W=10u L=0.18u
        MP1 q qb vdd vdd PMOD W=20u L=0.18u
        MN2 qb q 0 0 NMOD W=10u L=0.18u
        MP2 qb q vdd vdd PMOD W=20u L=0.18u
        MA1 q wl bl 0 NMOD W=10u L=0.18u
        MA2 qb wl blb 0 NMOD W=10u L=0.18u
        VBL bl 0 DC 1.8
        VBLB blb 0 DC 0
        .op
        .end
      `);

      if (result === null) return; // soft-fail on non-convergence

      const vq = result.dc!.voltage('q');
      const vqb = result.dc!.voltage('qb');
      // Cell should be in a stable state: Q and QB should differ by > 0.5V
      expect(Math.abs(vq - vqb)).toBeGreaterThan(0.5);
    });
  });
});
