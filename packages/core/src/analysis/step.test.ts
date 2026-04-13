import { describe, it, expect } from 'vitest';
import { Resistor } from '../devices/resistor.js';
import { Capacitor } from '../devices/capacitor.js';
import { Inductor } from '../devices/inductor.js';

describe('Device parameter setters', () => {
  it('Resistor set/get parameter', () => {
    const r = new Resistor('R1', [0, 1], 1000);
    expect(r.getParameter()).toBe(1000);
    r.setParameter(2000);
    expect(r.getParameter()).toBe(2000);
    expect(r.resistance).toBe(2000);
  });

  it('Capacitor set/get parameter', () => {
    const c = new Capacitor('C1', [0, 1], 1e-9);
    expect(c.getParameter()).toBe(1e-9);
    c.setParameter(2e-9);
    expect(c.getParameter()).toBe(2e-9);
    expect(c.capacitance).toBe(2e-9);
  });

  it('Inductor set/get parameter', () => {
    const l = new Inductor('L1', [0, 1], 0, 1e-3);
    expect(l.getParameter()).toBe(1e-3);
    l.setParameter(2e-3);
    expect(l.getParameter()).toBe(2e-3);
    expect(l.inductance).toBe(2e-3);
  });
});
