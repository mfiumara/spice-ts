import { describe, expect, it } from 'vitest';
import { simulate } from './simulate.js';
import { CurrentSource } from './devices/current-source.js';
import { PwlBreakpointSchedule, VoltageSource, pwlBreakpoints } from './devices/voltage-source.js';
import { parseTitleless as parse } from './parser/index.js';
import type { PWLSource, SourceWaveform } from './types.js';

/**
 * Issue #716: EXP, SFFM and AM source waveforms and PWL TD=/R= at ngspice-47
 * parity (vsrcload.c/isrcload.c values, vsrcacct.c/isrcacct.c breakpoints).
 * Reference numbers are Homebrew ngspice-47 `wrdata` output of the decks below
 * run unchanged with `set numdgt=17` in a `.control` block.
 */

/** Every source drives a 1 ohm load, so v(n) is the source value. */
const REFERENCE_DECK = `source waveform reference
V1 1 0 EXP(0 5 0 0)
R1 1 0 1
V2 2 0 EXP(1 -2 1u 0.5u 3u 2u)
R2 2 0 1
V3 3 0 SFFM(0.5 1)
R3 3 0 1
V4 4 0 SFFM(0 1 1MEG 2 250K 1u 30 45)
R4 4 0 1
V5 5 0 AM(0.2 1 0.5 100k 1MEG 1u 10 20)
R5 5 0 1
V6 6 0 AM(0 1)
R6 6 0 1
I7 0 7 SFFM(0 2 1MEG -1 250K)
R7 7 0 1
I8 0 8 AM(0.1 1 0.5 200k 2MEG)
R8 8 0 1
I9 0 9 EXP(1 5 2u 1u 6u 0.5u)
R9 9 0 1
.tran 0.1u 10u
.end
`;

/**
 * ngspice-47 [time, v(n)] at nine of its 108 REFERENCE_DECK time points.
 * Covers the TSTEP defaults of EXP (V1: TD1 = TAU1 = TAU2 = TSTEP,
 * TD2 = TD1 + TSTEP), the TSTOP defaults and MDI clamp of SFFM (V3:
 * FC = 5/TSTOP, FM = 500/TSTOP, MDI 90 -> FC/FM; I7: MDI < 0 -> 0), the AM
 * defaults (V6), TD and phases (V4, V5), and the value 0, not VO, at and
 * before TD (V3, V5, V6, I8 at t = 0).
 */
