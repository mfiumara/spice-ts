import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

const fixture = new URL('../../../../benchmarks/corpus/corpus-m/fixtures/xyce/Netlists/MOSFET_ParamAliases/invert1.cir', import.meta.url);
// ngspice-47, original byte-identical fixture: pulse corner at 19.505 us.
// See benchmarks/mos1-invert1-1080/probe.ts and probe.json; no tolerance adaptation.
const REFERENCE = -0.001577267373957459;
const PEAK = 0.00179;

describe('MOS1 original invert1 transient parity (#1080)', () => {
  it('matches the supply current at the seventh falling-edge corner', async () => {
    const tran = (await simulate(readFileSync(fixture, 'utf8'))).transient!;
    const point = Array.from(tran.time).findIndex(t => Math.abs(t - 19.505e-6) < 1e-16);
    expect(point).toBeGreaterThanOrEqual(0);
    expect(Math.abs(tran.current('VDDdev')[point] - REFERENCE)).toBeLessThan(0.01 * PEAK);
  });
});
