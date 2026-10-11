import { describe, expect, it } from 'vitest';
import { simulate } from './simulate.js';

/**
 * Issue #428: DC operating point of a plain MOS1 CMOS inverter chain.
 * ngspice-47 solves every length below (direct NR fails, dynamic gmin
 * stepping converges); spice-ts used to throw SingularMatrixError from
 * 91 stages on. Reference values: ngspice-47 `.op`, numdgt=12, identical deck.
 */
function inverterChainOp(stages: number): string {
  const lines = [
    `* ${stages}-stage MOS1 CMOS inverter chain (issue #428)`,
    'VDD vdd 0 DC 2.5',
    'VIN s0 0 PULSE(0 2.5 0.1n 0.1n 0.1n 5n 10n)',
    '.model nch nmos level=1 vto=0.5 kp=120u lambda=0.02',
    '.model pch pmos level=1 vto=-0.5 kp=60u lambda=0.02',
  ];
  for (let i = 1; i <= stages; i++) {
    lines.push(`MP${i} s${i} s${i - 1} vdd vdd pch W=2u L=1u`);
    lines.push(`MN${i} s${i} s${i - 1} 0 0 nch W=1u L=1u`);
    lines.push(`C${i} s${i} 0 10f`);
  }
  lines.push('.op', '.end');
  return lines.join('\n');
}

const NGSPICE_HIGH = 2.499999989542;
const NGSPICE_LOW = 1.045833330918e-8;

describe('MOS1 inverter chain DC operating point (issue #428)', () => {
  // 20k stages: the dynamic-gmin step that crosses the chain's period-doubling
  // point needs ~90 Newton iterations in both simulators; it only converges
  // under ngspice-47's NIiter floor of 100 iterations per homotopy step.
  for (const stages of [91, 200, 20_000]) {
    it(`matches ngspice-47 node voltages for a ${stages}-stage chain`, { timeout: 120_000 }, async () => {
      const result = await simulate(inverterChainOp(stages));
      const dc = result.dc!;
      for (let i = 1; i <= stages; i++) {
        const v = dc.voltage(`s${i}`);
        if (i % 2 === 1) {
          expect(Math.abs(v - NGSPICE_HIGH), `s${i}`).toBeLessThan(1e-9);
        } else {
          expect(Math.abs(v - NGSPICE_LOW), `s${i}`).toBeLessThan(1e-3 * NGSPICE_LOW);
        }
      }
    });
  }
});
