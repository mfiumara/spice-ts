import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from '../../parser/index.js';
import { simulate } from '../../simulate.js';
import { UnsupportedModelVersionError } from '../../errors.js';
import { BSIM4 } from './device.js';

interface GridPoint { vgs: number; vds: number; vbs: number; id: number; gm: number; gds: number; gmbs: number }
interface GridCase { name: string; polarity: string; modelCard: string; geometry: string; points: GridPoint[] }
const oracle = JSON.parse(readFileSync(new URL('../__fixtures__/bsim4/reference/reference.json', import.meta.url), 'utf8')) as { cases: GridCase[] };
// One shared relative bound for every model/bias/quantity. Floor only protects native zeros.
const relativeLimit = 1e-8;
const zeroFloor = 1e-18;

describe('BSIM4 ngspice-47 static bias-grid parity', () => {
  for (const reference of oracle.cases) {
    const deck = `BSIM4 oracle card\n${reference.modelCard}\nM1 d g 0 b DUT ${reference.geometry}\nVd d 0 0\nVg g 0 0\nVb b 0 0\n.temp 27\n.op\n.end`;
    if (reference.name === 'gain-v43') {
      it('rejects the retained unported 4.3 family instead of comparing wrong equations', () => {
        expect(() => parse(deck).compile()).toThrow(UnsupportedModelVersionError);
      });
      continue;
    }
    for (const [quantity, key] of [['id', 'ids'], ['gm', 'gm'], ['gds', 'gds'], ['gmbs', 'gmbs']] as const) {
      it(`${reference.name}: ${quantity}, all 108 native bias points`, () => {
        const device = parse(deck).compile().devices.find(d => d.name === 'M1') as BSIM4;
        expect(device).toBeInstanceOf(BSIM4);
        const sign = reference.polarity === 'n' ? 1 : -1;
        expect(reference.points).toHaveLength(108);
        for (const point of reference.points) {
          const actual = device.evaluate({ vgs: sign * point.vgs, vds: sign * point.vds, vbs: sign * point.vbs })[key];
          expect(Number.isFinite(actual)).toBe(true);
          expect(Math.abs(actual - point[quantity]) / Math.max(Math.abs(point[quantity]), zeroFloor),
            `${reference.name} ${quantity} ${JSON.stringify(point)}`).toBeLessThan(relativeLimit);
        }
      });
    }
  }
  it('runs the unchanged native BSIM4 model-bin regression', async () => {
    const input = readFileSync(new URL('../../../../../benchmarks/corpus/corpus-f/fixtures/tests/regression/model/binning-1.cir', import.meta.url), 'utf8');
    const result = await simulate(input);
    expect(result.control?.output).toContain('INFO: 0 of 2 tests failed');
    // Same unchanged-deck native OP reference used by the device grid oracle.
    const expected = [0.8693589670633045, 0.8693589670633045, 1.071660594471147, 1.071660594471147];
    expected.forEach((voltage, index) => {
      expect(Math.abs(result.dc!.voltage(String(index + 1)) - voltage) / voltage).toBeLessThan(1e-6);
    });
  });
  it('keeps truly undefined model names as invalid circuits', async () => {
    await expect(simulate('Missing model\nM1 d g 0 0 absent\nVd d 0 1\nVg g 0 1\n.op\n.end')).rejects.toThrow("unknown model 'absent'");
  });
  for (const level of [14, 54]) {
    it(`recognizes case-insensitive numbered BSIM4 LEVEL=${level} bin families`, () => {
      const deck = `Binned\n.model MiXeD.2 PMOS LEVEL=${level} LMIN=1u LMAX=2u WMIN=1u WMAX=2u\nM1 d g 0 0 MIXED L=1u W=1u\nVd d 0 -1\nVg g 0 -1\n.op\n.end`;
      expect(parse(deck).compile().devices.find(d => d.name === 'M1')).toBeInstanceOf(BSIM4);
    });
  }
  it('does not classify an unrelated dotted name as a bin family', () => {
    const deck = 'Not a bin\n.model absent.other NMOS LEVEL=54\nM1 d g 0 0 absent\nVd d 0 1\nVg g 0 1\n.op\n.end';
    expect(() => parse(deck).compile()).toThrow("unknown model 'absent'");
  });
  it('prefers an explicitly named unbinned card over any bin family', () => {
    const deck = 'Explicit model\n.model DUT NMOS LEVEL=54\n.model DUT.1 NMOS LEVEL=54\nM1 d g 0 0 DUT\nVd d 0 1\nVg g 0 1\n.op\n.end';
    expect(parse(deck).compile().devices.find(d => d.name === 'M1')).toBeInstanceOf(BSIM4);
  });
});
