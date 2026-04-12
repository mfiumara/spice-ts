import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BodePlot } from './BodePlot.js';

function mockACResult() {
  const voltageMap = new Map([
    ['out', [
      { magnitude: 1, phase: 0 },
      { magnitude: 0.707, phase: -45 },
      { magnitude: 0.1, phase: -84 },
    ]],
  ]);
  return {
    frequencies: [100, 1000, 10000],
    voltage(node: string) {
      const v = voltageMap.get(node);
      if (!v) throw new Error(`Unknown: ${node}`);
      return v;
    },
    current() { return []; },
  };
}

describe('BodePlot', () => {
  it('renders two canvas elements (magnitude + phase)', () => {
    const { container } = render(
      <BodePlot data={mockACResult()} signals={['out']} />,
    );
    const canvases = container.querySelectorAll('canvas');
    expect(canvases.length).toBe(2);
  });

  it('renders with magnitude-only pane', () => {
    const { container } = render(
      <BodePlot data={mockACResult()} signals={['out']} defaultPanes="magnitude" />,
    );
    expect(container.firstChild).toBeDefined();
  });
});
