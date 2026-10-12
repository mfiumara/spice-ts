import { describe, expect, it } from 'vitest';
import { simulate } from './simulate.js';
import { parse } from './parser/index.js';
import { ParseError } from './errors.js';
import { UnsupportedSourceWaveformError } from './parser/waveform-parser.js';
import type { TransientResult } from './results.js';

/** Values a held (piecewise-constant) vector takes, in order, with the times they first appear. */
function plateaus(time: ArrayLike<number>, values: ArrayLike<number>): { times: number[]; values: number[] } {
  const result = { times: [] as number[], values: [] as number[] };
  for (let k = 0; k < time.length; k++) {
    if (k === 0 || values[k] !== values[k - 1]) {
      result.times.push(time[k]);
      result.values.push(values[k]);
    }
  }
  return result;
}

function expectSequence(actual: number[], expected: number[], relative = 1e-12): void {
  expect(actual.length).toBeGreaterThanOrEqual(expected.length);
  expected.forEach((value, index) => {
    expect(Math.abs(actual[index] - value)).toBeLessThanOrEqual(relative * Math.max(1, Math.abs(value)));
  });
}

async function transient(netlist: string): Promise<TransientResult> {
  const result = await simulate(netlist);
  return result.transient!;
}

describe('TRNOISE / TRRANDOM source parsing', () => {
  it('reads TRNOISE coefficients as ngspice-47 vsrcpar.c does', () => {
    const circuit = parse([
      'trnoise cards',
      'V1 1 0 DC 0.5 TRNOISE(20n 0.5n 0 7 1m 2u 3u)',
      'V2 2 0 trnoise(0 0 0 0 5m 18u 30u)',
      'I3 3 0 DC 0 TRNOISE(0.05 8p 1.0 0.001)',
      'V4 4 0 DC TRNOISE(1n 1n 1 1n 0 5u 6u)',
      '.tran 1n 1u',
    ].join('\n'));
    const waveforms = circuit.toNetlist().split('\n').filter(line => /TRNOISE/i.test(line));
    expect(waveforms).toEqual([
      'V1 1 0 DC 0.5 TRNOISE(2e-8 5e-10 0 0 0.001 0.000002 0.000003)',
      // 30u is 30 * pow(10, -6) = 2.9999999999999997e-5 in ngspice-47
      // INPevaluate (#749); only the integer-mantissa form reads back to it.
      'V2 2 0 TRNOISE(0 0 0 0 0.005 0.000018 30e-6)',
      'I3 3 0 DC 0 TRNOISE(0.05 8e-12 1 0.001 0 0 0)',
      'V4 4 0 TRNOISE(1e-9 1e-9 1 1e-9 0 0 0)',
    ]);
  });

  it('reads TRRANDOM coefficients with ngspice-47 defaults', () => {
    const circuit = parse('trrandom cards\nI1 1 0 DC 0 TRRANDOM(2 8p)\nV2 2 0 TRRANDOM(3.7 1u 2u 4 5)\n.tran 1n 1u');
    expect(circuit.toNetlist()).toContain('I1 1 0 DC 0 TRRANDOM(2 8e-12 0 1 0)');
    expect(circuit.toNetlist()).toContain('V2 2 0 TRRANDOM(3 0.000001 0.000002 4 5)');
    expect(circuit.toIR().components[0]).toMatchObject({
      params: { waveform: 'trrandom', dc: 0, distribution: 2, ts: 8e-12, td: 0, param1: 1, param2: 0 },
      displayValue: 'TRRANDOM 2',
    });
  });

  it('rejects malformed TRNOISE and TRRANDOM cards', () => {
    expect(() => parse('t\nV1 1 0 TRNOISE(1n)\n.tran 1n 1u')).toThrow('TRNOISE source needs 2 to 7 values');
    expect(() => parse('t\nV1 1 0 TRRANDOM(1 0)\n.tran 1n 1u')).toThrow('TRRANDOM TS must be positive');
    expect(() => parse('t\nV1 1 0 TRNOISE(1 2 3 4 5 6 7 8)\n.tran 1n 1u')).toThrow('Unsupported TRNOISE source parameters');
  });

  it('rejects EXTERNAL with a typed error, as the ngspice-47 executable does', () => {
    let error: unknown;
    try {
      parse('shx test\nvext ctl 0 0 external\nr ctl 0 1k\n.tran 4u 201u');
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(UnsupportedSourceWaveformError);
    expect(error).toMatchObject({ code: 'UNSUPPORTED_SOURCE_WAVEFORM', keyword: 'EXTERNAL', line: 2, context: 'vext ctl 0 0 external' });
    expect((error as Error).message).toContain("Unsupported source waveform 'EXTERNAL'");
    expect((error as Error).message).toContain('shared-library build');
  });
});

describe('TRNOISE white and 1/f noise (ngspice-47 vsrcload.c/isrcload.c, 1-f-code.c)', () => {
  const WHITE = 'white noise\nV1 1 0 DC 0.25 TRNOISE(1m 1u 0 0)\nR1 1 0 1k\n.tran 1u 4m\n.end';

  it('holds the DC value at t=0, samples every TS and interpolates linearly between samples', async () => {
    const tran = await transient(WHITE);
    const time = tran.time;
    const v = tran.voltage('1');
    expect(v[0]).toBe(0.25);
    // Every TS multiple is a breakpoint and therefore a timepoint. Like ngspice
    // (VSRCbreak_time += TS) the breakpoint accumulates TS, so it sits within
    // rounding of n*TS.
    const onGrid = new Map<number, number>();
    for (let k = 0; k < time.length; k++) {
      const n = Math.round(time[k] / 1e-6);
      if (Math.abs(time[k] / 1e-6 - n) <= 1e-9) onGrid.set(n, v[k] - 0.25);
    }
    for (let n = 0; n <= 4000; n++) expect(onGrid.has(n), `sample ${n}`).toBe(true);
    // Between two samples the source is the straight line through them.
    for (let k = 0; k < time.length; k++) {
      const n = Math.floor(time[k] / 1e-6);
      if (!onGrid.has(n) || !onGrid.has(n + 1)) continue;
      const fraction = time[k] / 1e-6 - n;
      const expected = onGrid.get(n)! + (onGrid.get(n + 1)! - onGrid.get(n)!) * fraction;
      expect(Math.abs(v[k] - 0.25 - expected)).toBeLessThan(1e-12);
    }
    // White Gaussian samples: zero mean and NA rms (deterministic default stream; 4000 samples).
    const samples = [...onGrid.entries()].filter(([n]) => n > 0).map(([, value]) => value);
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    expect(Math.abs(mean)).toBeLessThan(4 * 1e-3 / Math.sqrt(samples.length));
    expect(rms / 1e-3).toBeGreaterThan(0.95);
    expect(rms / 1e-3).toBeLessThan(1.05);
  });

  it('is reproducible from run to run', async () => {
    const first = await transient(WHITE);
    const second = await transient(WHITE);
    expect([...second.voltage('1')]).toEqual([...first.voltage('1')]);
  });

  it('generates 1/f^alpha noise with the Kasdin filter (spectral slope close to -alpha)', async () => {
    const tran = await transient('pink noise\nV1 1 0 DC 0 TRNOISE(0 1u 1 1m)\nR1 1 0 1k\n.tran 1u 4.096m\n.end');
    const time = tran.time;
    const v = tran.voltage('1');
    const samples: number[] = [];
    for (let k = 0; k < time.length; k++) {
      const n = Math.round(time[k] / 1e-6);
      if (Math.abs(time[k] / 1e-6 - n) <= 1e-9 && n === samples.length) samples.push(v[k]);
    }
    expect(samples.length).toBe(4097);
    // Periodogram averaged in octave bands; fit log power against log frequency.
    const N = 4096;
    const points: [number, number][] = [];
    for (let low = 4; low < N / 4; low *= 2) {
      let power = 0;
      for (let f = low; f < 2 * low; f++) {
        let re = 0;
        let im = 0;
        for (let n = 0; n < N; n++) {
          re += samples[n] * Math.cos(2 * Math.PI * f * n / N);
          im -= samples[n] * Math.sin(2 * Math.PI * f * n / N);
        }
        power += re * re + im * im;
      }
      points.push([Math.log(1.5 * low), Math.log(power / low)]);
    }
    const mx = points.reduce((s, [x]) => s + x, 0) / points.length;
    const my = points.reduce((s, [, y]) => s + y, 0) / points.length;
    const slope = points.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0)
      / points.reduce((s, [x]) => s + (x - mx) ** 2, 0);
    expect(slope).toBeGreaterThan(-1.3);
    expect(slope).toBeLessThan(-0.7);
  });

  it('uses the explicit DC value for the operating point', async () => {
    const result = await simulate('op\nV1 1 0 DC 0.7 TRNOISE(1 1n 1 1 1 1u 1u)\nR1 1 0 1k\n.op\n.end');
    // 0.7 is 7 * pow(10, -1) in ngspice-47 INPevaluate (#749).
    expect(result.dc!.voltage('1')).toBe(0.7000000000000001);
  });
});

