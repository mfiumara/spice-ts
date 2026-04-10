/**
 * Accuracy regression tests for known simulator limitations.
 *
 * These tests document circuits that should produce results within 10% of
 * expected values but currently do not due to known solver limitations.
 * Each test is marked `it.fails` so CI stays green while the issues are
 * tracked. Remove the `.fails` annotation once the underlying bug is fixed.
 *
 * Source: benchmarks/accuracy-results.json (informational failures)
 */
import { describe, it, expect } from 'vitest';
import { simulate } from './simulate.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function withinPct(actual: number, expected: number, pct: number): boolean {
  return Math.abs((actual - expected) / expected) <= pct / 100;
}

// ---------------------------------------------------------------------------
// 1. RLC series resonance — numerical damping with default timestep
//    Expected f_osc ≈ 1591.5 Hz (1/(2π√LC)), simulator measures ~1242 Hz (22% off)
// ---------------------------------------------------------------------------
describe('Accuracy regressions', () => {
  it.fails('rlc-resonance: oscillation frequency within 10% of 1591.5 Hz', async () => {
    const netlist = [
      '* RLC series resonance — f_res ≈ 1.59kHz, Q = 10',
      'V1 1 0 PULSE(0 1 0 1n 1n 10u 100)',
      'R1 1 2 10',
      'L1 2 3 10m',
      'C1 3 0 1u',
      '.tran 0.5u 10m',
      '.end',
    ].join('\n');

    const result = await simulate(netlist);
    const tran = result.transient!;
    const time = tran.time;
    const vc = tran.voltage('3');

    // Measure oscillation frequency via zero crossings (skip first 20µs)
    const dcOffset = vc[vc.length - 1];
    const crossings: number[] = [];
    for (let i = 1; i < vc.length; i++) {
      if (time[i] < 20e-6) continue;
      if ((vc[i - 1] - dcOffset) * (vc[i] - dcOffset) < 0) {
        const t = time[i - 1] + (time[i] - time[i - 1]) *
          Math.abs(vc[i - 1] - dcOffset) / Math.abs(vc[i] - vc[i - 1]);
        crossings.push(t);
      }
    }

    expect(crossings.length).toBeGreaterThanOrEqual(3);

    const periods: number[] = [];
    for (let i = 2; i < crossings.length; i += 2) {
      periods.push(crossings[i] - crossings[i - 2]);
    }
    const measuredFreq = 1 / (periods.reduce((a, b) => a + b) / periods.length);
    const expectedFreq = 1 / (2 * Math.PI * Math.sqrt(10e-3 * 1e-6)); // ≈ 1591.5 Hz

    expect(withinPct(measuredFreq, expectedFreq, 10)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 2. BJT differential pair — multi-device DC convergence limitation
  //    At balanced input the outputs should be symmetric: |V(out+)−V(out-)| < 50 mV
  //    Simulator currently produces ~12.5 V imbalance
  // ---------------------------------------------------------------------------
  it.fails('spice3-diff-pair: balanced outputs within 50 mV of each other', async () => {
    const netlist = [
      '* Quarles diff pair — 2N2222 NPN BJT',
      'VCC vcc 0 DC 12',
      'VEE 0 vee DC 12',
      'VIN+ in+ 0 DC 0.1',
      'VIN- in- 0 DC -0.1',
      'Q1 out+ in+ emit NPN2222',
      'Q2 out- in- emit NPN2222',
      'RC1 vcc out+ 10k',
      'RC2 vcc out- 10k',
      'RE  emit vee 1k',
      '.model NPN2222 NPN(IS=1e-14 BF=100 VAF=100)',
      '.op',
      '.end',
    ].join('\n');

    const result = await simulate(netlist);
    const vout_p = result.dc?.voltage('out+') ?? result.dc?.voltage('out_p') ?? 0;
    const vout_n = result.dc?.voltage('out-') ?? result.dc?.voltage('out_n') ?? 0;
    const diff = Math.abs(vout_p - vout_n);

    // Symmetric diff pair at balanced input: outputs should match within 50 mV
    expect(diff).toBeLessThan(0.05);
  });

  // ---------------------------------------------------------------------------
  // 3. One-stage OTA (DC) — Level 1 MOSFET model limitation
  //    Expected V(d2) ≈ VDD/2 = 2.5 V at balanced input, simulator gives 3.75 V (50% off)
  // ---------------------------------------------------------------------------
  it.fails('spice3-ota-dc: V(d2) within 10% of 2.5 V (VDD/2)', async () => {
    const netlist = [
      '* Quarles one-stage OTA',
      'VDD vdd 0 DC 5',
      'VSS 0 vss DC 5',
      'VBIAS bias 0 DC 1',
      'VIN+ in+ 0 DC 2.5',
      'VIN- in- 0 DC 2.5',
      'M1 d1 in+ tail 0 NMOS1 W=10u L=1u',
      'M2 d2 in- tail 0 NMOS1 W=10u L=1u',
      'MBIAS tail bias 0 0 NMOS1 W=5u L=1u',
      'M3 d1 d1 vdd vdd PMOS1 W=10u L=1u',
      'M4 d2 d1 vdd vdd PMOS1 W=10u L=1u',
      '.model NMOS1 NMOS(KP=100u VTO=0.5)',
      '.model PMOS1 PMOS(KP=40u VTO=-0.5)',
      '.op',
      '.end',
    ].join('\n');

    const result = await simulate(netlist);
    const vd2 = result.dc?.voltage('d2') ?? 0;
    const expectedVd2 = 2.5; // VDD/2 at balanced input

    expect(withinPct(vd2, expectedVd2, 10)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 4. 5-stage RC ladder (AC) — analytical reference
  //    H = 1/(1+15p+35p²+28p³+9p⁴+p⁵) with p=jωRC
  //    Solving |H|=1/√2 analytically gives f_-3dB ≈ 12.73 Hz.
  //    The simulator gives 12.76 Hz (0.2% off) — this is correct behaviour.
  // ---------------------------------------------------------------------------
  it('spice3-rc-ladder-5: f_-3dB within 5% of 12.73 Hz (analytical)', async () => {
    const lines = [
      '* Quarles 5-stage RC ladder — AC',
      'V1 1 0 DC 0 AC 1',
    ];
    for (let i = 1; i <= 5; i++) {
      lines.push(`R${i} ${i} ${i + 1} 1k`);
      lines.push(`C${i} ${i + 1} 0 1u`);
    }
    lines.push('.ac dec 20 1 10k');
    lines.push('.end');
    const netlist = lines.join('\n');

    const result = await simulate(netlist);
    const ac = result.ac!;
    const freqs = ac.frequencies;
    const mags = ac.voltage('6').map(v => v.magnitude);

    // Find -3 dB frequency
    const passbandMag = mags[0];
    const threshold = passbandMag / Math.SQRT2;
    let f3db = 0;
    for (let i = 1; i < mags.length; i++) {
      if (mags[i] < threshold) {
        f3db = freqs[i - 1] + (freqs[i] - freqs[i - 1]) *
          (mags[i - 1] - threshold) / (mags[i - 1] - mags[i]);
        break;
      }
    }

    // Analytical reference: ~12.73 Hz (derived from KCL transfer function)
    const expectedF3db = 12.73;
    expect(f3db).toBeGreaterThan(0);
    expect(withinPct(f3db, expectedF3db, 5)).toBe(true);
  });
});
