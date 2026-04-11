import { describe, bench } from 'vitest';
import { simulate } from '../simulate.js';
import { ConvergenceError, SingularMatrixError, TimestepTooSmallError } from '../errors.js';
import { currentMirror, cascodeAmplifier, millerOpAmp } from '@benchmarks/circuits/analog-blocks.js';

// ---------------------------------------------------------------------------
// Local helper: BSIM3v3 CMOS inverter chain with PULSE input
// ---------------------------------------------------------------------------
function bsim3InverterChain(n: number): string {
  const lines: string[] = [
    `* BSIM3v3 CMOS inverter chain — ${n} stages`,
    `.model NMOD NMOS (LEVEL=49 VTH0=0.5 K1=0.6 U0=400 TOX=4n VSAT=1.5e5 PCLM=1.3 PDIBLC1=0.39 PDIBLC2=0.0086 CGSO=2.5e-10 CGDO=2.5e-10 CJ=1e-3 CJSW=5e-10 MJ=0.5 PB=1)`,
    `.model PMOD PMOS (LEVEL=49 VTH0=-0.5 K1=0.6 U0=150 TOX=4n VSAT=1.2e5 PCLM=1.3 PDIBLC1=0.39 PDIBLC2=0.0086 CGSO=2.5e-10 CGDO=2.5e-10 CJ=1e-3 CJSW=5e-10 MJ=0.5 PB=1)`,
    `VDD vdd 0 DC 1.8`,
    `VIN in 0 PULSE(0 1.8 1n 100p 100p 5n 10n)`,
  ];

  for (let i = 0; i < n; i++) {
    const inp = i === 0 ? 'in' : `inv${i}`;
    const out = `inv${i + 1}`;
    lines.push(`MP${i + 1} ${out} ${inp} vdd vdd PMOD W=2u L=0.18u`);
    lines.push(`MN${i + 1} ${out} ${inp} 0 0 NMOD W=1u L=0.18u`);
  }

  lines.push(`.tran 50p 20n`);
  lines.push(`.end`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Benchmark group 1: single device DC sweeps
// ---------------------------------------------------------------------------
describe('BSIM3: single device DC sweep', () => {
  bench('Id-Vgs sweep (37 points)', async () => {
    await simulate([
      `* NMOS Id-Vgs DC sweep`,
      `.model NMOD NMOS (LEVEL=49 VTH0=0.5 K1=0.6 U0=400 TOX=4n VSAT=1.5e5 PCLM=1.3 PDIBLC1=0.39 PDIBLC2=0.0086 CGSO=2.5e-10 CGDO=2.5e-10 CJ=1e-3 CJSW=5e-10 MJ=0.5 PB=1)`,
      `VGS vgs 0 DC 0`,
      `VDS vds 0 DC 1.8`,
      `M1 vds vgs 0 0 NMOD W=2u L=0.18u`,
      `.dc VGS 0 1.8 0.05`,
      `.end`,
    ].join('\n'));
  });

  bench('Id-Vds sweep (37 points)', async () => {
    await simulate([
      `* NMOS Id-Vds DC sweep`,
      `.model NMOD NMOS (LEVEL=49 VTH0=0.5 K1=0.6 U0=400 TOX=4n VSAT=1.5e5 PCLM=1.3 PDIBLC1=0.39 PDIBLC2=0.0086 CGSO=2.5e-10 CGDO=2.5e-10 CJ=1e-3 CJSW=5e-10 MJ=0.5 PB=1)`,
      `VGS vgs 0 DC 1.2`,
      `VDS vds 0 DC 0`,
      `M1 vds vgs 0 0 NMOD W=2u L=0.18u`,
      `.dc VDS 0 1.8 0.05`,
      `.end`,
    ].join('\n'));
  });
});

// ---------------------------------------------------------------------------
// Benchmark group 2: analog blocks (DC/AC)
// ---------------------------------------------------------------------------
describe('BSIM3: analog blocks (DC)', () => {
  bench('current mirror (DC)', async () => {
    await simulate(currentMirror());
  });

  bench('cascode amplifier (DC+AC)', async () => {
    try {
      await simulate(cascodeAmplifier());
    } catch (e) {
      if (e instanceof ConvergenceError || e instanceof SingularMatrixError || e instanceof TimestepTooSmallError) return;
      throw e;
    }
  });

  bench('Miller op-amp (DC+AC)', async () => {
    try {
      await simulate(millerOpAmp());
    } catch (e) {
      if (e instanceof ConvergenceError || e instanceof SingularMatrixError || e instanceof TimestepTooSmallError) return;
      throw e;
    }
  }, { iterations: 3 });
});

// ---------------------------------------------------------------------------
// Benchmark group 3: CMOS inverter chain (transient)
// ---------------------------------------------------------------------------
describe('BSIM3: CMOS inverter chain', () => {
  bench('3-stage inverter chain (transient)', async () => {
    try {
      await simulate(bsim3InverterChain(3), { integrationMethod: 'euler' });
    } catch (e) {
      if (e instanceof ConvergenceError || e instanceof SingularMatrixError || e instanceof TimestepTooSmallError) return;
      throw e;
    }
  });

  bench('5-stage inverter chain (transient)', async () => {
    try {
      await simulate(bsim3InverterChain(5), { integrationMethod: 'euler' });
    } catch (e) {
      if (e instanceof ConvergenceError || e instanceof SingularMatrixError || e instanceof TimestepTooSmallError) return;
      throw e;
    }
  }, { iterations: 3 });
});