/*
 * ngspice-47 references (`ngspice -b -r`, macOS arm64, identical netlists below). With
 * `.option seed` ngspice-47 re-seeds the uniform streams that RTS and TRRANDOM draw from, so
 * their values are reproducible; spice-ts must produce the same draws. Times differ only in
 * where a new TRRANDOM value is first shown (ngspice's VSRC breakpoints drift by CKTminBreak).
 */
const SEEDED_VSRC = [
  'seeded V-source RTS and TRRANDOM',
  '.option seed=7',
  'V1 1 0 DC 0 trnoise(0 0 0 0 1 20u 40u)',
  'R1 1 0 1k',
  'V2 2 0 DC 0.5 TRRANDOM(2 10u 0 1 0)',
  'R2 2 0 1k',
  'V5 5 0 TRRANDOM(3 10u 15u 1 0)',
  'R5 5 0 1k',
  'V6 6 0 TRRANDOM(4 10u 0 3 0)',
  'R6 6 0 1k',
  '.tran 1u 200u',
  '.end',
].join('\n');

const SEEDED_ISRC = [
  'seeded I-source RTS and TRRANDOM',
  '.option seed=11',
  'I3 3 0 DC 0 trnoise(0 0 0 0 1m 30u 10u)',
  'R3 3 0 1k',
  'I4 4 0 DC 0 TRRANDOM(1 10u 0 2 1)',
  'R4 4 0 1k',
  'I7 7 0 TRRANDOM(2 10u 0 1m 0)',
  'R7 7 0 1k',
  '.tran 1u 200u',
  '.end',
].join('\n');

