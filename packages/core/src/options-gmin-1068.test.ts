import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from './parser/index.js';
import { simulate } from './simulate.js';

const deck = readFileSync(new URL('../../../benchmarks/results/issue-1068/weak-diode.cir', import.meta.url), 'utf8');
const fixture = (name: string): string => readFileSync(new URL(`../../../benchmarks/results/issue-1068/${name}.cir`, import.meta.url), 'utf8');
const relativeError = (actual: number, expected: number): number => Math.abs((actual - expected) / expected);

describe('.options gmin is junction conductance (#1068)', () => {
  it.each([
    ['bjt', 'Vc', -1e-8],
    ['bjt', 'Vb', 5e-9],
    ['mos1', 'Vd', -5e-9],
    ['jfet', 'Vg', 1.5e-8],
  ])('matches ngspice-47 %s reverse junction current %s', async (name, source, current) => {
    const result = await simulate(fixture(name));
    expect(relativeError(result.dc!.current(source), current)).toBeLessThan(1e-3);
  });

  it('includes configured gmin in diode AC diffusion capacitance', async () => {
    const result = await simulate(fixture('diode-ac'));
    const current = result.ac!.current('V1')[0];
    const phase = current.phase * Math.PI / 180;
    expect(relativeError(current.magnitude * Math.cos(phase), -1e-6)).toBeLessThan(1e-3);
    expect(relativeError(current.magnitude * Math.sin(phase), -6.283185e-6)).toBeLessThan(1e-3);
  });

  it('keeps the programmatic gmin API as a diagonal shunt', async () => {
    const result = await simulate('divider\nV1 in 0 1\nR1 in out 1k\nR2 out 0 1k\n.op', { gmin: 1e-3 });
    expect(result.dc!.voltage('out')).toBeCloseTo(1 / 3, 12);
  });

  it('applies the junction option to transient loads, not just the initial operating point', async () => {
    const result = await simulate(fixture('diode-ac').replace('.ac lin 1 1k 1k\n.print ac real(i(v1)) imag(i(v1))', '.tran 1u 10u'));
    for (const current of result.transient!.current('V1')) {
      expect(relativeError(current, 5e-6)).toBeLessThan(1e-3);
    }
  });

  it('lets the caller override the junction baseline independently of the netlist', async () => {
    const result = await simulate(deck, { deviceGmin: 1e-12 });
    expect(relativeError(result.dc!.voltage('weak'), 8.525792e-4)).toBeLessThan(1e-3);
  });
  it('matches ngspice-47 on the weak diode, without a diagonal gmin shunt', async () => {
    const result = await simulate(deck);
    expect(relativeError(result.dc!.voltage('weak'), 2.398806)).toBeLessThan(1e-3);
    expect(relativeError(result.dc!.current('Vbias'), -2.60620e-9)).toBeLessThan(1e-3);
  });

  it('preserves the default junction gmin result', async () => {
    const result = await simulate(deck.replace('gmin=1e-9 ', ''));
    expect(relativeError(result.dc!.voltage('weak'), 8.525792e-4)).toBeLessThan(1e-3);
    expect(relativeError(result.dc!.current('Vbias'), -1.00091e-11)).toBeLessThan(1e-3);
  });

  it('round-trips the junction option independently of the diagonal API option', () => {
    const circuit = parse(deck);
    expect(circuit.simulationOptions).toMatchObject({ deviceGmin: 1e-9 });
    expect(circuit.simulationOptions.gmin).toBeUndefined();
    expect(parse(circuit.toNetlist()).simulationOptions).toMatchObject({ deviceGmin: 1e-9 });
  });
});
