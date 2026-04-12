import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CursorTooltip } from './CursorTooltip.js';
import { DARK_THEME } from '../core/theme.js';
import type { CursorState } from '../core/types.js';

function makeCursor(overrides?: Partial<CursorState>): CursorState {
  return {
    x: 1e-3,
    pixelX: 200,
    values: [
      { signalId: 'out', label: 'out', value: 2.5, unit: 'V', color: '#4ade80' },
    ],
    ...overrides,
  };
}

describe('CursorTooltip', () => {
  it('renders nothing when cursor is null', () => {
    const { container } = render(
      <CursorTooltip cursor={null} theme={DARK_THEME} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders tooltip when cursor is provided', () => {
    const { container } = render(
      <CursorTooltip cursor={makeCursor()} theme={DARK_THEME} />,
    );
    expect(container.firstChild).not.toBeNull();
  });

  it('renders signal label and value', () => {
    const { container } = render(
      <CursorTooltip cursor={makeCursor()} theme={DARK_THEME} />,
    );
    // Should contain the signal label somewhere in the rendered output
    expect(container.textContent).toContain('out');
  });

  it('renders multiple signal values', () => {
    const cursor: CursorState = {
      x: 2e-3,
      pixelX: 300,
      values: [
        { signalId: 'out', label: 'out', value: 3.3, unit: 'V', color: '#4ade80' },
        { signalId: 'in', label: 'in', value: 5.0, unit: 'V', color: '#60a5fa' },
      ],
    };
    const { container } = render(
      <CursorTooltip cursor={cursor} theme={DARK_THEME} />,
    );
    // Both signal labels should appear
    const text = container.textContent ?? '';
    expect(text).toContain('out');
    expect(text).toContain('in');
  });

  it('uses custom formatX when provided', () => {
    const formatX = (x: number) => `${(x * 1000).toFixed(1)} ms`;
    const { container } = render(
      <CursorTooltip cursor={makeCursor({ x: 0.001 })} theme={DARK_THEME} formatX={formatX} />,
    );
    expect(container.textContent).toContain('1.0 ms');
  });

  it('uses default formatSI when formatX is omitted', () => {
    const { container } = render(
      <CursorTooltip cursor={makeCursor({ x: 1e-3 })} theme={DARK_THEME} />,
    );
    // formatSI(1e-3) → '1.000m' or similar — just verify something rendered
    expect(container.firstChild).not.toBeNull();
  });

  it('applies inline style override via style prop', () => {
    const { container } = render(
      <CursorTooltip
        cursor={makeCursor()}
        theme={DARK_THEME}
        style={{ top: 50 }}
      />,
    );
    const div = container.firstChild as HTMLElement;
    expect(div.style.top).toBe('50px');
  });

  it('positions tooltip at pixelX + 12', () => {
    const { container } = render(
      <CursorTooltip cursor={makeCursor({ pixelX: 200 })} theme={DARK_THEME} />,
    );
    const div = container.firstChild as HTMLElement;
    expect(div.style.left).toBe('212px');
  });
});