describe('seeded RTS and TRRANDOM draws match ngspice-47', () => {
  it('V sources: RTS capture times and Gaussian/exponential/Poisson TRRANDOM values', async () => {
    const tran = await transient(SEEDED_VSRC);
    const rts = plateaus(tran.time, tran.voltage('1'));
    expect(rts.values.slice(0, 4)).toEqual([0, 1, 0, 1]);
    // exprand() uses log(): the C library and JavaScript may differ in the last place.
    expectSequence(rts.times.slice(1, 2), [4.007310261622948e-05], 1e-14);
    expectSequence(rts.times.slice(3, 4), [0.000165644143568936], 1e-14);
    expectSequence(plateaus(tran.time, tran.voltage('2')).values, [
      0.5, -0.6221169115650895, 1.19053925817175, 0.1924570761486744, -0.1719735841810023, 0.3325295625132664,
      0.08810461166574679, 1.238430688275446, 1.358028244914632, -0.3176262447713152, 0.0998075706842581,
      0.08329087162734755, 0.8082310661230907, 0.6802808123968456, 0.4431311114948784, 0.4590012377127166,
      0.3976455127505709, 0.6882696481436692, -0.5260706094432568, 0.2687182182276144, 0.9433803056377054,
    ]);
    expectSequence(plateaus(tran.time, tran.voltage('5')).values, [
      0, 1.373216178561627, 1.047159710177737, 0.926568479880349, 1.663256753374527, 1.440312057330757,
      2.489457208728317, 0.7773325609597772, 1.069302844068203, 0.1258774823378891, 0.1922020894807976,
      0.684647510286472, 1.437388137884216, 0.7023405422693779, 0.1886776846309676, 1.496783226914594,
      1.188211362848714, 1.474338501755267, 0.1075163578750483, 0.3984539740109294,
    ]);
    expectSequence(plateaus(tran.time, tran.voltage('6')).values, [
      0, 6, 1, 3, 2, 1, 4, 1, 3, 2, 6, 2, 4, 3, 2, 3, 1, 6, 1, 2,
    ]);
  });

  it('I sources: RTS capture times and uniform/Gaussian TRRANDOM values', async () => {
    const tran = await transient(SEEDED_ISRC);
    const rts = plateaus(tran.time, tran.voltage('3'));
    expect(rts.values).toEqual([0, -1, 0, -1, 0]);
    expectSequence(rts.times.slice(1, 2), [7.018780216713173e-05], 1e-14);
    expectSequence(rts.times.slice(3, 4), [0.0001396234750326428], 1e-14);
    expectSequence(plateaus(tran.time, tran.voltage('4')).values, [
      -1000, -79.34983260929762, -1543.047159910206, 416.0242164507499, 493.3796236291519, -2343.994473107165,
      -628.8178572431231, -1788.842494599526, -436.6824030876182, -1845.944950357084, -1212.612105533484,
      357.3530400171867, -645.6919070333269, -1805.214523337786, 253.2314471900452, -2794.5729456842,
      -2657.127277925616, -95.72034794837414, -1742.035000585024, -1758.422528393571,
    ]);
    expectSequence(plateaus(tran.time, tran.voltage('7')).values, [
      0, -0.6548062410686091, 0.1817699939069768, -0.03030349928169365, 0.8933187040955083, 0.9419044684147911,
      0.2369674908840309, 1.038738081029485, -0.9668694333836721, -0.08673167108585707, 0.01755085749572835,
      0.5779089154016269, 1.918937730606219, -1.377383092537428, 0.3874522147536118, 0.9053041386582484,
      1.80205200218965, -0.2291241861256262, -0.4412973898624927, 0.4146907047643469,
    ]);
  });
});

