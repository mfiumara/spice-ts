import { describe, expect, it } from 'vitest';
import { parse, parseTitleless } from './parser/index.js';
import { simulate } from './simulate.js';
import { TopologyPreflightError, preflightTopology } from './validation/topology-preflight.js';

/**
 * `.options rshunt=R` (#824): ngspice-47 adds 1/R to the matrix diagonal of
 * every voltage node, device-internal nodes included, in every load
 * (cktsetup.c, cktload.c, acan.c CKTacLoad; cktsopt.c ignores R <= 1e-30).
 * The shunts are noiseless: they are not devices.
 *
 * Every expected value below is ngspice-47 `ngspice -b` output on the same deck.
 */
function relativeError(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.abs(expected);
}

describe('.options rshunt (ngspice-47 node-to-ground shunt resistors)', () => {
  it('parses RSHUNT as a simulation option and round-trips it through toNetlist()', () => {
    const circuit = parse('rshunt\nV1 1 0 1\nR1 1 0 1k\n.options rshunt=1G chgtol=1e-12\n.op');

    expect(circuit.simulationOptions.rshunt).toBe(1e9);
    expect(parse(circuit.toNetlist()).simulationOptions.rshunt).toBe(1e9);
  });

  it('shunts every node to ground in the operating point', async () => {
    // ngspice-47: v(2) = 3.333333e-01, i(v1) = -1.66667e-03 (1 mA of it through the node-1 shunt).
    const result = await simulate(`rshunt op divider
V1 1 0 1
R1 1 2 1k
R2 2 0 1k
.options rshunt=1k
.op`);

    expect(result.dc!.voltage('2')).toBeCloseTo(1 / 3, 12);
    expect(result.dc!.current('V1')).toBeCloseTo(-5 / 3000, 15);
  });

  it('references a deck without a ground node through the shunts', async () => {
    // ngspice-47: v(a) = 5.000000e-01, v(b) = -5.00000e-01, i(v1) = -1.00050e-03.
    const result = await simulate(`rshunt no ground node
V1 a b 1
R1 a b 1k
.options rshunt=1meg
.op`);

    expect(result.dc!.voltage('a')).toBeCloseTo(0.5, 12);
    expect(result.dc!.voltage('b')).toBeCloseTo(-0.5, 12);
    expect(result.dc!.current('V1')).toBeCloseTo(-1.0005e-3, 15);
  });

  it('gives a node held only by a capacitor a DC path, as ngspice-47 does', async () => {
    // ngspice-47 without rshunt: "singular matrix: check node 2", gmin and source stepping fail.
    // With rshunt=1G: v(2) = 0, i(v1) = -1.00000e-09.
    const result = await simulate(`rshunt floating cap node
V1 1 0 1
C1 1 2 1n
.options rshunt=1G
.op`);

    expect(result.dc!.voltage('2')).toBe(0);
    expect(result.dc!.current('V1')).toBeCloseTo(-1e-9, 20);
  });

  it('shunts device-internal nodes too (diode RS node)', async () => {
    // ngspice-47: v(1) = 3.437494e-01, i(v1) = -1.65625e-03.
    const result = await simulate(`rshunt diode internal node
V1 in 0 1
R1 in 1 1k
D1 1 0 dmod
.model dmod d(is=1e-14 rs=100)
.options rshunt=1k
.op`);

    expect(relativeError(result.dc!.voltage('1'), 3.437494e-1)).toBeLessThan(1e-6);
    expect(relativeError(result.dc!.current('V1'), -1.65625e-3)).toBeLessThan(1e-5);
  });

  it('loads the shunts in AC analysis', async () => {
    // ngspice-47 print vm(out) vp(out) (phase in radians).
    const ngspice = [
      [4.997534e-1, -3.14056e-2],
      [4.770141e-1, -3.04396e-1],
      [1.516572e-1, -1.26263],
      [1.590744e-2, -1.53898],
    ];
    const result = await simulate(`rshunt ac
V1 in 0 dc 0 ac 1
R1 in out 1k
C1 out 0 1u
.options rshunt=1k
.ac dec 1 10 10k`);

    const out = result.ac!.voltage('out');
    expect(out).toHaveLength(ngspice.length);
    ngspice.forEach(([magnitude, phase], index) => {
      expect(relativeError(out[index].magnitude, magnitude)).toBeLessThan(1e-6);
      expect(relativeError(out[index].phase * Math.PI / 180, phase)).toBeLessThan(1e-5);
    });
  });

  it('loads the shunts in transient analysis', async () => {
    // ngspice-47 meas: v(out) at 0.5 ms = 3.51515e-01, at 1 ms = 5.17806e-01.
    const result = await simulate(`rshunt tran
V1 in 0 pulse(0 1 0 1u 1u 1m 2m)
R1 in out 1k
C1 out 0 1u
.options rshunt=2k
.tran 10u 1m`);

    const time = result.transient!.time;
    const out = result.transient!.voltage('out');
    const at = (t: number): number => {
      const index = time.findIndex(value => value >= t - 1e-15);
      if (Math.abs(time[index] - t) < 1e-15) return out[index];
      const fraction = (t - time[index - 1]) / (time[index] - time[index - 1]);
      return out[index - 1] + fraction * (out[index] - out[index - 1]);
    };
    expect(relativeError(at(0.5e-3), 3.51515e-1)).toBeLessThan(2e-3);
    expect(relativeError(at(1e-3), 5.17806e-1)).toBeLessThan(2e-3);
  });

  it('keeps the shunts noiseless in .noise', async () => {
    // ngspice-47: onoise_spectrum = 1.919263e-09, inoise_spectrum = 5.757789e-09 at 1 kHz.
    const result = await simulate(`rshunt noise
V1 in 0 dc 0 ac 1
R1 in out 1k
R2 out 0 1k
.options rshunt=1k
.noise v(out) V1 dec 1 1k 1k`);

    expect(relativeError(result.noise!.outputNoiseDensity[0], 1.919263e-9)).toBeLessThan(1e-5);
    expect(relativeError(result.noise!.inputNoiseDensity[0], 5.757789e-9)).toBeLessThan(1e-5);
  });

  it('ignores an RSHUNT of at most 1e-30 with a warning, as ngspice-47 cktsopt.c does', async () => {
    // ngspice-47: "WARNING - Rshunt option too small.  Ignored." and v(2) = 5.000000e-01.
    const result = await simulate(`rshunt too small
V1 1 0 1
R1 1 2 1k
R2 2 0 1k
.options rshunt=0
.op`);

    expect(result.dc!.voltage('2')).toBeCloseTo(0.5, 12);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      message: expect.stringContaining('rshunt'),
    }));
  });

  it('lets the topology preflight accept nodes referenced only through the shunts', () => {
    const floating = 'V1 a b 1\nR1 a b 1k\nC1 b c 1n\n.op';
    expect(() => preflightTopology(parseTitleless(floating).compile())).toThrowError(TopologyPreflightError);
    expect(() => preflightTopology(parseTitleless(`${floating}\n.options rshunt=1G`).compile())).not.toThrow();
  });

  it.each([
    ['T', 'T1 a 0 b 0 Z0=50 TD=1n'],
    ['O', 'O1 a 0 b 0 lmod\n.model lmod ltra(r=0.1 l=1n c=1p len=1)'],
  ])('rejects RSHUNT with a %s line, whose internal rows ngspice-47 also shunts', (_type, line) => {
    // ngspice-47 trasetup.c/ltraset.c make the line's rows with CKTmkVolt. With
    // V1 in 0 1, R1 in a 50, T1 Z0=50, R2 b 0 50 and rshunt=100, ngspice-47
    // prints v(a) = -3.96577e-02, v(b) = 6.278985e-01; the spice-ts T model has no such rows.
    const deck = `rshunt line\nV1 in 0 1\nR1 in a 50\n${line}\nR2 b 0 50\n.options rshunt=100\n.op`;
    expect(() => parse(deck).compile()).toThrowError(/Unsupported \.options rshunt with transmission line/);
  });
});
