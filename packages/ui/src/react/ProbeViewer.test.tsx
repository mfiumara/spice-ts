import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { CircuitIR } from '../schematic/types.js';
import { ProbeViewer } from './ProbeViewer.js';

afterEach(cleanup);

const circuit: CircuitIR = {
  nets: ['in', 'out'],
  components: [
    {
      type: 'V', id: 'V1', name: 'V1',
      ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }],
      params: { dc: 5 }, displayValue: 'DC 5',
    },
    {
      type: 'R', id: 'R1', name: 'R1',
      ports: [{ name: 'p', net: 'in' }, { name: 'n', net: 'out' }],
      params: { resistance: 1000 }, displayValue: '1k',
    },
    {
      type: 'R', id: 'R2', name: 'R2',
      ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }],
      params: { resistance: 2000 }, displayValue: '2k',
    },
  ],
};

function makeResults() {
  const transient = {
    time: [0, 1],
    voltage: vi.fn((node: string) => node === 'out' ? [0, 2] : [0, 5]),
    current: vi.fn((component: string) => component === 'V1' ? [0, 0.002] : [0, 0]),
  };
  const ac = {
    frequencies: [10, 100],
    voltage: vi.fn(() => [{ magnitude: 1, phase: 0 }, { magnitude: 0.5, phase: -45 }]),
    current: vi.fn(() => [{ magnitude: 0.001, phase: 0 }, { magnitude: 0.0005, phase: -45 }]),
  };
  const dc = {
    sweepValues: [0, 1],
    voltage: vi.fn(() => [0, 2]),
    current: vi.fn(() => [0, 0.002]),
  };
  return { transient, ac, dc };
}

describe('ProbeViewer', () => {
  it('toggles a voltage probe from a wire and color-links it to the trace', () => {
    const results = makeResults();
    const { getByRole, queryByText } = render(
      <ProbeViewer circuit={circuit} {...results} />,
    );

    const wire = getByRole('button', { name: 'Probe voltage at out' });
    expect(wire.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(wire);

    expect(queryByText('V(out)')).not.toBeNull();
    expect(wire.getAttribute('aria-pressed')).toBe('true');
    const color = wire.getAttribute('data-probe-color');
    expect(color).toBeTruthy();
    expect(getByRole('button', { name: 'Toggle V(out)' }).getAttribute('data-probe-color')).toBe(color);
    expect(results.transient.voltage).toHaveBeenCalledWith('out');
    expect(results.ac.voltage).toHaveBeenCalledWith('out');
    expect(results.dc.voltage).toHaveBeenCalledWith('out');

    fireEvent.click(wire);
    expect(queryByText('V(out)')).toBeNull();
  });

  it('supports keyboard branch probing across transient, AC, and DC', () => {
    const results = makeResults();
    const { getByRole, queryByText } = render(
      <ProbeViewer circuit={circuit} {...results} />,
    );

    const branch = getByRole('button', { name: 'Probe current through V1' });
    fireEvent.keyDown(branch, { key: 'Enter' });
    expect(queryByText('I(V1)')).not.toBeNull();
    expect(branch.getAttribute('aria-pressed')).toBe('true');
    expect(results.transient.current).toHaveBeenCalledWith('V1');
    expect(results.ac.current).toHaveBeenCalledWith('V1');
    expect(results.dc.current).toHaveBeenCalledWith('V1');

    fireEvent.keyDown(branch, { key: ' ' });
    expect(queryByText('I(V1)')).toBeNull();
  });

  it('removes a probe from the legend', () => {
    const { getByRole, queryByText } = render(
      <ProbeViewer circuit={circuit} {...makeResults()} />,
    );

    fireEvent.click(getByRole('button', { name: 'Probe voltage at out' }));
    fireEvent.click(getByRole('button', { name: 'Remove V(out)' }));
    expect(queryByText('V(out)')).toBeNull();
  });
});
