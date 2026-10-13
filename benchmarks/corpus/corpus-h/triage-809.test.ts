/**
 * #809 triage receipts: the two corpus-h KiCad QA decks above the 1% threshold after #783.
 * See TRIAGE-809.md. Both decks run byte-identical (sha-256 pinned by manifest.json) through
 * spice-ts; the analytic solutions below are exact for these decks, so the tests show that
 * spice-ts is exact at its own points and that the published deterministic error is the
 * corpus metric interpolating ngspice-47's output grid across a corner (#592).
 * The ngspice-47 points are copied from `ngspice -b -r` raw files of the unchanged decks.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import type { CorpusHManifest } from './ingest.js';

const ROOT = 'benchmarks/corpus/corpus-h';
const TLINES = 'kicad-qa-data-eeschema-spice-netlists-tlines-tlines-spice';
const LEGACY = 'kicad-qa-data-eeschema-spice-netlists-legacy-sources-legacy-sources-spice';
const MATCH_THRESHOLD = 0.01;

interface Transient { time: number[]; voltage(node: string): number[] }

async function fixture(id: string): Promise<string> {
  const manifest = JSON.parse(await readFile(resolve(ROOT, 'manifest.json'), 'utf8')) as CorpusHManifest;
  const circuit = manifest.circuits.find(candidate => candidate.id === id);
  assert.ok(circuit, `${id} is in the corpus-h manifest`);
  const bytes = await readFile(resolve(circuit.localPath));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), circuit.sha256, 'fixture is byte-identical to the manifest');
  return bytes.toString('utf8');
}

async function transient(deck: string): Promise<Transient> {
  const { simulate } = await import('../../../packages/core/dist/index.js');
  const result = await simulate(deck);
  assert.ok(result.transient, 'transient result');
  return result.transient as unknown as Transient;
}

/** PULSE(0 1 0 1u 1u 50u 100u), the source on both tlines.spice line inputs. */
function pulse(t: number): number {
  if (t < 0) return 0;
  const phase = t % 100e-6;
  if (phase < 1e-6) return phase / 1e-6;
  if (phase < 51e-6) return 1;
  if (phase < 52e-6) return 1 - (phase - 51e-6) / 1e-6;
  return 0;
}

/** SIN(0 1 100meg 1n 1e10) of legacy_sources.spice (V7/I7). */
function dampedSine(t: number): number {
  return t <= 1e-9 ? 0 : Math.sin(2 * Math.PI * 1e8 * (t - 1e-9)) * Math.exp(-(t - 1e-9) * 1e10);
}

function maxError(time: number[], values: number[], exact: (t: number) => number): number {
  return time.reduce((worst, t, index) => Math.max(worst, Math.abs(values[index] - exact(t))), 0);
}

function lerp(x: number, [x0, y0]: [number, number], [x1, y1]: [number, number]): number {
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

describe('#809 tlines.spice: matched 50 ohm lines are a 25 us delay of the PULSE source', () => {
  it('spice-ts lossless T and lossless LTRA match the analytic delayed pulse at their own points', async () => {
    const tran = await transient(await fixture(TLINES));
    // Lossless T: exact to rounding.
    assert.ok(maxError(tran.time, tran.voltage('/z0_out'), t => pulse(t - 25e-6)) < 1e-9);
    // LTRA (r=0, g=0) uses its own interpolated history; measured 2.9e-3 of the 1 V peak on 18419173.
    assert.ok(maxError(tran.time, tran.voltage('/rlgc_out'), t => pulse(t - 25e-6)) < MATCH_THRESHOLD);
  });

  it('the published 0.045 is ngspice-47 interpolated across the 77 us corner it steps over', () => {
    // ngspice-47 v(/z0_out) points around the falling edge's end (default .tran 1u 1m grid).
    const before: [number, number] = [7.604999999999992e-5, 0.9540322580645827];
    const after: [number, number] = [7.704999999999992e-5, -0.002380952380956902];
    // At its own points ngspice is within 0.0041 of the exact value...
    assert.ok(Math.abs(before[1] - pulse(before[0] - 25e-6)) < 0.0041);
    assert.ok(Math.abs(after[1] - pulse(after[0] - 25e-6)) < 0.0041);
    // ...but the metric reads it at spice-ts's corner point, where the exact value is 0.
    const interpolated = lerp(77e-6, before, after);
    assert.equal(pulse(77e-6 - 25e-6), 0);
    assert.ok(interpolated > 0.044 && interpolated < 0.046, `interpolated ${interpolated}`);
  });
});

describe('#809 legacy_sources.spice: worst deterministic signal', () => {
  it('spice-ts V7/I7 damped SIN is exact at its own points', async () => {
    const tran = await transient(await fixture(LEGACY));
    assert.ok(maxError(tran.time, tran.voltage('/vsin'), dampedSine) < 1e-15);
    assert.ok(maxError(tran.time, tran.voltage('/isin'), t => -1e4 * dampedSine(t)) < 1e-11);
  });

  it('the published 0.0175 on v(/vsin) is ngspice-47 interpolated across the 23 ps peak rise', async () => {
    const tran = await transient(await fixture(LEGACY));
    // ngspice-47 v(/vsin) points bracketing the spice-ts point near 1.029 ns.
    const before: [number, number] = [1.02147486621964e-9, 0.01088511441121807];
    const after: [number, number] = [1.042949732549281e-9, 0.01756140666690073];
    assert.ok(Math.abs(before[1] - dampedSine(before[0])) < 1e-15);
    assert.ok(Math.abs(after[1] - dampedSine(after[0])) < 1e-15);
    const index = tran.time.findIndex(t => t > before[0] && t < after[0]);
    assert.ok(index > 0, 'spice-ts has a point between the two ngspice points');
    const vsin = tran.voltage('/vsin');
    const peak = Math.max(...vsin.map(Math.abs));
    const normalised = Math.abs(vsin[index] - lerp(tran.time[index], before, after)) / peak;
    assert.ok(normalised > 0.017 && normalised < 0.018, `normalised ${normalised}`);
  });

  it('spice-ts random sources are reproducible run to run (ngspice-47 without a seed is not)', async () => {
    const deck = await fixture(LEGACY);
    const [first, second] = [await transient(deck), await transient(deck)];
    for (const node of ['/vtrrandom', '/itrrandom', '/vtrnoise', '/itrnoise']) {
      assert.deepEqual(first.voltage(node), second.voltage(node), node);
    }
  });
});
