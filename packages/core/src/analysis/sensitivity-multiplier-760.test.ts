import { describe, expect, it } from 'vitest';
import type { SensitivityEntry, SensitivityResult } from '../results.js';
import { simulate } from '../simulate.js';

/**
 * Multiplier (`m`) and `scale` sensitivities of R, C, L and current sources,
 * named `<dev>_m` / `<dev>_scale` like ngspice-47 (#760).
 *
 * Expected numbers were printed by `ngspice -b` 47 (Homebrew build) with
 * `set numdgt=15` and `sens v(...) ...` + `print all` on the identical circuit.
 * ngspice differentiates by one-sided finite differences (cktsens.c), so it
 * agrees with the exact derivative to about 1e-6 relative; spice-ts uses a
 * symmetric difference, hence the 1e-5 relative tolerance.
 */

const TOLERANCE = 1e-5;

function vectorName(entry: SensitivityEntry): string {
  const device = entry.device.toLowerCase();
  switch (entry.parameter) {
    case 'multiplier': return `${device}_m`;
    case 'scale': return `${device}_scale`;
    case 'acMagnitude': return `${device}_acmag`;
    case 'gain': return `${device}_gain`;
    default: return device;
  }
}

function byName(sensitivity: SensitivityResult): Map<string, SensitivityEntry> {
  return new Map(sensitivity.entries.map(entry => [vectorName(entry), entry]));
}

function expectReal(actual: number | undefined, expected: number): void {
  expect(actual).toBeDefined();
  if (expected === 0) {
    expect(actual).toBe(0);
    return;
  }
  expect(Math.abs(actual! - expected)).toBeLessThan(TOLERANCE * Math.abs(expected));
}

function expectComplex(
  actual: SensitivityEntry['ac'],
  expected: readonly (readonly [number, number])[],
): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach(([re, im], index) => {
    const magnitude = Math.hypot(re, im);
    expect(Math.abs(actual![index].real - re)).toBeLessThan(TOLERANCE * magnitude);
    expect(Math.abs(actual![index].imaginary - im)).toBeLessThan(TOLERANCE * magnitude);
  });
}

