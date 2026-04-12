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
* CMOS Inverter Chain — heavy transient (streaming demo)
.model NMOS NMOS (VTO=0.7 KP=110e-6 LAMBDA=0.04 CBD=5p CBS=5p)
.model PMOS PMOS (VTO=-0.7 KP=50e-6 LAMBDA=0.05 CBD=5p CBS=5p)
V1 vdd 0 DC 5
V2 in 0 PULSE(0 5 0 0.1n 0.1n 50n 100n)
M1 out in vdd vdd PMOS W=10u L=1u
M2 out in 0 0 NMOS W=5u L=1u
C1 out 0 1p
.tran 0.05n 500n
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
          signals={['out', 'in']}
          colors={{ out: '#4ade80', in: '#60a5fa' }}
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
