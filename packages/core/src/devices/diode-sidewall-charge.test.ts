import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

// Issue #450: ngspice-47 dioload.c:559 offsets the sidewall depletion charge
// above FCS*VJSW with the bottom junction's F1 (DIOtF1), so the charge steps
// at FCS*VJSW by CJSW*(F1 - F1sw). With FC=0.3 the step is downward, q(v) is
// non-monotonic, and the transient has two charge-conserving solutions at the
// crossing: ngspice's MODEINITPRED start (DEVpred) selects the upper branch.
//
// Decks and raw ngspice-47 `linearize` + `print` output (501 points, 0.1 ns)
// are in benchmarks/results/issue-403/ngspice; spice-ts runs the identical
// deck without the .control block.
const ngspiceDir = resolve(import.meta.dirname, '../../../../benchmarks/results/issue-403/ngspice');

function deck(name: string): string {
  return readFileSync(resolve(ngspiceDir, `${name}.cir`), 'utf8')
    .replace(/\.control[\s\S]*?\.endc\n/, '');
}

function ngspiceReference(name: string): Array<readonly [number, number]> {
  const rows: Array<readonly [number, number]> = [];
  for (const line of readFileSync(resolve(ngspiceDir, `${name}.out`), 'utf8').split('\n')) {
    const cols = line.trim().split(/\s+/);
    if (/^\d+$/.test(cols[0]) && cols.length >= 3) rows.push([Number(cols[1]), Number(cols[2])]);
  }
  return rows;
}

function interpolate(time: number, times: ArrayLike<number>, values: ArrayLike<number>): number {
  let index = 1;
  while (index < times.length - 1 && times[index] < time) index++;
  const start = times[index - 1];
  const end = times[index];
  if (end === start) return values[index];
  return values[index - 1] + (values[index] - values[index - 1]) * (time - start) / (end - start);
}

async function compare(name: string): Promise<{ rms: number; at: (t: number) => number }> {
  const reference = ngspiceReference(name);
  expect(reference).toHaveLength(501);
  const result = await simulate(deck(name));
  const time = result.transient!.time;
  const out = result.transient!.voltage('out');
  const squares = reference.map(([t, v]) => (interpolate(t, time, out) - v) ** 2);
  return {
    rms: Math.sqrt(squares.reduce((sum, value) => sum + value, 0) / squares.length),
    at: (t: number) => interpolate(t, time, out),
  };
}

describe('diode sidewall charge above FCS*VJSW matches ngspice-47 (#450)', () => {
  it('follows the downward sidewall charge step onto ngspice\'s branch (FC=0.3)', async () => {
    const { rms, at } = await compare('tran_sw');
    // ngspice-47 v(out) at 18.5 ns: 0.64171 V (upper branch after the step).
    expect(at(18.5e-9)).toBeGreaterThan(0.6);
    expect(Math.abs(at(18.5e-9) - 0.6417077366982)).toBeLessThan(5e-3);
    // Before #450: 69 mV RMS over ngspice's 501 points.
    expect(rms).toBeLessThan(1e-2);
  });

  it('reproduces the upward sidewall charge step (default FC)', async () => {
    const { rms } = await compare('tran_sw_fc05');
    // Before #450: 6.6 mV RMS over ngspice's 501 points.
    expect(rms).toBeLessThan(1e-3);
  });
});