const NGSPICE: Record<number, Array<[number, number]>> = {
  1: [[0.0, 0.0], [1e-09, 0.0], [1.6e-08, 0.0], [8.28e-07, 0.005921075152648392], [2.027999999999999e-06, 3.638034351549635e-08], [2.927999999999998e-06, 4.4896308892816705e-12], [4.727999999999996e-06, 0.0], [6.527999999999994e-06, 0.0], [9.999999999999999e-06, 0.0]],
  2: [[0.0, 1.0], [1e-09, 1.0], [1.6e-08, 1.0], [8.28e-07, 1.0], [2.027999999999999e-06, -1.616105579698913], [2.927999999999998e-06, -1.9365426791297597], [4.727999999999996e-06, -0.2626845541050481], [6.527999999999994e-06, 0.48597319965512575], [9.999999999999999e-06, 0.9094078954229837]],
  3: [[0.0, 0.0], [1e-09, 0.5062317222624744], [1.6e-08, 0.540743636161194], [8.28e-07, 1.009390260886754], [2.027999999999999e-06, 0.5937047716958064], [2.927999999999998e-06, 0.7185387945241452], [4.727999999999996e-06, 1.2503790593831305], [6.527999999999994e-06, 1.4956000280039357], [9.999999999999999e-06, 0.4999999999999988]],
  4: [[0.0, 0.0], [1e-09, 0.0], [1.6e-08, 0.0], [8.28e-07, 0.0], [2.027999999999999e-06, 0.474026081647003], [2.927999999999998e-06, -0.4485385446107524], [4.727999999999996e-06, -0.6677944998699541], [6.527999999999994e-06, -0.9843285374693561], [9.999999999999999e-06, 0.5844026166944888]],
  5: [[0.0, 0.0], [1e-09, 0.0], [1.6e-08, 0.0], [8.28e-07, 0.0], [2.027999999999999e-06, 0.8845129971200041], [2.927999999999998e-06, 0.04616907688461805], [4.727999999999996e-06, -1.0638032638441435], [6.527999999999994e-06, -0.17968270657389415], [9.999999999999999e-06, 0.4670542620983424]],
  6: [[0.0, 0.0], [1e-09, 0.3099877982973999], [1.6e-08, -0.9988417025068302], [8.28e-07, 0.8901652234454793], [2.027999999999999e-06, 0.6394228900214491], [2.927999999999998e-06, 0.7196082980994475], [4.727999999999996e-06, 1.0311230904119488], [6.527999999999994e-06, 1.173297897062405], [9.999999999999999e-06, 1.333307049589006e-13]],
  7: [[0.0, 0.0], [1e-09, 0.012566287931117902], [1.6e-08, 0.2007234297024298], [8.28e-07, -1.764582452869907], [2.027999999999999e-06, 0.3500461179505401], [2.927999999999998e-06, -0.8742315333018932], [4.727999999999996e-06, -1.9809228513932953], [6.527999999999994e-06, -0.3500461179504784], [9.999999999999999e-06, -1.9109441911791416e-14]],
  8: [[0.0, 0.0], [1e-09, 0.11257393535699106], [1.6e-08, 0.30171754894951824], [8.28e-07, -1.088854729837297], [2.027999999999999e-06, 0.5409639635453827], [2.927999999999998e-06, -0.4848874470180206], [4.727999999999996e-06, 0.32720676269928967], [6.527999999999994e-06, 0.606555664287441], [9.999999999999999e-06, 0.0999999999999809]],
  9: [[0.0, 1.0], [1e-09, 1.0], [1.6e-08, 1.0], [8.28e-07, 1.0], [2.027999999999999e-06, 1.110446532795009], [2.927999999999998e-06, 3.418625570295598], [4.727999999999996e-06, 4.7386005649078164], [6.527999999999994e-06, 2.3481685996658777], [9.999999999999999e-06, 1.0000000000000004]],
};

const TSTEP = 0.1e-6;
const TSTOP = 10e-6;

function referenceSources(): Map<number, VoltageSource | CurrentSource> {
  const devices = parse(REFERENCE_DECK.split('\n').slice(1).join('\n')).compile().devices;
  const result = new Map<number, VoltageSource | CurrentSource>();
  for (const device of devices) {
    if (device instanceof VoltageSource || device instanceof CurrentSource) {
      device.setTransientTimestep(TSTEP, TSTOP);
      result.set(Number(device.name.slice(1)), device);
    }
  }
  return result;
}

function valueAt(source: VoltageSource | CurrentSource, time: number): number {
  return source instanceof VoltageSource ? source.getVoltageAtTime(time) : source.getCurrentAtTime(time);
}

