import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TransientPlot } from './TransientPlot.js';

// Mock TransientResult-like object
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

describe('TransientPlot', () => {
  it('renders a canvas element', () => {
    const { container } = render(
      <TransientPlot data={mockTransientResult()} signals={['out']} />,
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
  });

  it('renders with dark theme by default', () => {
    const { container } = render(
      <TransientPlot data={mockTransientResult()} signals={['out']} />,
    );
    expect(container.firstChild).toBeDefined();
  });

  it('renders with custom dimensions', () => {
    const { container } = render(
      <TransientPlot data={mockTransientResult()} signals={['out']} width={600} height={400} />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.width).toBe('600px');
    expect(wrapper.style.height).toBe('400px');
  });
});
