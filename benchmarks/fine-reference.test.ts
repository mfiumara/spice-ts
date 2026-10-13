import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareExecutions } from './aggregate-report.js';
import type { EngineExecution } from './corpus/classic/report.js';
import {
  compareWithReference,
  FINE_REFERENCE_MAX_STEPS,
  fineReferenceColumn,
  fineReferenceDeck,
  fineReferenceSection,
  nearSharedPoints,
  parseSpiceNumber,
} from './fine-reference.js';

describe('parseSpiceNumber', () => {
  it('reads ngspice scale suffixes and ignores unit letters', () => {
    const cases: Array<[string, number]> = [
      ['0.5N', 5e-10], ['.1s', 0.1], ['0.1MS', 1e-4], ['10ns', 1e-8], ['1meg', 1e6], ['2mil', 50.8e-6],
      ['2.0833333333333e-05', 2.0833333333333e-5], ['7.0', 7], ['20p', 2e-11], ['1u', 1e-6], ['3k', 3e3],
    ];
    for (const [token, expected] of cases) {
      const value = parseSpiceNumber(token);
      assert.ok(value !== undefined && Math.abs(value - expected) <= 1e-12 * Math.abs(expected), `${token} -> ${value}`);
    }
    assert.equal(parseSpiceNumber('{tstop}'), undefined);
    assert.equal(parseSpiceNumber('uic'), undefined);
  });
});

describe('fineReferenceDeck: one corpus-wide TMAX rule', () => {
  it('divides the ngspice default ceiling min(TSTEP, (TSTOP-TSTART)/50, TMAX) by 10', () => {
    const plain = fineReferenceDeck('title\n.TRAN 0.5N 150N\n.end\n');
    assert.equal(plain.status, 'ready');
    assert.deepEqual(plain.tmax, ['5e-11']);
    if (plain.status === 'ready') assert.equal(plain.deck, 'title\n.TRAN 0.5N 150N 0 5e-11\n.end\n');

    // (TSTOP - TSTART)/50 is the smaller term: 7/50 = 0.14 > TSTEP 0.1, so TSTEP wins here ...
    assert.deepEqual(fineReferenceDeck('t\n.tran  0.1 7.0\n').tmax, ['0.01']);
    // ... and here the span term wins: (2n - 0)/50 = 40p < TSTEP 0.1n.
    assert.deepEqual(fineReferenceDeck('t\n.tran 0.1n 2n\n').tmax, ['4e-12']);
    // An explicit deck TMAX below both terms is honoured; TSTART shortens the span.
    const mesa = fineReferenceDeck('t\n.tran 1p 5n 1n 20p\n');
    assert.deepEqual(mesa.tmax, ['1e-13']);
    if (mesa.status === 'ready') assert.match(mesa.deck, /^\.tran 1p 5n 1n 1e-13$/m);
    // A deck TMAX larger than the default ceiling does not make the reference coarser.
    assert.deepEqual(fineReferenceDeck('t\n.tran 1n 100n 0 10n\n').tmax, ['1e-10']);
  });

  it('keeps UIC, folds continuation lines and strips inline comments', () => {
    const uic = fineReferenceDeck('t\n.tran 1n 10n 2n uic\n');
    assert.equal(uic.status === 'ready' && uic.deck, 't\n.tran 1n 10n 2n 1.6e-11 uic\n');
    const continued = fineReferenceDeck('t\n.tran 1n\n+ 10n $ ten ns\n.end\n');
    assert.equal(continued.status === 'ready' && continued.deck, 't\n.tran 1n 10n 0 2e-11\n*\n.end\n');
  });

  it('ignores the title line, comments and .control blocks', () => {
    const plan = fineReferenceDeck('.tran 1 2 is the title\n* .tran 1n 10n\n.control\ntran 1n 10n\n.endc\n.end\n');
    assert.deepEqual(plan, { status: 'unavailable', tmax: [], reason: 'no .tran card outside .control' });
  });

  it('publishes an unavailable reference instead of guessing', () => {
    const braces = fineReferenceDeck('t\n.tran {tstep} 10n\n');
    assert.equal(braces.status, 'unavailable');
    const jimi = fineReferenceDeck('t\n.tran 2.0833333333333e-05 5.0 0 2.0833333333333e-05 \n');
    assert.equal(jimi.status, 'unavailable');
    assert.match(jimi.status === 'unavailable' ? jimi.reason : '', new RegExp(`exceeds the ${FINE_REFERENCE_MAX_STEPS}-step budget`));
  });
});