describe('EXP, SFFM and AM sources (#716)', () => {
  it('parses the ngspice-47 coefficient order and leaves omitted coefficients undefined', () => {
    const waveforms = new Map([...referenceSources()].map(([index, source]) => [index, source.waveform]));
    expect(waveforms.get(1)).toEqual({ type: 'exp', v1: 0, v2: 5, td1: 0, tau1: 0 });
    expect(waveforms.get(2)).toEqual({ type: 'exp', v1: 1, v2: -2, td1: 1e-6, tau1: 0.5e-6, td2: 3e-6, tau2: 2e-6 });
    expect(waveforms.get(3)).toEqual({ type: 'sffm', offset: 0.5, amplitude: 1 });
    expect(waveforms.get(4)).toEqual({
      type: 'sffm', offset: 0, amplitude: 1, carrierFrequency: 1e6, modulationIndex: 2,
      signalFrequency: 250e3, delay: 1e-6, signalPhase: 30, carrierPhase: 45,
    });
    expect(waveforms.get(5)).toEqual({
      type: 'am', offset: 0.2, carrierAmplitude: 1, modulationAmplitude: 0.5, modulationFrequency: 100e3,
      carrierFrequency: 1e6, delay: 1e-6, modulationPhase: 10, carrierPhase: 20,
    });
    expect(waveforms.get(6)).toEqual({ type: 'am', offset: 0, carrierAmplitude: 1 });
  });

  it('evaluates every V and I source like ngspice-47 at its time points', () => {
    const sources = referenceSources();
    for (const [index, samples] of Object.entries(NGSPICE)) {
      const source = sources.get(Number(index))!;
      for (const [time, expected] of samples) {
        expect(valueAt(source, time), `${source.name} at ${time}`).toBeCloseTo(expected, 10);
      }
    }
  });

  it('runs the reference deck from the same operating point to the same end values as ngspice-47', async () => {
    const tran = (await simulate(REFERENCE_DECK)).transient!;
    expect(tran.time[0]).toBe(0);
    for (const [index, samples] of Object.entries(NGSPICE)) {
      const node = tran.voltage(index);
      // t = 0 is the DC operating point: SFFM/AM give 0 there, EXP gives V1.
      expect(node[0], `v(${index}) at t=0`).toBeCloseTo(samples[0][1], 9);
      expect(node[node.length - 1], `v(${index}) at TSTOP`).toBeCloseTo(samples[samples.length - 1][1], 6);
    }
  });

  it('registers no EXP/SFFM/AM breakpoints, as ngspice-47 vsrcacct.c/isrcacct.c do not', () => {
    for (const source of referenceSources().values()) {
      expect(source.getBreakpoints(TSTOP), source.name).toEqual([]);
    }
  });

  it('keeps an explicit DC value for the operating point (corpus-g TL1X card)', () => {
    const [source] = parse('VSLOW 1 22 DC 0 EXP(0v 10v 3ms 10ms 200ms 10ms)\nR 1 22 1').compile().devices;
    expect((source as VoltageSource).waveform).toEqual({
      type: 'exp', dc: 0, v1: 0, v2: 10, td1: 3e-3, tau1: 10e-3, td2: 200e-3, tau2: 10e-3,
    });
  });

  it('rejects fewer than two values (ngspice E_BADPARM) and more values than ngspice reads', () => {
    expect(() => parse('V1 1 0 EXP(1)')).toThrow(/EXP source requires at least two values/);
    expect(() => parse('V1 1 0 SFFM(1)')).toThrow(/SFFM source requires at least two values/);
    expect(() => parse('V1 1 0 EXP(0 1 2 3 4 5 6)')).toThrow(/Unsupported EXP source parameters: '6'/);
    expect(() => parse('V1 1 0 AM(0 1 2 3 4 5 6 7 8)')).toThrow(/Unsupported AM source parameters: '8'/);
  });

  it('requires SFFM/AM frequencies when the transient run has no stop time', () => {
    const defaulted: SourceWaveform = { type: 'sffm', offset: 0, amplitude: 1 };
    expect(() => new VoltageSource('V1', [0, -1], 0, defaulted).setTransientTimestep(1e-7))
      .toThrow(/SFFM frequencies default from the transient stop time/);
    const explicit: SourceWaveform = {
      type: 'am', offset: 0, carrierAmplitude: 1, modulationFrequency: 1, carrierFrequency: 2,
    };
    expect(() => new CurrentSource('I1', [0, -1], explicit).setTransientTimestep(1e-7)).not.toThrow();
  });
});

/** corpus-g VPWL's VPWL6 (R=7 TD=1, no parentheses) and VPWL5 (TD=1 R=0). */
const PWL_DECK = `
VPWL6 6 0 PWL 0S 0V,  2S 3V,  3S 2V,  4S 2V,  4.01V 5V,  4.5S 5V
+ 4.51S -2V,  7S 1V,  9S -1V,  9.01S 4V,  10S 3V  R=7 TD=1
R6 6 0 500
VPWL5 5 0 PWL(0S 0V  2S 3V  3S 2V 4S 2V 4.01V 5V 4.5S 5V 4.51S -2V 7S 1V 9S -1V 9.01S 4V 10S 3V) TD=1 R=0
R5 5 0 500
.TRAN 0.01S 30S
.end
`;

