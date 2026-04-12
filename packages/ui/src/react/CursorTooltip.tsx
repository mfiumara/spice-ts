import type { CSSProperties } from 'react';
import type { CursorState, ThemeConfig } from '../core/types.js';
import { formatSI } from '../core/format.js';

export interface CursorTooltipProps {
  cursor: CursorState | null;
  theme: ThemeConfig;
  /** Format the x-axis value (default: formatSI). */
  formatX?: (x: number) => string;
  style?: CSSProperties;
}

export function CursorTooltip({ cursor, theme, formatX, style }: CursorTooltipProps) {
  if (!cursor) return null;

  const xLabel = formatX ? formatX(cursor.x) : formatSI(cursor.x);

  const tooltipStyle: CSSProperties = {
    position: 'absolute',
    left: cursor.pixelX + 12,
    top: 8,
    background: theme.tooltipBg,
    border: `1px solid ${theme.tooltipBorder}`,
    borderRadius: '6px',
    padding: '6px 10px',
    fontSize: `${theme.fontSize}px`,
    fontFamily: theme.font,
    color: theme.text,
    minWidth: '120px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    pointerEvents: 'none',
    zIndex: 10,
    ...style,
  };

  return (
    <div style={tooltipStyle}>
      <div style={{ color: theme.textMuted, marginBottom: '4px' }}>
        {xLabel}
      </div>
      {cursor.values.map((v) => (
        <div
          key={v.signalId}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}
        >
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: v.color,
              flexShrink: 0,
            }}
          />
          <span>
            {v.label} = {formatSI(v.value)}{v.unit}
          </span>
        </div>
      ))}
    </div>
  );
}