describe('.options seed validation', () => {
  it.each(['random', '0', '-3', '1.5'])('rejects seed=%s with a structured ParseError', value => {
    const netlist = ['* seed', `.options seed=${value}`, 'V1 1 0 DC 1', 'R1 1 0 1k', '.op', '.end'].join('\n');
    let error: unknown;
    try {
      parse(netlist);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ParseError);
    expect((error as ParseError).line).toBe(2);
    expect((error as ParseError).message).toMatch(/seed/);
  });
});

describe('current-source TRRANDOM next to a voltage-source TRRANDOM on the same TS', () => {
  it('keeps drawing a new value every TS (ngspice-47 isrcacct.c freezes it here)', async () => {
    // simple-noise.cir's i3/v4 pair: ngspice merges v4's accumulated breakpoint with i3's
    // n*TS, the accepted time misses isrcacct.c's 3-ULP test and i3 holds one value.
    const tran = await transient([
      'i and v trrandom',
      'i3 3 0 DC 0 TRRANDOM(2 8p 0 1.0 0.01)',
      'R3 3 0 1',
      'v4 4 0 DC 0 TRRANDOM(2 8p 0 1.0 0.01)',
      '.tran 8p 40n',
      '.end',
    ].join('\n'));
    const draws = plateaus(tran.time, tran.voltage('3')).values.slice(1);
    expect(draws.length).toBeGreaterThan(4900);
    const mean = draws.reduce((sum, value) => sum + value, 0) / draws.length;
    const std = Math.sqrt(draws.reduce((sum, value) => sum + (value - mean) ** 2, 0) / draws.length);
    expect(std).toBeGreaterThan(0.95);
    expect(std).toBeLessThan(1.05);
  });
});

describe('control-language alter of TRNOISE/TRRANDOM coefficients', () => {
  it('re-initialises the noise source with the new coefficients for the next run', async () => {
    const result = await simulate([
      'alter trnoise',
      'i1 1 0 DC 0 TRNOISE(0.05 8p 0 1.0 0.001)',
      'r1 1 0 1',
      'v4 4 0 DC 0 TRRANDOM(2 8p 0 1.0 0.01)',
      '.tran 8p 2n',
      '.control',
      'run',
      'alter @i1[trnoise] = [ 0.1 8p 0 1.5 0.002 ]',
      'alter @v4[trrandom] = [ 2 8p 0 1.5 0.02 ]',
      'run',
      '.endc',
      '.end',
    ].join('\n'));
    const [first, second] = result.control!.runs.map(run => run.result.transient!);
    const rms = (values: ArrayLike<number>): number =>
      Math.sqrt(Array.from(values).reduce((sum, value) => sum + value * value, 0) / values.length);
    // White-noise rms doubles (0.05 -> 0.1 A through 1 ohm).
    expect(rms(second.voltage('1')) / rms(first.voltage('1'))).toBeGreaterThan(1.5);
    expect(rms(second.voltage('1')) / rms(first.voltage('1'))).toBeLessThan(2.5);
    expect(second.voltage('4').some(value => value !== 0)).toBe(true);
  });
});