/**
 * ngspice-47 [time, v(6), v(5)] of PWL_DECK around VPWL6's first two
 * wrap-arounds. ngspice requests each corner at `(T + corner) - mapped`, lands
 * at 13.999999999999998 before the 3 V -> 1 V jump, and at exactly 17 after it.
 */
const NGSPICE_PWL: Array<[number, number, number]> = [
  [13.980499999999981, 3.019696969696988, 2.0195000000000185],
  [13.990499999999981, 3.0095959595959787, 2.0095000000000187],
  [13.999999999999998, 3.0000000000000018, 2.0000000000000018],
  [14.000999999999998, 0.9990000000000023, 2.0],
  [16.990500000000146, 3.0095959595958117, -0.2162650602407874],
  [17.0, 1.0, -0.20481927710843373],
  [17.001, 0.9989999999999988, -0.20361445783132381],
];

/**
 * Breakpoints ngspice-47 requests for VPWL6 alone (`.TRAN 0.01S 30S`); every
 * one is a time point of its run, bit for bit.
 */
const NGSPICE_VPWL6_BREAKPOINTS = [
  1, 3, 4, 5, 5.01, 5.5, 5.51, 8, 10, 10.009999999999998, 11, 12.999999999999998, 13.01,
  13.999999999999998, 16, 16.009999999999998, 17, 19, 19.009999999999998, 20, 22,
  22.009999999999998, 23, 25, 25.009999999999998, 26, 28, 28.009999999999998, 29,
];

function vpwl6(): VoltageSource {
  return parse(PWL_DECK).compile().devices.find(device => device.name === 'VPWL6') as VoltageSource;
}

describe('PWL TD= and R= (#716)', () => {
  it('parses TD= and R= after the point list, with or without parentheses', () => {
    const devices = parse(PWL_DECK).compile().devices;
    const vpwl5 = devices.find(device => device.name === 'VPWL5') as VoltageSource;
    expect(vpwl6().waveform).toMatchObject({ type: 'pwl', delay: 1, repeat: 7 });
    expect((vpwl6().waveform as PWLSource).points).toHaveLength(11);
    expect(vpwl5.waveform).toMatchObject({ type: 'pwl', delay: 1, repeat: 0 });
  });

  it('reads R below -0.5 as no repetition (ngspice vsrcpar.c)', () => {
    const [source] = parse('V1 1 0 PWL(0 0 1 1) R=-1 TD=2').compile().devices;
    expect((source as VoltageSource).waveform).toEqual({
      type: 'pwl', points: [{ time: 0, value: 0 }, { time: 1, value: 1 }], delay: 2,
    });
  });

  it('delays and repeats V and I waveforms like ngspice vsrcload.c/isrcload.c', () => {
    const pwl: SourceWaveform = {
      type: 'pwl', delay: 1, repeat: 1,
      points: [{ time: 0, value: 0 }, { time: 1, value: 1 }, { time: 2, value: 3 }],
    };
    const voltage = new VoltageSource('V1', [0, -1], 0, pwl);
    const current = new CurrentSource('I1', [0, -1], pwl);
    for (const [time, expected] of [[0, 0], [1, 0], [1.5, 0.5], [3, 3], [3.5, 2], [4, 1], [4.25, 1.5], [5.5, 2]]) {
      expect(voltage.getVoltageAtTime(time), `v at ${time}`).toBeCloseTo(expected, 12);
      expect(current.getCurrentAtTime(time), `i at ${time}`).toBeCloseTo(expected, 12);
    }
  });

  it('requests the same accept-time breakpoints as ngspice vsrcacct.c', () => {
    const schedule = new PwlBreakpointSchedule(vpwl6().waveform as PWLSource);
    const requested: number[] = [];
    // Accept at each breakpoint; at 11 (= TD + last point) no corner lies
    // ahead, so ngspice asks again at its next point, 11.001.
    for (let now = 0; now <= 30;) {
      const next = schedule.next(now, 30, 0.01);
      if (next === undefined) {
        now += 0.001;
        continue;
      }
      if (next > 30) break;
      requested.push(next);
      now = next;
    }
    expect(requested).toEqual(NGSPICE_VPWL6_BREAKPOINTS);
    // Only the first corner is known before the run; the rest come on accept.
    expect(pwlBreakpoints(vpwl6().waveform as PWLSource, 30, 0.01)).toEqual([1]);
  });

  it('lands on every ngspice breakpoint and samples each wrap-around on the same side', async () => {
    const tran = (await simulate(PWL_DECK)).transient!;
    const times = new Set(tran.time);
    expect(NGSPICE_VPWL6_BREAKPOINTS.filter(time => !times.has(time))).toEqual([]);
    const v6 = tran.voltage('6');
    const v5 = tran.voltage('5');
    // Between breakpoints both sources are linear, so interpolating spice-ts's
    // own points is exact; at the wrap breakpoints spice-ts has the sample itself.
    const at = (values: number[], time: number): number => {
      const right = tran.time.findIndex(candidate => candidate >= time);
      if (tran.time[right] === time) return values[right];
      const left = right - 1;
      const fraction = (time - tran.time[left]) / (tran.time[right] - tran.time[left]);
      return values[left] + (values[right] - values[left]) * fraction;
    };
    for (const [time, expected6, expected5] of NGSPICE_PWL) {
      expect(at(v6, time), `v(6) at ${time}`).toBeCloseTo(expected6, 9);
      expect(at(v5, time), `v(5) at ${time}`).toBeCloseTo(expected5, 9);
    }
    expect(v6[tran.time.indexOf(13.999999999999998)]).toBeCloseTo(3, 12);
    expect(v6[tran.time.indexOf(17)]).toBeCloseTo(1, 12);
  });
});