describe('nearSharedPoints', () => {
  it('matches default-run points to reference points within the tolerance only', () => {
    const shared = nearSharedPoints([0, 0.5 + 1e-15, 0.7, 1], [0, 0.25, 0.5, 0.75, 1], 1e-12);
    assert.deepEqual([...shared], [0, 0.5 + 1e-15, 1]);
  });
});

function transient(grid: number[], values: Record<string, (t: number) => number>): EngineExecution {
  return {
    status: 'success',
    convergence: 'converged',
    analyses: [{
      type: 'tran',
      plotName: 'Transient Analysis',
      series: {
        grid,
        signals: Object.fromEntries(Object.entries(values).map(([name, f]) => [name, grid.map(t => ({ re: f(t), im: 0 }))])),
      },
    }],
  };
}

describe('fineReferenceColumn', () => {
  // The #597 XSPICE divide shape: v = 2 / max(t, 0.1) has a corner at t = 0.1 that ngspice's
  // default grid (..., 0.064, 0.128, ...) steps over while spice-ts puts a point on it.
  const exact = (t: number) => 2 / Math.max(t, 0.1);
  const range = (step: number, stop: number) => Array.from({ length: Math.round(stop / step) + 1 }, (_, i) => i * step);
  const spiceTs = transient(range(0.005, 1), { 'v(40)': exact, 'v(2)': () => 2 });
  const ngspice = transient([0, 0.032, 0.064, 0.128, 0.3, 0.5, 1], { 'v(40)': exact, 'v(2)': () => 2, 'v(99)': () => 1 });
  const fine = transient(range(0.001, 1), { 'v(40)': exact, 'v(2)': () => 2 });

  it('scores both default runs against the same fine reference; status inputs are untouched', async () => {
    const headline = compareExecutions(spiceTs, ngspice);
    const requested: string[][] = [];
    const column = await fineReferenceColumn({
      deck: 't\n.tran .1 1\n',
      fileName: 'divide.cir',
      spiceTs,
      ngspice,
      headline,
      run: async (deck, _file, signals) => {
        assert.equal(deck, 't\n.tran .1 1 0 0.002\n');
        requested.push([...signals].sort());
        return fine;
      },
    });
    assert.deepEqual(requested, [['v(2)', 'v(40)']]);
    assert.equal(column.status, 'compared');
    assert.deepEqual(column.tmax, ['0.002']);
    assert.equal(column.headline?.signal, 'v(40)');
    assert.ok(column.headline!.worst > 0.05, `headline ${column.headline?.worst}`);
    assert.ok(column.spiceTsVsFine!.worst < 2e-3, `spice-ts vs fine ${column.spiceTsVsFine?.worst}`);
    assert.equal(column.ngspiceDefaultVsFine?.signal, 'v(40)');
    assert.ok(column.ngspiceDefaultVsFine!.worst > 0.05, `ngspice vs fine ${column.ngspiceDefaultVsFine?.worst}`);
  });

  it('scores a candidate the same whether or not its breakpoint time is bit-identical to the reference', async () => {
    // A step at t = 0.5 that both candidates report as a left limit there. ngspice's default run
    // shares that exact time with its own fine reference; spice-ts's lands one ulp away. Bit-exact
    // breakpoint matching (the headline's) would forgive only the first; both are forgiven here.
    const step = (t: number) => (t > 0.5 ? 1 : 0);
    const reference = transient(range(0.01, 1), { 'v(1)': step });
    const shared = transient([0, 0.5, 0.6, 1], { 'v(1)': step });
    const offByUlp = transient([0, 0.5 + Number.EPSILON / 2, 0.6, 1], { 'v(1)': t => (t > 0.5 + Number.EPSILON ? 1 : 0) });
    const score = async (candidate: EngineExecution) => (await fineReferenceColumn({
      deck: 't\n.tran .1 1\n', fileName: 'step.cir', spiceTs: candidate, ngspice: candidate,
      headline: compareExecutions(candidate, candidate), run: async () => reference,
    })).spiceTsVsFine!.worst;
    const [a, b] = [await score(shared), await score(offByUlp)];
    assert.ok(a < 1e-9, `shared-breakpoint candidate ${a}`);
    assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  });

  it('scores the same in any signal batch size, from a lazy (getter-backed) reference too (#839)', () => {
    const reference = transient(range(0.001, 1), { 'v(40)': exact, 'v(2)': () => 2, 'v(3)': t => t * t, 'i(v1)': t => -t });
    const candidate = transient(range(0.005, 1), { 'v(40)': exact, 'v(2)': () => 2.001, 'v(3)': t => t * t + 1e-4, 'i(v1)': t => -t });
    const expected = compareWithReference(reference, candidate, 1e-9);
    let reads = 0;
    const lazy: EngineExecution = {
      ...reference,
      analyses: reference.analyses.map(analysis => {
        const signals = {};
        for (const [name, values] of Object.entries(analysis.series.signals)) {
          Object.defineProperty(signals, name, { enumerable: true, get: () => { reads += 1; return values; } });
        }
        return { ...analysis, series: { grid: analysis.series.grid, signals } };
      }),
    };
    // 1001 + 201 points per signal: budget 1 and 1300 measure one signal per batch, 2500 two.
    for (const budget of [1, 1300, 2500, Number.POSITIVE_INFINITY]) {
      reads = 0;
      const actual = compareWithReference(lazy, candidate, 1e-9, budget);
      assert.deepEqual(actual, expected, `budget ${budget}`);
      assert.equal(JSON.stringify(actual), JSON.stringify(expected), `key order, budget ${budget}`);
      assert.equal(reads, 4, `each reference signal is read once, budget ${budget}`);
    }
  });

  it('records a failed fine run as unavailable and keeps the headline column', async () => {
    const column = await fineReferenceColumn({
      deck: 't\n.tran .1 1\n', fileName: 'divide.cir', spiceTs, ngspice,
      headline: compareExecutions(spiceTs, ngspice),
      run: async () => ({ status: 'failed', convergence: 'failed', analyses: [], error: 'timestep too small' }),
    });
    assert.equal(column.status, 'unavailable');
    assert.equal(column.reason, 'fine ngspice run failed: timestep too small');
    assert.equal(column.spiceTsVsFine, null);
    assert.ok(column.headline!.worst > 0.05);
  });

  it('renders every transient row, losses included', () => {
    const lines = fineReferenceSection([
      { label: 'a', status: 'mismatch', fineReference: { status: 'compared', tmax: ['1e-12'], headline: { worst: 0.12, signal: 'v(1)' }, spiceTsVsFine: { worst: 0.002, signal: 'v(1)' }, ngspiceDefaultVsFine: { worst: 0.12, signal: 'v(1)' } } },
      { label: 'b', status: 'matched' },
      { label: 'c', status: 'matched', fineReference: { status: 'unavailable', tmax: [], reason: 'no .tran card outside .control', headline: { worst: 0.001, signal: 'i(v1)' }, spiceTsVsFine: null, ngspiceDefaultVsFine: null } },
    ]).join('\n');
    assert.match(lines, /Transient rows: 2; fine reference compared for 1, unavailable for 1\. Above 0\.01 among compared rows: headline \(transient signals\) 1, spice-ts vs fine 0, ngspice default vs fine 1\./);
    assert.match(lines, /\| a \| mismatch \| 0\.12 \(v\(1\)\) \| 0\.002 \(v\(1\)\) \| 0\.12 \(v\(1\)\) \| 1e-12 \| {2}\|/);
    assert.match(lines, /\| c \| matched \| 0\.001 \(i\(v1\)\) \| {2}\| {2}\| {2}\| no \.tran card outside \.control \|/);
    assert.doesNotMatch(lines, /\| b \|/);
    assert.match(lines, /not a convergence proof/);
  });
});
