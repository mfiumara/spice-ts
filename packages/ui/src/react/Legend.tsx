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
  style?: CSSProperties;
}

export function Legend({ signals, onToggle, style }: LegendProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        padding: '8px 0',
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
            cursor: 'pointer',
            opacity: signal.visible ? 1 : 0.35,
            transition: 'opacity 0.15s',
            userSelect: 'none',
          }}
        >
          <div
            style={{
              width: '12px',
              height: '3px',
              borderRadius: '1px',
              background: signal.color,
            }}
          />
          <span>{signal.label}</span>
        </div>
      ))}
    </div>
  );
}
