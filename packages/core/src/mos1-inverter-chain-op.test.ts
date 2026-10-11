import { describe, expect, it } from 'vitest';
import { simulate } from './simulate.js';

interface ChainVariant {
  lambda: number;
  pmosWidth: string;
}

const ISSUE_428_CHAIN: ChainVariant = { lambda: 0.02, pmosWidth: '2u' };

/**
 * Issue #428: DC operating point of a plain MOS1 CMOS inverter chain.
 * ngspice-47 solves every length below (direct NR fails, dynamic gmin
 * stepping converges); spice-ts used to throw SingularMatrixError from
 * 91 stages on. Reference values: ngspice-47 `.op`, numdgt=12, identical deck.
 */
function inverterChainOp(stages: number, { lambda, pmosWidth }: ChainVariant = ISSUE_428_CHAIN): string {
  const lines = [
    `* ${stages}-stage MOS1 CMOS inverter chain (issue #428)`,
    'VDD vdd 0 DC 2.5',
    'VIN s0 0 PULSE(0 2.5 0.1n 0.1n 0.1n 5n 10n)',
    `.model nch nmos level=1 vto=0.5 kp=120u lambda=${lambda}`,
    `.model pch pmos level=1 vto=-0.5 kp=60u lambda=${lambda}`,
  ];
  for (let i = 1; i <= stages; i++) {
    lines.push(`MP${i} s${i} s${i - 1} vdd vdd pch W=${pmosWidth} L=1u`);
    lines.push(`MN${i} s${i} s${i - 1} 0 0 nch W=1u L=1u`);
    lines.push(`C${i} s${i} 0 10f`);
  }
  lines.push('.op', '.end');
  return lines.join('\n');
}

async function expectAlternatingChain(
  stages: number, variant: ChainVariant, high: number, low: number,
): Promise<void> {
  const result = await simulate(inverterChainOp(stages, variant));
  const dc = result.dc!;
  for (let i = 1; i <= stages; i++) {
    const v = dc.voltage(`s${i}`);
    if (i % 2 === 1) {
      expect(Math.abs(v - high), `s${i}`).toBeLessThan(1e-9);
    } else {
      expect(Math.abs(v - low), `s${i}`).toBeLessThan(1e-3 * low);
    }
  }
}

const NGSPICE_HIGH = 2.499999989542;
const NGSPICE_LOW = 1.045833330918e-8;

describe('MOS1 inverter chain DC operating point (issue #428)', () => {
  // 20k stages: the dynamic-gmin step that crosses the chain's period-doubling
  // point needs ~90 Newton iterations in both simulators; it only converges
  // under ngspice-47's NIiter floor of 100 iterations per homotopy step.
  for (const stages of [91, 200, 20_000]) {
    it(`matches ngspice-47 node voltages for a ${stages}-stage chain`, { timeout: 120_000 }, async () => {
      await expectAlternatingChain(stages, ISSUE_428_CHAIN, NGSPICE_HIGH, NGSPICE_LOW);
    });
  }
});

/**
 * Issue #462: when dynamic gmin stepping fails, ngspice-47 CKTop falls back to
 * true gmin stepping (cktop.c `new_gmin`), which steps the device junction
 * gmin instead of a node shunt. With lambda=0.005 and W_p=1u, ngspice-47
 * takes that path at 6000 stages ("Dynamic gmin stepping failed", then
 * "True gmin stepping completed"), as it does for the issue-#428 deck at
 * 40k and 50k stages. Reference values: ngspice-47 `op`, numdgt=12, identical deck.
 */
const TRUE_GMIN_CHAIN: ChainVariant = { lambda: 0.005, pmosWidth: '1u' };
const TRUE_GMIN_HIGH = 2.499999979083;
const TRUE_GMIN_LOW = 1.045833336551e-8;

describe('MOS1 inverter chain DC operating point via true gmin stepping (issue #462)', () => {
  it('matches ngspice-47 node voltages for a 6000-stage chain', { timeout: 180_000 }, async () => {
    await expectAlternatingChain(6000, TRUE_GMIN_CHAIN, TRUE_GMIN_HIGH, TRUE_GMIN_LOW);
  });

  // The issue-#462 decks themselves take minutes; run with SPICE_TS_SLOW_TESTS=1.
  for (const stages of [40_000, 50_000]) {
    it.runIf(process.env.SPICE_TS_SLOW_TESTS === '1')(
      `matches ngspice-47 node voltages for the ${stages}-stage issue-#428 chain`,
      { timeout: 1_200_000 },
      async () => {
        await expectAlternatingChain(stages, ISSUE_428_CHAIN, NGSPICE_HIGH, NGSPICE_LOW);
      },
    );
  }
});
