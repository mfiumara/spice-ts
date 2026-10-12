import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { ParseError } from '../errors.js';
import type { MeasurementResult } from '../results.js';
import { complexVector, realVector, type ControlVector } from '../parser/control/vector.js';
import { evaluateMeasureCards, measureCard, type MeasureCard } from './dot-measure.js';
import { UnsupportedMeasureError } from './errors.js';
import type { MeasurePlot } from './measure2.js';

/**
 * ngspice-47 reference: each probe deck's `.meas` output and the raw vectors
 * ngspice measured (see fixtures/generate-ngspice-probes.py).
 */
interface Probe {
  deck: string;
  scale?: string;
  vectors?: Record<string, { re: number[]; im?: number[] }>;
  expected: Record<string, { failed?: boolean; value?: number } & Record<string, number | boolean>>;
}
const probes = JSON.parse(
  readFileSync(new URL('./fixtures/ngspice-47-probes.json', import.meta.url), 'utf8'),
) as Record<'tran' | 'ac' | 'dc' | 'quirk', Probe>;

/** ngspice prints `%.5e`: agree to that precision. */
function expectPrinted(actual: number | undefined, printed: number, label: string): void {
  expect(actual, label).toBeDefined();
  expect(Math.abs(actual! - printed), label).toBeLessThanOrEqual(Math.abs(printed) * 5e-6 + 1e-300);
}

function expectNgspice(results: MeasurementResult[], probe: Probe): void {
  for (const [name, expected] of Object.entries(probe.expected)) {
    const result = results.filter(candidate => candidate.name === name).at(-1);
    expect(result, name).toBeDefined();
    if (expected.failed) {
      expect(result!.status, name).toBe('failed');
      continue;
    }
    expect(result!.status, `${name}: ${result!.error}`).toBe('ok');
    for (const [key, printed] of Object.entries(expected)) {
      expectPrinted((result as unknown as Record<string, number>)[key], printed as number, `${name}.${key}`);
    }
  }
  expect(results.filter(result => result.status === 'ok').map(result => result.name).sort())
    .toEqual(Object.keys(probe.expected).filter(name => !probe.expected[name].failed).sort());
}

function cardsOf(deck: string): MeasureCard[] {
  const cards: MeasureCard[] = [];
  deck.split('\n').forEach((line, index) => {
    if (!/^\.meas/i.test(line)) return;
    cards.push(measureCard(line, index + 1, cards.reduce((count, card) => count + card.parSources.length, 0)));
  });
  return cards;
}

/** A plot holding exactly ngspice's vectors. */
function ngspicePlot(type: string, probe: Probe): MeasurePlot {
  const vectors = new Map<string, ControlVector>();
  const scaleData = probe.vectors![probe.scale!];
  const scale = realVector(probe.scale!, scaleData.re);
  for (const [name, data] of Object.entries(probe.vectors!)) {
    vectors.set(name, data.im ? complexVector(name, data.re, data.im, scale) : realVector(name, data.re, scale));
  }
  vectors.set(scale.name, scale);
  return {
    type,
    scale,
    vector: name => {
      const lower = name.toLowerCase();
      const voltage = /^v\((.+)\)$/.exec(lower)?.[1];
      const current = /^i\((.+)\)$/.exec(lower)?.[1];
      return vectors.get(lower) ?? (voltage ? vectors.get(voltage) : current ? vectors.get(`${current}#branch`) : undefined);
    },
  };
}

describe('.meas port of ngspice-47 com_measure2.c, on ngspice vectors', () => {
  for (const type of ['tran', 'ac', 'dc'] as const) {
    it(`reproduces every ${type} measurement ngspice-47 prints for the probe deck`, () => {
      const probe = probes[type];
      const results = evaluateMeasureCards(cardsOf(probe.deck), type, ngspicePlot(type, probe), new Map());
      expectNgspice(results, probe);
    });
  }

  it('reports the ngspice error text of a failed measurement', () => {
    const results = evaluateMeasureCards(cardsOf(probes.tran.deck), 'tran', ngspicePlot('tran', probes.tran), new Map());
    expect(results.find(result => result.name === 'yder')).toMatchObject({
      status: 'failed', error: "measure  yder failed: function 'deriv' currently not supported",
    });
    expect(results.find(result => result.name === 'yout')).toMatchObject({
      status: 'failed', error: 'measure  yout  when(WHEN) : out of interval',
    });
  });
});

