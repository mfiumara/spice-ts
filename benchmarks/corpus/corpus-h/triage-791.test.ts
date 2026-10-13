/**
 * #791 triage receipts: the three SpiceSharpParser cookbook decks in corpus-h above the 1%
 * threshold. See TRIAGE-791.md. Every deck runs byte-identical (sha-256 pinned by
 * manifest.json) through spice-ts. The ngspice-47 values are copied from `ngspice -b -r`
 * raw files of the unchanged decks, or of the stated TMAX-only diagnostic variants; crossing
 * times are linear interpolations of those raw points.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import type { CorpusHManifest } from './ingest.js';

const ROOT = 'benchmarks/corpus/corpus-h';
const COOKBOOK = 'spicesharpparser-circuits-cookbook-pure-spice';
const TLINE = `${COOKBOOK}-transmission-line-termination-transmission-line-termination-cir`;
const RELAY = `${COOKBOOK}-bjt-relay-driver-bjt-relay-driver-cir`;
const ASTABLE = `${COOKBOOK}-astable-led-flasher-astable-led-flasher-cir`;

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

function crossings(time: number[], values: number[], level: number, direction: 'rise' | 'fall', after = -Infinity): number[] {
  const found: number[] = [];
  for (let index = 1; index < time.length; index += 1) {
    if (time[index] <= after) continue;
    const [a, b] = [values[index - 1], values[index]];
    const crosses = direction === 'rise' ? a < level && b >= level : a > level && b <= level;
    if (crosses) found.push(time[index - 1] + ((level - a) / (b - a)) * (time[index] - time[index - 1]));
  }
  return found;
}

describe('#791 transmission-line-termination.cir: lossless T stepped and interpolated like ngspice-47 TRA', () => {
  // ngspice-47 default run: 819 points; (time, node, value) at the delayed corners.
  const NGSPICE_POINTS = 819;
  const NGSPICE: ReadonlyArray<[number, string, number]> = [
    [2.487499999999997e-8, 'open_out', 0],
    [2.512499999999997e-8, 'open_out', 1.041614585937131],
    [2.512499999999997e-8, 'match_out', 0.5208333333332139],
    [4.512499999999989e-8, 'open_in', 4.340260417534552],
    [6.487499999999995e-8, 'open_out', 8.332916687498873],
    [6.512499999999996e-8, 'open_out', 7.63857640104146],
    [1.048750000000008e-7, 'open_out', 2.778194395838042],
    [1.051250000000008e-7, 'open_out', 3.241041633106498],
  ];

  it('takes ngspice-47\'s timepoints and values (was 929 points and 0.0625 on main a2001a93)', async () => {
    const tran = await transient(await fixture(TLINE));
    assert.equal(tran.time.length, NGSPICE_POINTS);
    // No breakpoint at TD = 20 ns and none at the 25 ns arrival: ngspice-47 has neither.
    assert.ok(!tran.time.some(t => Math.abs(t - 20e-9) < 1e-15 || Math.abs(t - 25e-9) < 1e-15));
    for (const [time, node, value] of NGSPICE) {
      const index = tran.time.findIndex(t => Math.abs(t - time) < 1e-18);
      assert.ok(index > 0, `spice-ts has ngspice-47's point ${time}`);
      assert.ok(Math.abs(tran.voltage(node)[index] - value) < 1e-9, `${node} at ${time}`);
    }
  });
});

describe('#791 bjt-relay-driver.cir: the 0.0215 on v(collector) is the #592 grid artefact on a 60 ns edge', () => {
  // v(collector) falling through 6 V and 2 V after the 1 ms base-drive edge.
  const NGSPICE_DEFAULT = [1.0002130447901434e-3, 1.0002400105518605e-3];
  // ngspice-47 on the deck with only `.TRAN 2u 1.2m 0 1n UIC` (TMAX 1 ns, .MEAS cards dropped).
  const NGSPICE_TMAX_1N = [1.0002134172075185e-3, 1.000239191310064e-3];

  it('spice-ts crosses within 0.2 ns of the TMAX 1 ns reference, closer than ngspice-47\'s own default run', async () => {
    const tran = await transient(await fixture(RELAY));
    const collector = tran.voltage('collector');
    const spiceTs = [6, 2].map(level => crossings(tran.time, collector, level, 'fall', 0.9e-3)[0]);
    spiceTs.forEach((time, index) => {
      const own = Math.abs(time - NGSPICE_TMAX_1N[index]);
      const ngspice = Math.abs(NGSPICE_DEFAULT[index] - NGSPICE_TMAX_1N[index]);
      assert.ok(own < 0.2e-9, `spice-ts ${time} is ${own} s from the reference`);
      assert.ok(own < ngspice, `spice-ts ${own} s vs ngspice-47 default ${ngspice} s from the reference`);
    });
  });
});

describe('#791 astable-led-flasher.cir: the 1.27 is phase, not waveform', () => {
  // v(collector1) rising through 2.5 V, ten edges over 5 s.
  const NGSPICE_DEFAULT = [
    0.0964604985641874, 0.3279968696052725, 0.8556587980467665, 1.384205994643919, 1.9127519987942898,
    2.4412988138515512, 2.969844630212632, 3.498391392734135, 4.0269373089616405, 4.555484255600239,
  ];
  // ngspice-47 on the deck with only `.TRAN 1m 5 0 10u UIC` (the #592 fine-reference TMAX).
  const NGSPICE_TMAX_10U = [
    0.09646042747225254, 0.3275653161856582, 0.8552216919037836, 1.3837699400101142, 1.9123185953400732,
    2.440867370780959, 2.969415476592651, 3.497964092322529, 4.026512134628808, 4.555060277240691,
  ];

  it('spice-ts edges sit within 20 us of ngspice-47 (ngspice moves 430 us with TMAX) and the period agrees to 1e-5', async () => {
    const tran = await transient(await fixture(ASTABLE));
    const spiceTs = crossings(tran.time, tran.voltage('collector1'), 2.5, 'rise');
    assert.equal(spiceTs.length, NGSPICE_DEFAULT.length);
    spiceTs.forEach((time, index) => {
      const offset = Math.abs(time - NGSPICE_DEFAULT[index]);
      assert.ok(offset < 20e-6, `edge ${index}: ${offset} s from ngspice-47`);
      // ngspice-47's own TMAX dependence is 20x larger than the engine difference after the first edge.
      if (index > 0) assert.ok(Math.abs(NGSPICE_DEFAULT[index] - NGSPICE_TMAX_10U[index]) > 20 * offset);
    });
    const period = (edges: number[]): number => (edges[9] - edges[2]) / 7;
    assert.ok(Math.abs(period(spiceTs) / period(NGSPICE_DEFAULT) - 1) < 1e-5);
  });
});
