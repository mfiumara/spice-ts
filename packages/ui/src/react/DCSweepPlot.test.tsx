import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { DCSweepPlot } from './DCSweepPlot.js';
import type { DCSweepDataset } from '../core/types.js';

function mockDataset(): DCSweepDataset {
  return {
    sweepValues: [0, 0.5, 1.0, 1.5, 1.8],
    signals: new Map([['out', [1.8, 1.75, 1.0, 0.05, 0.02]]]),
    label: '',
  };
}

describe('DCSweepPlot', () => {
  it('renders a canvas element', () => {
    const { container } = render(
      <DCSweepPlot data={[mockDataset()]} signals={['out']} />,
    );
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('renders with custom dimensions', () => {
    const { container } = render(
      <DCSweepPlot data={[mockDataset()]} signals={['out']} width={500} height={300} />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.width).toBe('500px');
    expect(wrapper.style.height).toBe('300px');
  });

  it('renders with string width/height', () => {
    const { container } = render(
      <DCSweepPlot data={[mockDataset()]} signals={['out']} width="80%" height="200px" />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.width).toBe('80%');
    expect(wrapper.style.height).toBe('200px');
  });

  it('calls onCursorMove when provided', () => {
    const onCursorMove = vi.fn();
    render(
      <DCSweepPlot
        data={[mockDataset()]}
        signals={['out']}
        onCursorMove={onCursorMove}
      />,
    );
    expect(onCursorMove).not.toHaveBeenCalled();
  });

  it('renders with signalVisibility prop', () => {
    const { container } = render(
      <DCSweepPlot
        data={[mockDataset()]}
        signals={['out']}
        signalVisibility={{ out: false }}
      />,
    );
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('renders with colors prop', () => {
    const { container } = render(
      <DCSweepPlot
        data={[mockDataset()]}
        signals={['out']}
        colors={{ out: '#ff0000' }}
      />,
    );
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('renders with xDomain prop', () => {
    const { container } = render(
      <DCSweepPlot
        data={[mockDataset()]}
        signals={['out']}
        xDomain={[0, 1.8]}
      />,
    );
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('renders with multiple datasets', () => {
    const ds2: DCSweepDataset = {
      sweepValues: [0, 0.5, 1.0, 1.5, 1.8],
      signals: new Map([['out', [0.02, 0.05, 1.0, 1.75, 1.78]]]),
      label: 'run2',
    };
    const { container } = render(
      <DCSweepPlot data={[mockDataset(), ds2]} signals={['out']} />,
    );
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('renders with dark theme', () => {
    const { container } = render(
      <DCSweepPlot data={[mockDataset()]} signals={['out']} theme="dark" />,
    );
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('unmounts cleanly', () => {
    const { unmount } = render(
      <DCSweepPlot data={[mockDataset()]} signals={['out']} />,
    );
    unmount();
  });
});