describe('simulate() evaluates .meas cards', () => {
  it('matches ngspice-47 on the edge cases of the parser (strtok-cut words, ignored WHEN failures, empty windows)', async () => {
    const result = await simulate(probes.quirk.deck);
    // Deliberate divergence (#811, ngspice ticket #574): v(1)=0.5u is first
    // crossed between the first two time points, at t = 0.5u * 1m = 5e-10 s.
    // ngspice-47 drops that crossing and prints the falling one near 2m.
    expect(probes.quirk.expected.q8.value).toBe(0.002);
    expectNgspice(result.measurements ?? [], { ...probes.quirk, expected: { ...probes.quirk.expected, q8: { value: 5e-10 } } });
    expect(result.measurements?.find(m => m.name === 'q9')?.error).toBe('measure  q9  when(WHEN) : Cannot evaluate x ');
  });

  it('matches ngspice-47 on a nested .dc sweep', async () => {
    const result = await simulate(probes.dc.deck);
    expectNgspice(result.measurements ?? [], probes.dc);
  });

  it('matches ngspice-47 on time-step independent transient measurements', async () => {
    const result = await simulate(probes.tran.deck);
    const byName = new Map((result.measurements ?? []).map(m => [m.name, m]));
    // Crossings of piecewise-linear waveforms and the interpolated RMS/INTEG
    // windows do not depend on where the time points fall.
    for (const name of ['tdiff', 'tdiff2', 'tat', 'ttd', 'yfind', 'yfindat', 'twhen', 'twhen2', 'twhenlast', 'yrms', 'yint', 'ifind', 'yparwhen']) {
      const expected = probes.tran.expected[name];
      for (const [key, printed] of Object.entries(expected)) {
        expectPrinted((byName.get(name) as unknown as Record<string, number>)[key], printed as number, `${name}.${key}`);
      }
    }
  });

  it('reads AC vectors as ngspice does: real part by default, vm/vp/vdb/vr/vi selectors, phase in radians', async () => {
    const result = await simulate(probes.ac.deck);
    const byName = new Map((result.measurements ?? []).map(m => [m.name, m]));
    for (const name of ['vout_at', 'vout_atr', 'vout_ati', 'vout_atm', 'vout_atp', 'vout_atd', 'vout_max', 'vout_maxr', 'freq_at', 'freq_at2', 'vout_diff', 'fixed_diff', 'vout_integ', 'vout_rms', 'bw_chk', 'iat', 'vpar']) {
      for (const [key, printed] of Object.entries(probes.ac.expected[name])) {
        expectPrinted((byName.get(name) as unknown as Record<string, number>)[key], printed as number, `${name}.${key}`);
      }
    }
  });

  it('substitutes .param values like ngspice numparam and defers param= cards until the other results exist', async () => {
    const result = await simulate([
      'numparam in .meas',
      '.param vp=1 half=\'vp/2\' skew=0.25 limit=2m',
      'v1 1 0 pwl(0 0 1m 1 2m 0)',
      'r1 1 0 1k',
      '.tran 10u 2m',
      ".meas tran t1 trig v(1) val='vp/2' rise=1 targ v(1) val=half fall=1",
      '.meas tran t2 when v(1)=skew',
      '.meas tran t3 trig AT = 0.1m targ v(1) val=0.5 rise=1',
      ".meas tran chk param='(t1 < limit) ? t2*2 : 0'",
      ".meas tran late param='t1 + 100us'",
    ].join('\n'));
    expect(result.measurements?.map(m => [m.name, m.status, m.value])).toEqual([
      ['t1', 'ok', expect.closeTo(1e-3, 12)],
      ['t2', 'ok', expect.closeTo(0.25e-3, 12)],
      ['t3', 'ok', expect.closeTo(0.4e-3, 12)],
      ['chk', 'ok', expect.closeTo(0.5e-3, 12)],
      ['late', 'ok', expect.closeTo(1.1e-3, 12)],
    ]);
  });

  it('records cards ngspice rejects as failed instead of stopping the simulation', async () => {
    const result = await simulate([
      'bad cards',
      'v1 1 0 pwl(0 0 1m 1)',
      'r1 1 0 1k',
      '.tran 10u 1m',
      '.measure tra t1 when v(1)=0.5',
      '.measure tran t2 whe v(1)=0.5',
      '.measure tran t3 trig v(1) val=0.5',
      '.measure tran t4 param=\'t2 + 1\'',
    ].join('\n'));
    expect(result.transient).toBeDefined();
    expect(result.measurements?.map(m => [m.name, m.status, m.error])).toEqual([
      ['t1', 'failed', "unrecognized analysis type 'tra'"],
      ['t2', 'failed', "no such function as 'whe'"],
      ['t3', 'failed', 'measure  t3  trig(TRIG) : at, rise, fall or cross must be given'],
      ['t4', 'failed', 'failed'],
    ]);
  });

  it('evaluates the cards after each analysis run of a .control script', async () => {
    const result = await simulate([
      'control run',
      'v1 1 0 pwl(0 0 1m 1)',
      'r1 1 0 1k',
      '.tran 10u 1m',
      '.meas tran t1 when v(1)=0.5',
      '.control',
      'run',
      'let doubled = 2 * v(1)',
      '.endc',
    ].join('\n'));
    expect(result.control?.runs[0].result.measurements?.[0]).toMatchObject({ name: 't1', status: 'ok' });
    expect(result.measurements).toHaveLength(1);
    expect(result.measurements?.[0].value).toBeCloseTo(0.5e-3, 12);
  });

  it('warns when no analysis of a card\'s type runs, as ngspice skips such cards silently', async () => {
    const result = await simulate('t\nv1 1 0 1\nr1 1 0 1k\n.tran 1u 10u\n.meas ac x find v(1) at=1k\n');
    expect(result.measurements).toBeUndefined();
    expect(result.warnings).toContainEqual({ type: 'measure', message: '.meas ac cards were not evaluated: the deck runs no .ac analysis' });
  });

  it('builds a par() operand that reads a branch current i(v1) as a B-source (#718)', async () => {
    // ngspice-47 `ngspice -b`: x = -2.00000e-03.
    const result = await simulate("t\nv1 1 0 1 ac 1\nr1 1 0 1k\n.tran 1u 10u\n.meas tran x find par('i(v1)*2') at=1u\n");
    expect(result.measurements?.[0]).toMatchObject({ name: 'x', status: 'ok' });
    expect(result.measurements?.[0].value).toBeCloseTo(-2e-3, 15);
  });
});

