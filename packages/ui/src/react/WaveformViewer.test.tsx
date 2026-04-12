import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { WaveformViewer } from './WaveformViewer.js';

function mockTransientResult() {
  const voltageMap = new Map([['out', [0, 2.5, 5]]]);
  return {
    time: [0, 1e-3, 2e-3],
    voltage(node: string) {
      const v = voltageMap.get(node);
      if (!v) throw new Error(`Unknown: ${node}`);
      return v;
    },
    current() { return []; },
  };
}

function mockACResult() {
  const voltageMap = new Map([
    ['out', [
      { magnitude: 1, phase: 0 },
      { magnitude: 0.707, phase: -45 },
    ]],
  ]);
  return {
    frequencies: [100, 10000],
    voltage(node: string) {
      const v = voltageMap.get(node);
      if (!v) throw new Error(`Unknown: ${node}`);
      return v;
    },
    current() { return []; },
  };
}

describe('WaveformViewer', () => {
  it('renders transient-only view', () => {
    const { container } = render(
      <WaveformViewer transient={mockTransientResult()} signals={['out']} />,
    );
    expect(container.querySelectorAll('canvas').length).toBeGreaterThanOrEqual(1);
  });

  it('renders AC-only view', () => {
    const { container } = render(
      <WaveformViewer ac={mockACResult()} signals={['out']} />,
    );
    expect(container.querySelectorAll('canvas').length).toBeGreaterThanOrEqual(1);
  });

  it('renders both transient and AC stacked', () => {
    const { container } = render(
      <WaveformViewer
        transient={mockTransientResult()}
        ac={mockACResult()}
        signals={['out']}
      />,
    );
    // At least 3 canvases: 1 transient + 2 Bode panes
    expect(container.querySelectorAll('canvas').length).toBeGreaterThanOrEqual(3);
  });
});
