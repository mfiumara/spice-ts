import { describe, expect, it, vi } from 'vitest';
import { parse } from '../parser/index.js';
import { resolveOptions } from '../types.js';
import type { MNAAssembler } from '../mna/assembler.js';
import type { ResolvedOptions } from '../types.js';
import { solveDCOperatingPoint } from './dc.js';

const newton = vi.hoisted(() => vi.fn());
vi.mock('./newton-raphson.js', () => ({ newtonRaphson: newton }));

// Exercise CKTop fallback scheduling independently of a particular circuit's convergence.
describe('configured junction gmin homotopy target (#1068)', () => {
  it.each([1e-9, 1e-15, 0])('restores the configured baseline %s after true stepping', deviceGmin => {
    const loads: Array<{ diagonal: number; junction: number }> = [];
    newton.mockImplementation((assembler: MNAAssembler, _devices: unknown, options: ResolvedOptions) => {
      loads.push({ diagonal: options.gmin, junction: assembler.deviceGmin });
      // Fail the initial solve and all diagonal stepping levels, forcing true stepping.
      if (loads.length === 1 || options.gmin > 0) throw new Error('forced diagonal failure');
      return 1;
    });
    const compiled = parse('gmin schedule\nV1 in 0 1\nD1 in 0 dmod\n.model dmod d\n.op').compile();
    const { assembler } = solveDCOperatingPoint(compiled, resolveOptions({ deviceGmin }));
    expect(loads[0]).toEqual({ diagonal: 0, junction: deviceGmin });
    expect(loads.some(load => load.junction > deviceGmin)).toBe(true);
    // One target solve, then the nominal final solve. Neither adds a diagonal shunt.
    expect(loads.slice(-2)).toEqual([
      { diagonal: 0, junction: deviceGmin },
      { diagonal: 0, junction: deviceGmin },
    ]);
    expect(assembler.deviceGmin).toBe(deviceGmin);
  });
});
