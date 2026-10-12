import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { simulate } from '../simulate.js';

// v(2) + tanh(v(2)) = 1 for `v1 1 0 1; r1 1 2 1k; b1 2 0 i=1m*tanh(v(2))`.
function solveTanhLoad(drive: number): number {
  let v = drive / 2;
  for (let i = 0; i < 100; i++) v -= (v + Math.tanh(v) - drive) / (2 - Math.tanh(v) ** 2);
  return v;
}

// ngspice-47 `.op` of tanhLoad('.op') (`set numdgt=14`). Both simulators stop
// Newton on the reltol/vntol test from the same start, a few nV short of the
// exact root that solveTanhLoad returns.
const NGSPICE_47_TANH_LOAD_OP = 0.521298455206876;

const tanhLoad = (analysis: string, source = 'v1 1 0 dc 1 ac 1') => [
  'b-source tanh load',
  source,
  'r1 1 2 1k',
  'b1 2 0 i=1m*tanh(v(2))',
  analysis,
  '.end',
].join('\n');

describe('B-source I= current expressions', () => {
  it('solves a nonlinear operating point exactly', async () => {
    const result = await simulate(tanhLoad('.op'));
    expect(result.dc!.voltage('2')).toBeCloseTo(NGSPICE_47_TANH_LOAD_OP, 12);
    expect(result.dc!.voltage('2')).toBeCloseTo(solveTanhLoad(1), 8);
  });

  it('tracks the expression through a DC sweep', async () => {
    const sweep = (await simulate(tanhLoad('.dc v1 -2 2 1'))).dcSweep!;
    const v2 = sweep.voltage('2');
    [-2, -1, 0, 1, 2].forEach((drive, index) => {
      expect(v2[index]).toBeCloseTo(solveTanhLoad(drive), 7);
    });
  });

  it('linearises the expression with its exact derivative for .ac', async () => {
    const result = await simulate(tanhLoad('.ac dec 1 1k 1k'));
    const v = solveTanhLoad(1);
    const g = 1e-3 * (1 - Math.tanh(v) ** 2);
    const expected = 1e-3 / (1e-3 + g);
    const [{ magnitude }] = result.ac!.voltage('2');
    expect(magnitude).toBeCloseTo(expected, 9);
  });

  it('serialises a top-level B-card back to an equivalent I= expression', async () => {
    const circuit = parse(tanhLoad('.op'));
    const line = circuit.toNetlist().split('\n').find(text => text.startsWith('b1 '));
    expect(line).toBe('b1 2 0 I=(0.001*tanh(v(2)))');
    const reparsed = await simulate(circuit.toNetlist().replace('* spice-ts generated netlist', 'title'));
    expect(reparsed.dc!.voltage('2')).toBeCloseTo(NGSPICE_47_TANH_LOAD_OP, 12);
  });
});