describe('netlist and IR serialization of the #716 waveforms', () => {
  it('writes cards that parse back to the same waveforms', () => {
    const deck = [
      'V1 1 0 EXP(0 5 1u 0.2u 2u 0.5u)',
      'V2 2 0 DC 0 EXP(0 10 3m)',
      'I3 0 3 SFFM(0 5 10k 3 1k)',
      'V4 4 0 AM(0.2 1 0.5 100k 1MEG 1u 10 20)',
      'V5 5 0 PWL(0 0 2 3 3 2) TD=1 R=2',
    ].join('\n');
    const original = parse(deck);
    const netlist = original.toNetlist();
    expect(netlist).toContain('V5 5 0 PWL(0 0 2 3 3 2) TD=1 R=2');
    const waveforms = (circuit: ReturnType<typeof parse>) => circuit.compile().devices
      .map(device => (device as VoltageSource | CurrentSource).waveform);
    expect(waveforms(parse(netlist))).toEqual(waveforms(original));
  });

  it('writes an omitted middle coefficient as the value ngspice reads as omitted', () => {
    const circuit = parse('R1 1 0 1');
    circuit.addVoltageSource('V1', '1', '0', { type: 'exp', v1: 0, v2: 1, tau2: 1e-6 });
    expect(circuit.toNetlist()).toContain('EXP(0 1 0 0 0 0.000001)');
    circuit.addVoltageSource('V2', '2', '0', { type: 'sffm', offset: 0, amplitude: 1, modulationIndex: 2 });
    expect(() => circuit.toNetlist()).toThrow(/SFFM coefficient 3 is omitted before a given one/);
  });

  it('keeps the coefficients in the CircuitIR', () => {
    const ir = parse('V1 1 0 SFFM(0 5 10k 3 1k)\nV2 2 0 PWL(0 0 1 1) TD=2').toIR();
    expect(ir.components[0]).toMatchObject({
      params: { waveform: 'sffm', offset: 0, amplitude: 5, carrierFrequency: 1e4, modulationIndex: 3, signalFrequency: 1e3 },
      displayValue: 'SFFM 5',
    });
    expect(ir.components[1]).toMatchObject({ params: { waveform: 'pwl', points: '0:0,1:1', delay: 2 } });
  });
});
