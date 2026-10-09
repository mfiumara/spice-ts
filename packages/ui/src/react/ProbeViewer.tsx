import { useCallback, useState, type CSSProperties } from 'react';
import type { CircuitIR } from '../schematic/types.js';
import type { ThemeConfig } from '../core/types.js';
import { DEFAULT_PALETTE } from '../core/types.js';
import { SchematicView, type SchematicProbe } from './SchematicView.js';
import { WaveformViewer, type WaveformViewerProps } from './WaveformViewer.js';

export interface Probe {
  kind: 'voltage' | 'current';
  target: string;
  color: string;
}

export interface ProbeViewerProps {
  circuit: CircuitIR;
  transient?: WaveformViewerProps['transient'];
  ac?: WaveformViewerProps['ac'];
  dc?: WaveformViewerProps['dc'];
  stream?: WaveformViewerProps['stream'];
  theme?: 'dark' | 'light' | ThemeConfig;
  initialProbes?: readonly Omit<Probe, 'color'>[];
  onProbesChange?: (probes: readonly Probe[]) => void;
  schematicHeight?: number | string;
  style?: CSSProperties;
}

function signalId(probe: Pick<Probe, 'kind' | 'target'>): string {
  return `${probe.kind === 'voltage' ? 'V' : 'I'}(${probe.target})`;
}

/**
 * Couples the schematic and waveform surfaces with dynamic node/branch probes.
 * Probe expressions stay explicit so a node and component with the same name
 * remain unambiguous in transient, AC, and DC result accessors.
 */
export function ProbeViewer({
  circuit,
  transient,
  ac,
  dc,
  stream,
  theme,
  initialProbes = [],
  onProbesChange,
  schematicHeight = 400,
  style,
}: ProbeViewerProps) {
  const [probes, setProbes] = useState<Probe[]>(() => initialProbes.map((probe, index) => ({
    ...probe,
    color: DEFAULT_PALETTE[index % DEFAULT_PALETTE.length],
  })));

  const updateProbes = useCallback((update: (current: Probe[]) => Probe[]) => {
    setProbes((current) => {
      const next = update(current);
      onProbesChange?.(next);
      return next;
    });
  }, [onProbesChange]);

  const toggleProbe = useCallback((kind: Probe['kind'], target: string) => {
    updateProbes((current) => {
      const existing = current.findIndex((probe) => probe.kind === kind && probe.target === target);
      if (existing >= 0) return current.filter((_, index) => index !== existing);
      return [...current, {
        kind,
        target,
        color: DEFAULT_PALETTE[current.length % DEFAULT_PALETTE.length],
      }];
    });
  }, [updateProbes]);

  const removeSignal = useCallback((id: string) => {
    updateProbes((current) => current.filter((probe) => signalId(probe) !== id));
  }, [updateProbes]);

  const signals = probes.map(signalId);
  const colors = Object.fromEntries(probes.map((probe) => [signalId(probe), probe.color]));
  const schematicProbes: SchematicProbe[] = probes;

  return (
    <div style={style}>
      <SchematicView
        circuit={circuit}
        theme={theme}
        height={schematicHeight}
        probes={schematicProbes}
        onNodeClick={(node) => toggleProbe('voltage', node)}
        onBranchClick={(component) => toggleProbe('current', component)}
      />
      <WaveformViewer
        transient={transient}
        ac={ac}
        dc={dc}
        stream={stream}
        signals={signals}
        colors={colors}
        theme={theme}
        onSignalRemove={removeSignal}
      />
    </div>
  );
}
