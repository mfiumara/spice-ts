import { describe, expect, it } from 'vitest';
import { parse } from './index.js';
import { simulate } from '../simulate.js';

/**
 * ngspice-47 runs a SPICE2 POLY(n) E/F/G/H card as an XSPICE 'A' device
 * (src/xspice/enh/enhtrans.c ENHtranslate_poly). inppas2.c sets CKTadevFlag
 * for every 'A' card that reaches the instantiated deck, and cktdojob.c then
 * lowers a trtol above 1 to 1, or to `.options xtrtol=<n>` ("Reducing trtol
 * to 1 for xspice 'A' devices"). spice-ts runs the polynomial as a B-source
 * and applies the same rule (#862). Every expected value is ngspice-47
 * (`ngspice -b`, `.control` with `set numdgt=16`, `run`, `print`).
 */
const rc = (...source: string[]) => [
  'poly trtol 862',
  ...source,
  'v1 1 0 sin(0 1 1k)',
  'r1 2 3 1k',
  'c1 3 0 100n',
  '.tran 10u 2m',
  '.end',
].join('\n');

interface Reference {
  points: number;
  rows: [number, number, number][];
  final: number;
}

/** POLY(1) source, or the same source in an instantiated subcircuit: trtol 1. */
const TRTOL_1: Reference = {
  points: 215,
  rows: [
    [1, 9.9999999999999995e-8, 6.2769079857767966e-7],
    [2, 1.0120004553722961e-7, 6.3531619285059054e-7],
    [3, 1.0360013661168886e-7, 6.5074788105458208e-7],
    [100, 8.6976034603643445e-4, -4.532872620397780e-1],
  ],
  final: -2.973243764131256e-1,
};

/** The same polynomial as a B-card, or POLY only in an unused subcircuit: trtol 7. */
const TRTOL_7: Reference = {
  points: 212,
  rows: [
    [1, 9.9999999999999995e-8, 6.2769079857767966e-7],
    [2, 1.0840031876060735e-7, 6.8485334736459163e-7],
    [3, 1.2520095628182206e-7, 8.0805554963808278e-7],
    [100, 8.9729545250296489e-4, -4.507846252729875e-1],
  ],
  final: -2.973255720258774e-1,
};

/** POLY(1) source with `.options xtrtol=3`: trtol 3. */
const TRTOL_3: Reference = {
  points: 213,
  rows: [
    [1, 9.9999999999999995e-8, 6.2769079857767966e-7],
    [2, 1.0360013661168886e-7, 6.5110966222932232e-7],
    [3, 1.1080040983506658e-7, 6.9957543897694196e-7],
    [100, 8.8484255942486759e-4, -4.533036597334157e-1],
  ],
  final: -2.973249285822799e-1,
};

async function expectNgspiceTransient(netlist: string, reference: Reference): Promise<void> {
  const result = await simulate(netlist);
  const time = result.transient!.time;
  const v3 = result.transient!.voltage('3');
  expect(time).toHaveLength(reference.points);
  for (const [i, t, v] of reference.rows) {
    expect(Math.abs(time[i] - t)).toBeLessThanOrEqual(1e-4 * t);
    // Newton solutions: ngspice accepts an iterate within reltol*|v| + vntol.
    expect(Math.abs(v3[i] - v)).toBeLessThanOrEqual(1e-3 * Math.abs(v) + 1e-6);
  }
  expect(time[time.length - 1]).toBe(2e-3);
  expect(Math.abs(v3[v3.length - 1] - reference.final)).toBeLessThanOrEqual(1e-3 * Math.abs(reference.final) + 1e-6);
}

describe('POLY(n) sources lower trtol like ngspice-47 XSPICE A devices (#862)', () => {
  it('runs a circuit with a POLY(1) source at trtol 1', async () => {
    await expectNgspiceTransient(rc('e1 2 0 poly(1) 1 0 0 1 0.5'), TRTOL_1);
  });

  it('keeps trtol 7 for the same polynomial written as a B-card', async () => {
    await expectNgspiceTransient(rc('b1 2 0 v = 0 + 1*v(1) + 0.5*v(1)*v(1)'), TRTOL_7);
  });

  it('lowers trtol for a POLY source in an instantiated subcircuit only', async () => {
    const sub = ['.subckt sq a b', 'e1 b 0 poly(1) a 0 0 1 0.5', '.ends'];
    await expectNgspiceTransient(rc(...sub, 'x1 1 2 sq'), TRTOL_1);
    await expectNgspiceTransient(rc(...sub, 'b1 2 0 v = 0 + 1*v(1) + 0.5*v(1)*v(1)'), TRTOL_7);
  });

  it('uses .options xtrtol in place of 1', async () => {
    await expectNgspiceTransient(rc('.options xtrtol=3', 'e1 2 0 poly(1) 1 0 0 1 0.5'), TRTOL_3);
  });

  it('leaves a trtol of 1 or below alone and keeps the rule through toNetlist', () => {
    expect(parse(rc('.options trtol=0.5', 'e1 2 0 poly(1) 1 0 0 1 0.5')).compile().simulationOptions.trtol).toBe(0.5);
    const circuit = parse(rc('e1 2 0 poly(1) 1 0 0 1 0.5'));
    expect(circuit.compile().simulationOptions.trtol).toBe(1);
    expect(parse(circuit.toNetlist()).compile().simulationOptions.trtol).toBe(1);
  });
});
