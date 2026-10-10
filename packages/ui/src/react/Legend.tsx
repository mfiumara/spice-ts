import type { CSSProperties } from 'react';

export interface LegendSignal {
  id: string;
  label: string;
  color: string;
  visible: boolean;
}

export interface LegendProps {
  signals: LegendSignal[];
  onToggle: (signalId: string) => void;
  onRemove?: (signalId: string) => void;
  style?: CSSProperties;
}

export function Legend({ signals, onToggle, onRemove, style }: LegendProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        padding: '8px 12px',
        ...style,
      }}
    >
      {signals.map((signal) => (
        <div
          key={signal.id}
          data-signal-id={signal.id}
          onClick={() => onToggle(signal.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            opacity: signal.visible ? 1 : 0.35,
            transition: 'opacity 0.15s',
            userSelect: 'none',
          }}
        >
          <button
            type="button"
            aria-label={`Toggle ${signal.label}`}
            aria-pressed={signal.visible}
            data-probe-color={signal.color}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
              color: 'inherit', font: 'inherit', background: 'transparent', border: 0, padding: 0,
            }}
          >
            <span aria-hidden="true" style={{
              width: '12px', height: '3px', borderRadius: '1px', background: signal.color,
            }} />
            <span>{signal.label}</span>
          </button>
          {onRemove && (
            <button type="button" aria-label={`Remove ${signal.label}`}
              onClick={(event) => { event.stopPropagation(); onRemove(signal.id); }}
              style={{ color: 'inherit', font: 'inherit', background: 'transparent', border: 0, padding: '0 2px', cursor: 'pointer' }}
            >×</button>
          )}
        </div>
      ))}
    </div>
  );
}
