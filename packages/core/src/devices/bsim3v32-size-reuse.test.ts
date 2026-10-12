import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

// Issue #700: ngspice-47 b3v32temp.c, revisions 3.2 and 3.2.2. An instance
// whose (L, W) matches a size record its model already built keeps `pParam`
// at the most recently allocated record, so its vth0/vfb/vfbzb/u0temp copies
// come from the last newly-seen geometry; ngspice visits a model's instances
// in reverse netlist order (cktcrte.c prepends). The references are
// `ngspice -b` (ngspice-47, numdgt=15) i(vd<k>) on these exact decks with a
// `.control` block of `option numdgt=15`, `run`, `print i(vd0) ...` before
// `.end`. Project-authored card: binned VTH0/U0 so that the two geometries
// have different size records.
const card = (version: string) => `.model NB nmos level=8 version=${version} tox=5e-9 nch=2.5e17 vth0=0.45 lvth0=0.04 wvth0=-0.01 u0=0.045 lu0=-0.006 wu0=-0.003 capmod=3`;
const A = 'L=0.25u W=4u';
const B = 'L=1u W=1u';

function flat(version: string, geometries: string[], extra = ''): string {
  return ['* bsim3v32 pParam reuse', 'VG g 0 1.2', card(version),
    ...geometries.flatMap((g, k) => [`VD${k} d${k} 0 1`, `M${k} d${k} g 0 0 NB ${g}`]), extra, '.op', '.end',
  ].filter(Boolean).join('\n') + '\n';
}

function subcircuitLocal(version: string): string {
  return ['* subcircuit-local model', 'VG g 0 1.2', '.subckt CELL a b c gg', card(version),
    `M0 a gg 0 0 NB ${A}`, `M1 b gg 0 0 NB ${B}`, `M2 c gg 0 0 NB ${A}`, '.ends',
    ...[0, 1, 2, 3, 4, 5].map(k => `VD${k} d${k} 0 1`), 'X1 d0 d1 d2 g CELL', 'X2 d3 d4 d5 g CELL', '.op', '.end', '',
  ].join('\n');
}

const OWN_A = -0.0000388566686848625;
const OWN_B = -0.0000130972892941786;

async function currents(deck: string, count: number): Promise<number[]> {
  const dc = (await simulate(deck)).dc!;
  return Array.from({ length: count }, (_, k) => dc.current(`VD${k}`));
}

function expectClose(actual: number[], expected: number[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, k) => {
    expect(Math.abs(value - expected[k]) / Math.abs(expected[k]), `i(vd${k}) = ${value}, ngspice ${expected[k]}`)
      .toBeLessThan(1e-6);
  });
}

describe('BSIM3v32 3.2/3.2.2 size-record (pParam) reuse matches ngspice-47 b3v32temp.c (#700)', () => {
  it('VERSION=3.2.2 a,b,a: the first a reads the b record (last newly-seen geometry)', async () => {
    expectClose(await currents(flat('3.2.2', [A, B, A]), 3), [-0.000138221872058031, OWN_B, OWN_A]);
  });

  it('VERSION=3.2 a,b,a,b: the first b reads the a record', async () => {
    expectClose(await currents(flat('3.2', [A, B, A, B]), 4), [OWN_A, -0.00000429410048744346, OWN_A, OWN_B]);
  });

  it('VERSION=3.2.4 assigns pParam = here->pParam: every instance uses its own record', async () => {
    expectClose(await currents(flat('3.2.4', [A, B, A]), 3), [OWN_A, OWN_B, OWN_A]);
  });

  it('keeps the reuse when .options TEMP reruns b3v32temp.c', async () => {
    expectClose(
      await currents(flat('3.2.2', [A, B, A], '.options temp=80'), 3),
      [-0.000115285692737032, -0.00001068519071388, -0.0000331284235309292],
    );
  });

  it('scopes a subcircuit-local model per subcircuit instance, as ngspice copies it (x1:nb, x2:nb)', async () => {
    const perCell = [-0.000138221872058031, OWN_B, OWN_A];
    expectClose(await currents(subcircuitLocal('3.2.2'), 6), [...perCell, ...perCell]);
  });
});