describe('control-language meas', () => {
  it('runs ngspice-47 com_meas: arithmetic operands become vexprint vectors, single-valued vectors become numbers, results become vectors', async () => {
    const result = await simulate([
      'control meas',
      'v1 1 0 pwl(0 0 1m 1 2m 0)',
      'v2 2 0 pwl(0 0.2 2m 0.2)',
      'r1 1 0 1k',
      'r2 2 0 1k',
      '.tran 10u 2m',
      '.control',
      'run',
      'meas tran top MAX v(1)',
      'let half = top / 2',
      'meas tran t1 WHEN v(1) = half',
      'meas tran t2 WHEN v(1)=v(2) CROSS=LAST',
      'meas tran t3 TRIG v(1) VAL=top-0.75 RISE=1 TARG v(1) VAL=half FALL=1',
      'meas tran bad TRIG v(1) VAL= RISE=1',
      'meas tran',
      'echo $&t1',
      '.endc',
    ].join('\n'));
    expect(result.control?.measurements.map(m => [m.name, m.status, m.value, m.error])).toEqual([
      ['top', 'ok', 1, undefined],
      ['t1', 'ok', expect.closeTo(0.5e-3, 12), undefined],
      ['t2', 'ok', expect.closeTo(1.8e-3, 12), undefined],
      ['t3', 'ok', expect.closeTo(1.25e-3, 12), undefined],
      ['bad', 'failed', undefined, 'measure  bad  trig(TRIG) : bad syntax, cannot evaluate right hand side of val=rise'],
      ['', 'failed', undefined, 'unspecified output var name'],
    ]);
    expect(result.control?.output).toEqual(['0.0005']);
  });
});

describe('unsupported .meas forms raise UnsupportedMeasureError', () => {
  it.each([
    ['.meas sp', '.sp lin 10 1 1k\n.meas sp x max s_1_1', /S-parameter/],
    ['a par() operand spice-ts cannot build as a B-source', ".tran 1u 10u\n.meas tran x find par('pwl(v(1),0,0,1,1)') at=1u", /B-source 'bpa_00 pa_00 0 v = pwl\(v\(1\),0,0,1,1\)'/],
  ])('%s', async (_label, cards, reason) => {
    const error = await simulate(`t\nv1 1 0 1 ac 1\nr1 1 0 1k\n${cards}\n`).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UnsupportedMeasureError);
    expect(error).toBeInstanceOf(ParseError);
    expect((error as UnsupportedMeasureError).code).toBe('UNSUPPORTED_MEASURE');
    expect((error as Error).message).toMatch(reason);
  });

  it('.meas with .step', async () => {
    const error = await simulate('t\nv1 1 0 1\nr1 1 0 {r}\n.param r=1k\n.step param r list 1k 2k\n.tran 1u 10u\n.meas tran x max v(1)\n')
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UnsupportedMeasureError);
  });
});
