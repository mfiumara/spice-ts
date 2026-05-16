import { describe, it, expect } from 'vitest';
import { resolveCapacitorModel, resolveInductorModel } from './passive-model.js';

describe('passive parasitic model resolution', () => {
  it('resolves explicit capacitor ESR, ESL, and leakage aliases', () => {
    const resolved = resolveCapacitorModel(1e-6, undefined, {
      ESR: 0.2,
      ESL: 10e-9,
      RLEAK: 1e6,
      M: 2,
    });

    expect(resolved.capacitance).toBeCloseTo(2e-6);
    expect(resolved.seriesResistance).toBeCloseTo(0.1);
    expect(resolved.seriesInductance).toBeCloseTo(5e-9);
    expect(resolved.parallelResistance).toBeCloseTo(5e5);
  });

  it('derives capacitor ESR from dissipation factor or Q at a measurement frequency', () => {
    const dfModel = resolveCapacitorModel(1e-6, undefined, {
      DF: 0.1,
      FREQ: 1e3,
    });
    expect(dfModel.seriesResistance).toBeCloseTo(0.1 / (2 * Math.PI * 1e3 * 1e-6));

    const qModel = resolveCapacitorModel(1e-6, undefined, {
      Q: 100,
      FREQ: 1e3,
    });
    expect(qModel.seriesResistance).toBeCloseTo(1 / (2 * Math.PI * 1e3 * 1e-6 * 100));
  });

  it('resolves explicit and derived inductor parasitics', () => {
    const explicit = resolveInductorModel(10e-6, undefined, {
      RSER: 0.5,
      RPAR: 2e3,
      CPAR: 4e-12,
      M: 2,
    });

    expect(explicit.inductance).toBeCloseTo(5e-6);
    expect(explicit.seriesResistance).toBeCloseTo(0.25);
    expect(explicit.parallelResistance).toBeCloseTo(1e3);
    expect(explicit.parallelCapacitance).toBeCloseTo(8e-12);

    const derived = resolveInductorModel(10e-6, undefined, {
      Q: 50,
      FREQ: 100e3,
      SRF: 10e6,
    });

    expect(derived.seriesResistance).toBeCloseTo(2 * Math.PI * 100e3 * 10e-6 / 50);
    expect(derived.parallelCapacitance).toBeCloseTo(
      1 / ((2 * Math.PI * 10e6) ** 2 * 10e-6),
    );
  });
});
