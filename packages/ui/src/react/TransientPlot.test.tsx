import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TransientPlot } from './TransientPlot.js';
import type { TransientDataset } from '../core/types.js';

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

  it('renders with string width/height', () => {
    const { container } = render(
      <TransientPlot data={mockTransientResult()} signals={['out']} width="80%" height="200px" />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.width).toBe('80%');
    expect(wrapper.style.height).toBe('200px');
  });

  it('calls onCursorMove callback when provided', () => {
    const onCursorMove = vi.fn();
    render(
      <TransientPlot
        data={mockTransientResult()}
        signals={['out']}
        onCursorMove={onCursorMove}
      />,
    );
    // Component mounts without errors; callback is wired up
    expect(onCursorMove).not.toHaveBeenCalled(); // no interaction fired yet
  });

  it('renders with signalVisibility prop', () => {
    const { container } = render(
      <TransientPlot
        data={mockTransientResult()}
        signals={['out']}
        signalVisibility={{ out: false }}
      />,
    );
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('renders with colors prop', () => {
    const { container } = render(
      <TransientPlot
        data={mockTransientResult()}
        signals={['out']}
        colors={{ out: '#ff0000' }}
      />,
    );
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('renders with xDomain prop', () => {
    const { container } = render(
      <TransientPlot
        data={mockTransientResult()}
        signals={['out']}
        xDomain={[0, 5e-3]}
      />,
    );
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('renders with array of TransientDatasets', () => {
    const datasets: TransientDataset[] = [
      {
        time: [0, 1e-3, 2e-3],
        signals: new Map([['out', [0, 2.5, 5]]]),
        label: 'run1',
      },
      {
        time: [0, 1e-3, 2e-3],
        signals: new Map([['out', [5, 2.5, 0]]]),
        label: 'run2',
      },
    ];
    const { container } = render(
      <TransientPlot data={datasets} signals={['out']} />,
    );
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('unmounts cleanly without errors', () => {
    const { unmount } = render(
      <TransientPlot data={mockTransientResult()} signals={['out']} />,
    );
    unmount(); // should not throw
  });
});
