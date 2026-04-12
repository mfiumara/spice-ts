import { createRoot } from 'react-dom/client';
import { useState, useEffect, useCallback } from 'react';
import { simulate, simulateStream } from '@spice-ts/core';
import { WaveformViewer } from '@spice-ts/ui/react';
import type { SimulationResult } from '@spice-ts/core';

const RC_NETLIST = `
* RC Low-Pass Filter
V1 in 0 PULSE(0 5 0 1n 1n 5m 10m)
R1 in out 1k
C1 out 0 100n
.tran 1u 10m
.ac dec 20 1 10Meg
`;

const STREAM_NETLIST = `
* Half-wave rectifier with RC smoothing (streaming demo)
* Diode nonlinearity forces Newton-Raphson per step — visibly progressive
V1 in 0 SIN(0 10 500)
D1 in rect DMOD
.model DMOD D (IS=1e-14 N=1.05 RS=0.5)
R1 rect out 100
C1 out 0 100u
R2 out 0 1k
.tran 0.1u 20m
`;

const buttonStyle: React.CSSProperties = {
  fontSize: '13px',
  fontFamily: "'Inter', -apple-system, sans-serif",
  color: 'hsl(210, 40%, 98%)',
  background: 'hsl(215, 20%, 12%)',
  border: '1px solid hsl(215, 20%, 25%)',
  borderRadius: '6px',
  padding: '8px 16px',
  cursor: 'pointer',
  fontWeight: 500,
};

function App() {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<AsyncIterableIterator<unknown> | null>(null);
  const [streaming, setStreaming] = useState(false);

  useEffect(() => {
    simulate(RC_NETLIST)
      .then(setResult)
      .catch((e: Error) => setError(e.message));
  }, []);

  const handleRunStreaming = useCallback(() => {
    setStream(null);
    setStreaming(true);
    // Small delay to let React clear the previous stream
    setTimeout(() => {
      const s = simulateStream(STREAM_NETLIST);
      setStream(s as AsyncIterableIterator<unknown>);
    }, 50);
  }, []);

  if (error) return <div style={{ color: 'red' }}>Error: {error}</div>;
  if (!result) return <div>Running simulation...</div>;

  return (
    <div>
      <h1>spice-ts Waveform Viewer</h1>

      <h2>Transient — RC Step Response</h2>
      <WaveformViewer
        transient={result.transient}
        signals={['out', 'in']}
        colors={{ out: '#4ade80', in: '#60a5fa' }}
        theme="dark"
      />

      <h2>AC — Bode Plot</h2>
      <WaveformViewer
        ac={result.ac}
        signals={['out']}
        colors={{ out: '#f97316' }}
        theme="dark"
      />

      <h2>Streaming Simulation</h2>
      <p style={{ fontSize: '13px', color: 'hsl(215, 20%, 55%)', marginBottom: '12px' }}>
        Click "Run" to watch the simulation draw in real-time.
      </p>
      <div style={{ marginBottom: '12px' }}>
        <button style={buttonStyle} onClick={handleRunStreaming}>
          {streaming ? '↻ Re-run' : '▶ Run'}
        </button>
      </div>
      {stream && (
        <WaveformViewer
          stream={stream}
          signals={['in', 'out']}
          colors={{ in: '#60a5fa', out: '#4ade80' }}
          theme="dark"
        />
      )}

      <h2>Light Theme</h2>
      <WaveformViewer
        transient={result.transient}
        signals={['out']}
        colors={{ out: '#16a34a' }}
        theme="light"
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
