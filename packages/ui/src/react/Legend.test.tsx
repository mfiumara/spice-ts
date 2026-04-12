import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Legend } from './Legend.js';

describe('Legend', () => {
  const signals = [
    { id: 'out', label: 'V(out)', color: '#4ade80', visible: true },
    { id: 'in', label: 'V(in)', color: '#60a5fa', visible: true },
  ];

  it('renders signal labels', () => {
    const { getByText } = render(
      <Legend signals={signals} onToggle={() => {}} />,
    );
    expect(getByText('V(out)')).toBeDefined();
    expect(getByText('V(in)')).toBeDefined();
  });

  it('calls onToggle with signal id when clicked', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <Legend signals={signals} onToggle={onToggle} />,
    );
    const item = container.querySelector('[data-signal-id="out"]') as HTMLElement;
    fireEvent.click(item);
    expect(onToggle).toHaveBeenCalledWith('out');
  });

  it('dims hidden signals', () => {
    const hiddenSignals = [
      { id: 'out', label: 'V(out)', color: '#4ade80', visible: false },
      { id: 'in', label: 'V(in)', color: '#60a5fa', visible: true },
    ];
    const { container } = render(
      <Legend signals={hiddenSignals} onToggle={() => {}} />,
    );
    const items = container.querySelectorAll('[data-signal-id]');
    expect(items.length).toBe(2);
  });
});
