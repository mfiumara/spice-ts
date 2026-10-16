import { describe, expect, it } from 'vitest';
import { parse } from './index.js';
import { preprocess } from './preprocessor.js';
import { simulate } from '../simulate.js';
import { ParseError } from '../errors.js';
import { lowerBehavioralCapacitors } from './behavioral-capacitor.js';

const deck = (card: string) => `behavioral capacitor
.param base=1u
Vdrive p n PWL(0 0 1m 1)
Voffset n 0 2
Vcontrol ctrl 0 PWL(0 0 1m 1)
${card}
.tran 10u 1m
.end`;

describe('ngspice-47 behavioral C= (#1098)', () => {
  const continuedCards = [
    'Ctest p n C={1u*\n+ (1+v(ctrl))}',
    'Ctest p n\n+ C={1u*(1+v(ctrl))}',
  ];

  it.each(continuedCards)('parses the complete logical card: %s', card => {
    expect(() => parse(deck(card)).compile()).not.toThrow();
  });

  it.each(continuedCards)('simulates the native ramp for logical card: %s', async card => {
    const tran = (await simulate(deck(card))).transient!;
    const current = tran.current('Vdrive');
    let checked = 0;
    for (let i = 0; i < tran.time.length; i++) {
      const t = tran.time[i];
      if (t < 0.0002 || t > 0.0009) continue;
      expect(current[i]).toBeCloseTo(-0.001 * (1 + 1000 * t), 6);
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('folds across comments, strips physical-line comments and retains source metadata', () => {
    const statements = [
      { text: 'Ctest p n ; value follows', line: 6 },
      { text: '* between', line: 7 },
      { text: '+ C={1u* $ expression follows', line: 8 },
      { text: '', line: 9 },
      { text: '+ (1+v(ctrl))}', line: 10 },
      { text: 'Rnext p n 1k', line: 11 },
    ];
    const lowered = lowerBehavioralCapacitors(statements);
    expect(lowered[5]).toMatchObject({ line: 6 });
    expect(lowered[5].text).toContain('(1u* (1+v(ctrl)))');
    expect(lowered.slice(6)).toEqual([
      statements[1], { ...statements[2], text: '' }, statements[3],
      { ...statements[4], text: '' }, statements[5],
    ]);
    expect(statements[0].text).toBe('Ctest p n ; value follows');
  });

  it.each(continuedCards)('reports structured errors at the logical card origin: %s', async card => {
    await expect(preprocess(deck(`${card}\n+ ic=1`))).rejects.toMatchObject({
      name: 'ParseError', line: 6,
      context: 'Ctest p n' + (card.includes('C={1u*\n') ? ' C={1u* (1+v(ctrl))} ic=1' : ' C={1u*(1+v(ctrl))} ic=1'),
    });
  });

  it('does not clone statements when the deck has no capacitor cards (#1205)', () => {
    const statements = Object.freeze([
      Object.freeze({ text: '* capacitor-free deck', line: 1 }),
      Object.freeze({ text: 'V1 in 0 1', line: 2 }),
      Object.freeze({ text: 'R1 in out 1k', line: 3 }),
      Object.freeze({ text: 'R2 out 0 1k', line: 4 }),
      Object.freeze({ text: 'capacitor = 1', line: 5, control: true }),
      Object.freeze({ text: '.op', line: 6 }),
    ]);
    const lowered = lowerBehavioralCapacitors(statements);
    expect(lowered).toEqual(statements);
    for (let index = 0; index < statements.length; index++) {
      expect(lowered[index]).toBe(statements[index]);
    }
  });

  it('preserves ordinary physical cards and their source positions', () => {
    const statements = [
      { text: 'Cplain p n', line: 6 },
      { text: '* between', line: 7 },
      { text: '+ C={1u*', line: 8 },
      { text: '+ 2} ic=0', line: 9 },
      { text: 'Rnext p n 1k', line: 10 },
    ];
    expect(lowerBehavioralCapacitors(statements)).toEqual(statements);
  });

  it.each(["Ctest p n C = 'base*(1+V(ctrl))'", 'Ctest p n {base*(1+V(ctrl))}'])('parses %s', card => {
    expect(() => parse(deck(card)).compile()).not.toThrow();
  });

  it('uses C(control)*dV/dt, not d(C(control)*V)/dt', async () => {
    const result = await simulate(deck("Ctest p n C='base*(1+V(ctrl))'"));
    const tran = result.transient!;
    const current = tran.current('Vdrive');
    const time = tran.time;
    let checked = 0;
    for (let i = 0; i < time.length; i++) {
      if (time[i] < 0.0002 || time[i] > 0.0009) continue;
      // Ramp slope 1000 V/s, C=1u*(1+1000*t). Charge semantics adds another 1000*t mA.
      expect(current[i]).toBeCloseTo(-0.001 * (1 + 1000 * time[i]), 6);
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('rejects unsupported behavioral capacitor parameters as structured errors', async () => {
    await expect(preprocess("Cbad a 0 C={1u*(1+v(a))} ic=1"))
      .rejects.toBeInstanceOf(ParseError);
    await expect(preprocess("Cbad a 0 C={1u*(1+v(a))} ic=1"))
      .rejects.toThrow("behavioral capacitor 'Cbad'");
  });

  it.each(['scale=2', 'temp=40'])('rejects unsupported %s rather than changing its meaning', async parameter => {
    await expect(preprocess(`Cbad a 0 C={1u*(1+v(a))} ${parameter}`)).rejects.toThrow('unsupported parameter');
  });

  it.each(['Q={1u}', 'C=1u*v(a)'])('rejects unsupported syntax %s', async value => {
    await expect(preprocess(`Cbad a 0 ${value}`)).rejects.toBeInstanceOf(ParseError);
  });

  it('keeps derivative and expression nodes/branches local to each subcircuit', async () => {
    const text = deck('Xone p n ctrl cap base=1u\nXtwo p n ctrl cap base=2u').replace('.end', `
.subckt cap a b control base=3u
Ctest a b C={base*(1+v(control))}
.ends
.end`);
    const result = await simulate(text);
    const tran = result.transient!;
    const currents = tran.current('Vdrive');
    for (let i = 0; i < tran.time.length; i++) {
      const t = tran.time[i];
      if (t < 0.0002 || t > 0.0009) continue;
      expect(currents[i]).toBeCloseTo(-0.003 * (1 + 1000 * t), 6);
    }
  });

  it('handles continuation parameters and reciprocal ASRC temperature scaling', async () => {
    const result = await simulate(deck("Ctest p n C='base*(1+V(ctrl))'\n+ tc1=0.01 tc2=0.001").replace('.tran', '.options temp=37\n.tran'));
    const tran = result.transient!;
    const current = tran.current('Vdrive');
    for (let i = 0; i < tran.time.length; i++) {
      const t = tran.time[i];
      if (t < 0.0002 || t > 0.0009) continue;
      expect(current[i]).toBeCloseTo(-0.001 * (1 + 1000 * t) / 1.2, 6);
    }
  });

  it('avoids generated-name collisions and preserves constant C cards', async () => {
    const lowered = await preprocess("V__behavioral_cap_0 x 0 1\nCtest a 0 C={1u*v(x)}\nCplain b 0 1u");
    expect(lowered).toContain('i(v__behavioral_cap_1)');
    expect(lowered).toContain('Cplain b 0 1u');
    expect(await preprocess('Cplain b 0 1u\n+ ic=0')).toBe('Cplain b 0 1u\n+ ic=0');
  });

  it('keeps time-dependent capacitance live', async () => {
    const result = await simulate(deck('Ctest p n C={1u*(1+1000*time)}'));
    const tran = result.transient!;
    const current = tran.current('Vdrive');
    for (let i = 0; i < tran.time.length; i++) {
      const t = tran.time[i];
      if (t < 0.0002 || t > 0.0009) continue;
      expect(current[i]).toBeCloseTo(-0.001 * (1 + 1000 * t), 6);
    }
  });

  it('linearises the same derivative probe for AC', async () => {
    const result = await simulate(`behavioral RC AC
Vdrive in 0 DC 0 AC 1
Vcontrol ctrl 0 1
Rload in out 1k
Ctest out 0 C={1u*(1+v(ctrl))}
.ac lin 1 1000 1000
.end`);
    const actual = result.ac!.voltage('out')[0];
    const omegaRC = 2 * Math.PI * 1000 * 1000 * 2e-6;
    expect(actual.magnitude).toBeCloseTo(1 / Math.sqrt(1 + omegaRC ** 2), 8);
    expect(actual.phase).toBeCloseTo(-Math.atan(omegaRC) * 180 / Math.PI, 6);
  });
});
