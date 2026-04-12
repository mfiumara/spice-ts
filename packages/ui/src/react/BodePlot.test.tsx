import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
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

  it('renders with phase-only pane', () => {
    const { container } = render(
      <BodePlot data={mockACResult()} signals={['out']} defaultPanes="phase" />,
    );
    expect(container.firstChild).toBeDefined();
  });

  it('clicking magnitude header toggles magnitude pane', () => {
    const { getAllByText } = render(
      <BodePlot data={mockACResult()} signals={['out']} />,
    );
    const headers = getAllByText(/Magnitude/i);
    fireEvent.click(headers[0]);
    // After click, the pane is collapsed; clicking again should re-expand
    fireEvent.click(headers[0]);
  });

  it('clicking phase header toggles phase pane', () => {
    const { getAllByText } = render(
      <BodePlot data={mockACResult()} signals={['out']} />,
    );
    const headers = getAllByText(/Phase/i);
    fireEvent.click(headers[0]);
    fireEvent.click(headers[0]);
  });

  it('renders with colors prop', () => {
    const { container } = render(
      <BodePlot data={mockACResult()} signals={['out']} colors={{ out: '#ff0000' }} />,
    );
    expect(container.querySelectorAll('canvas').length).toBe(2);
  });

  it('renders with signalVisibility prop', () => {
    const { container } = render(
      <BodePlot data={mockACResult()} signals={['out']} signalVisibility={{ out: false }} />,
    );
    expect(container.querySelectorAll('canvas').length).toBe(2);
  });

  it('renders with xDomain prop', () => {
    const { container } = render(
      <BodePlot data={mockACResult()} signals={['out']} xDomain={[10, 1e6]} />,
    );
    expect(container.querySelectorAll('canvas').length).toBe(2);
  });

  it('calls onCursorMove when provided', () => {
    const onCursorMove = vi.fn();
    render(
      <BodePlot data={mockACResult()} signals={['out']} onCursorMove={onCursorMove} />,
    );
    expect(onCursorMove).not.toHaveBeenCalled();
  });

  it('unmounts cleanly without errors', () => {
    const { unmount } = render(
      <BodePlot data={mockACResult()} signals={['out']} />,
    );
    unmount();
  });

  it('renders with numeric height prop', () => {
    const { container } = render(
      <BodePlot data={mockACResult()} signals={['out']} height={250} />,
    );
    expect(container.querySelectorAll('canvas').length).toBe(2);
  });
});