describe('.sens multiplier and scale sensitivities (#760)', () => {
  it('differentiates DC outputs by the instance m and scale of R and I (ngspice-47)', async () => {
    const result = await simulate(`* mvals
i1  0 1  dc=42mA m=3
r1  1 2  1k m=2
r3 2 0 500
r2  1 0 3k scale=2
.sens v(1)
.end`);
    const vectors = byName(result.sensitivity!);
    const ngspice: [string, number][] = [
      ['i1', 2.571428571491186e+03],
      ['i1_m', 3.600000000168548e+01],
      ['r1', 4.628566800259579e-02],
      ['r1_m', -2.31428571407124e+01],
      ['r1_scale', 4.628566799255917e+01],
      ['r2', 5.142851999730830e-03],
      ['r2_m', -1.54285714279780e+01],
      ['r2_scale', 7.714277999596245e+00],
      ['r3', 9.257133600519156e-02],
      ['r3_m', -4.62857142814248e+01],
      ['r3_scale', 4.628566799255916e+01],
    ];
    for (const [name, value] of ngspice) expectReal(vectors.get(name)?.dc, value);
    expect([...vectors.keys()]).toEqual(ngspice.map(([name]) => name));
  });

  it('lists zero DC m/scale sensitivities for C and L, without a primary C/L vector (ngspice-47)', async () => {
    const result = await simulate(`* dcrcl
i1  0 1  dc=42mA
r1  1 2  1k
l1  2 3  1u
r2  3 0  2k
c1  1 0  1n
.sens v(1)
.end`);
    const vectors = byName(result.sensitivity!);
    for (const name of ['c1_m', 'c1_scale', 'l1_m', 'l1_scale']) {
      expect(Math.abs(vectors.get(name)!.dc!)).toBe(0);
    }
    expect(vectors.has('c1')).toBe(false);
    expect(vectors.has('l1')).toBe(false);
    expectReal(vectors.get('i1_m')?.dc, 1.259999999896344e+02);
    expectReal(vectors.get('r2_m')?.dc, -8.39999999922153e+01);
    expectReal(vectors.get('r2_scale')?.dc, 8.399991598649626e+01);
  });

  it('differentiates AC outputs by m and scale of R, C, L and an m=3 current source (ngspice-47)', async () => {
    const result = await simulate(`* clm
i1  0 1  dc=42mA ac=1 m=3
r1  1 2  1k
l1  2 0  10u m=4 scale=3
c1  1 0  1n m=5 scale=2
.sens v(1) ac lin 1 1e6 1.1e6
.end`);
    const vectors = byName(result.sensitivity!);
    const ngspice: [string, number, number][] = [
      ['i1_acmag', 7.591694735563266e-01, -4.77701753848189e+01],
      ['i1_m', 2.530564912041722e-01, -1.59233917961182e+01],
      ['r1', -7.57691347475316e-04, 4.733876872392281e-05],
      ['r1_m', 7.576921050547099e-01, -4.73388160556969e-02],
      ['r1_scale', -7.57691347311018e-01, 4.733876871365784e-02],
    ];
    for (const [name, re, im] of ngspice) expectComplex(vectors.get(name)?.ac, [[re, im]]);

    // C = C_unit * m with C_unit = 1n * scale; L = L_unit / m with L_unit = 10u * scale.
    // The exact chain rule from the effective-value sensitivity (vectors c1 / l1):
    const c1 = vectors.get('c1')!.ac![0];
    const l1 = vectors.get('l1')!.ac![0];
    const times = (value: { real: number; imaginary: number }, factor: number): [number, number] =>
      [value.real * factor, value.imaginary * factor];
    const capacitance = 1e-9 * 2 * 5;
    const inductance = 10e-6 * 3 / 4;
    expectComplex(vectors.get('c1_m')?.ac, [times(c1, capacitance / 5)]);
    expectComplex(vectors.get('c1_scale')?.ac, [times(c1, capacitance / 2)]);
    expectComplex(vectors.get('l1_m')?.ac, [times(l1, -inductance / 4)]);
    expectComplex(vectors.get('l1_scale')?.ac, [times(l1, inductance / 3)]);

    // Published divergence: ngspice-47 prints these C/L vectors m*scale (C) and scale (L)
    // times too large. cktsens.c reads the primary value with CAPask/INDask, which return the
    // post-temperature value (CAPcapac * CAPm, INDinduct, both already times SCALE), and writes
    // it back through CAPparam/INDparam as the *instance* value, so CAPtemp/INDtemp apply SCALE
    // (and, for C, m) a second time for every later vector of that instance; its own c1/l1
    // vectors in that run are orders of magnitude off too. spice-ts keeps the exact derivative.
    const ngspiceDoubleScaled: [string, number, number, number][] = [
      ['c1_m', -3.03818473594374e+00, 9.556361761590848e+01, 5 * 2],
      ['c1_scale', -7.59546183964663e+00, 2.389090440330802e+02, 5 * 2],
      ['l1_m', 1.673090190394953e-03, 2.677902266958321e-02, 3],
      ['l1_scale', -2.23078915128283e-03, -3.57053992643165e-02, 3],
    ];
    for (const [name, re, im, factor] of ngspiceDoubleScaled) {
      expectComplex(vectors.get(name)?.ac, [[re / factor, im / factor]]);
    }
  });

  it('matches every m/scale vector of sens-ac-2.cir (ngspice-47)', async () => {
    const result = await simulate(`* ac2
v1  1 0  dc=1.27 ac=42mA
r1  1 2  68.0
c2  2 0  1.5n
l3  2 3  12u
c4  3 0  1.8n
r5  3 0  100.0
.sens v(3) ac lin 1 1e6 1.1e6
.end`);
    const vectors = byName(result.sensitivity!);
    const ngspice: [string, number, number][] = [
      ['c2', -4.91298793812204e+06, -1.13114679909817e+06],
      ['c2_m', -7.36948190597704e-03, -1.69672019836959e-03],
      ['c2_scale', -7.36948190582663e-03, -1.69672019833496e-03],
      ['c4', -7.41948847798458e+06, -1.22693903059340e+06],
      ['c4_m', -1.33550792598254e-02, -2.20849025497770e-03],
      ['c4_scale', -1.33550792603722e-02, -2.20849025506813e-03],
      ['l3', -1.67002166173110e+03, -4.53410317755899e+02],
      ['l3_m', 2.004023989929820e-02, 5.440918371817086e-03],
      ['l3_scale', -2.00402599407732e-02, -5.44092381307079e-03],
      ['r1', -3.87798927291423e-05, 1.962379805942308e-04],
      ['r1_m', 2.637035342503791e-03, -1.33441960240307e-02],
      ['r1_scale', -2.63703270558168e-03, 1.334418268040769e-02],
      ['r5', 1.952732163453960e-05, -1.18084708580257e-04],
      ['r5_m', -1.95273411564354e-03, 1.180848266321547e-02],
      ['r5_scale', 1.952732163115216e-03, -1.18084708559773e-02],
      ['v1_acmag', 1.258214312721957e-01, -5.91502676915617e-01],
    ];
    for (const [name, re, im] of ngspice) expectComplex(vectors.get(name)?.ac, [[re, im]]);
    // A voltage source has no instance m in ngspice-47.
    expect(vectors.has('v1_m')).toBe(false);
  });

  it('keeps every point of r_m/r_scale/c_m in a multi-point AC sweep (ngspice-47)', async () => {
    const result = await simulate(`* mp
i1  0 1  dc=42mA ac=1
r1  1 2  1k
l1  2 0  10u
c1  1 0  1n
.sens v(1) ac dec 1 1e5 1e7
.end`);
    const vectors = byName(result.sensitivity!);
    expectComplex(vectors.get('r1_m')?.ac, [
      [-3.10545785584690e+02, 6.507274010628938e+02],
      [2.463600468739329e+01, 4.790478917384365e+00],
      [8.372692959290620e-02, -1.64088642723901e-01],
    ]);
    expectComplex(vectors.get('r1_scale')?.ac, [
      [3.105454750177610e+02, -6.50726750291189e+02],
      [-2.46359800497113e+01, -4.79047412657929e+00],
      [-8.37268458602762e-02, 1.640884786240869e-01],
    ]);
    expectComplex(vectors.get('c1_m')?.ac?.slice(0, 2), [
      [-4.06395971989193e+02, -2.00251906243623e+02],
      [-4.94324484398191e+01, 1.503990755143873e+02],
    ]);
  });

  it('names the vectors <dev>_m and <dev>_scale in the control plot sens<n>, over every AC point', async () => {
    const result = await simulate(`* mp
i1  0 1  dc=42mA ac=1
r1  1 2  1k
l1  2 0  10u
c1  1 0  1n
.control
sens v(1) ac dec 1 1e5 1e7
let a = length(r1_m)
let b = length(c1_scale)
let c = length(l1_m)
let d = length(i1_m)
let e = real(r1_m[2])
echo $&a $&b $&c $&d $&e
.endc
.end`);
    const [a, b, c, d, e] = result.control!.output[0].split(' ').map(Number);
    expect([a, b, c, d]).toEqual([3, 3, 3, 3]);
    expect(Math.abs(e - 8.372692959290620e-02)).toBeLessThan(1e-5 * 0.2);
  });
});
