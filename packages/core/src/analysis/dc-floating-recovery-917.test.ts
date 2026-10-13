// SPDX-License-Identifier: MIT
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { simulate } from '../simulate.js';
import { parse } from '../parser/index.js';
import { solveDCOperatingPoint } from './dc.js';
import { newtonRaphson } from './newton-raphson.js';
import { resolveOptions } from '../types.js';
import { ProtocolExecutionError, ProtocolExecutionGuard } from '../protocol/execution-guard.js';
import * as transientDriver from './transient-driver.js';

const reduction = readFileSync(new URL('../../../../benchmarks/vendor-singular-917/floating-rc.cir', import.meta.url), 'utf8');

describe('floating passive DC recovery (#917)', () => {
  it('runs the identical MIT floating RC reduction through DC-before-AC', async () => {
    const result = await simulate(reduction);
    expect(result.ac!.frequencies).toHaveLength(31);
    expect(result.ac!.voltage('a').every(v => Number.isFinite(v.magnitude))).toBe(true);
    expect(result.ac!.voltage('b').every(v => Number.isFinite(v.magnitude))).toBe(true);
  });

  it('preserves an ordinary DC divider exactly', async () => {
    const result = await simulate('divider\nV1 in 0 3\nR1 in out 1k\nR2 out 0 2k\n.op\n.end');
    expect(result.dc!.voltage('in')).toBe(3);
    expect(result.dc!.voltage('out')).toBe(2);
    expect(result.dc!.current('V1')).toBe(-0.001);
  });

  for (const [name, text, a, b] of [
    ['original OP', reduction, 0.9518289887645057, 0.02408550561231978],
    ['3 V bias', reduction.replace('DC 1', 'DC 3'), 2.855486966293518, 0.07225651683695956],
    ['short RC time constant', reduction.replace('1u', '1n').replace('2u', '2n'), 0.3333333310811537, 0.3333333311033759],
  ] as const) {
    it(`matches ngspice-47 finite-time common-mode selection: ${name}`, async () => {
      const result = await simulate(text.replace('.ac dec 10 1 1k', '.op'));
      expect(result.dc!.voltage('a')).toBeCloseTo(a, 7);
      expect(result.dc!.voltage('b')).toBeCloseTo(b, 7);
    });
  }

  it('recovers multiple capacitive islands without adding permanent conductance', () => {
    const circuit = parse(reduction.replace('.ac dec 10 1 1k', 'C2 in x 1u\nR2 x y 200\nC3 y 0 2u\n.op')).compile();
    const options = resolveOptions();
    const { assembler, result } = solveDCOperatingPoint(circuit, options);
    expect(result.voltage('x')).toBeCloseTo(result.voltage('a'), 12);
    expect(result.voltage('y')).toBeCloseTo(result.voltage('b'), 12);
    expect(assembler.nodeHolds).toEqual([]);
    expect(assembler.dt).toBe(0);
    // The unchanged nominal static matrix still has its real DC nullspace.
    expect(() => newtonRaphson(assembler, circuit.devices, options, options.maxIterations, circuit.nodeNames)).toThrow('Singular matrix');
  });

  it('propagates cancellation during recovery without swallowing it as singular', () => {
    const circuit = parse(reduction).compile();
    const signal = { aborted: false };
    const guard = new ProtocolExecutionGuard({}, {
      signal,
      onSafePoint: point => { if (point === 'solve:transient-step') signal.aborted = true; },
    });
    expect(() => solveDCOperatingPoint(circuit, resolveOptions(), undefined, undefined, 'operating-point', guard)).toThrow(ProtocolExecutionError);
    expect(signal.aborted).toBe(true);
  });

  it('caps recovery at 10000 advances and disposes an unfinished driver', () => {
    const circuit = parse(reduction).compile();
    const advance = vi.fn();
    const dispose = vi.fn();
    const fake = {
      isDone: false,
      advanceSolution: advance,
      currentSolution: () => new Float64Array(circuit.nodeCount + circuit.branchCount),
      dispose,
    } as unknown as ReturnType<typeof transientDriver.createDriverFromCompiled>;
    const spy = vi.spyOn(transientDriver, 'createDriverFromCompiled').mockReturnValue(fake);
    try {
      expect(() => solveDCOperatingPoint(circuit, resolveOptions())).toThrow('Singular matrix');
      expect(advance).toHaveBeenCalledTimes(10000);
      expect(dispose).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('does not silently discard a caller-supplied initial solution', () => {
    const circuit = parse(reduction).compile();
    expect(() => solveDCOperatingPoint(circuit, resolveOptions(), new Float64Array(circuit.nodeCount + circuit.branchCount))).toThrow('Singular matrix');
  });

  for (const [name, text] of [
    ['unanchored common mode', 'unanchored\nR1 a b 200\nC1 a b 1u\n.op\n.end'],
    ['unrelated singular resistor island', reduction.replace('Cleft', 'Rbad x y 100\nCleft')],
    ['capacitor IC', reduction.replace('Cleft in a 1u', 'Cleft in a 1u IC=1')],
    ['node IC', reduction.replace('.end', '.ic V(a)=1\n.end')],
    ['nodeset', reduction.replace('.end', '.nodeset V(a)=1\n.end')],
    ['time-varying source', reduction.replace('DC 1 AC 1', 'PULSE(0 1 0 1n 1n 1u 2u) AC 1')],
    ['nonlinear device', reduction.replace('Cleft', 'D1 in 0 dm\n.model dm D\nCleft')],
  ] as const) {
    it(`retains rejection outside the proved passive subset: ${name}`, async () => {
      await expect(simulate(text)).rejects.toThrow();
    });
  }

  it('rejects conflicting ideal voltage sources', async () => {
    await expect(simulate(reduction.replace('Cleft', 'Vbad in 0 2\nCleft'))).rejects.toThrow();
  });

  it('rejects an unbalanced DC current into the capacitive island', async () => {
    await expect(simulate(reduction.replace('Cleft', 'Ibad 0 a 1\nCleft'))).rejects.toThrow();
  });
});
