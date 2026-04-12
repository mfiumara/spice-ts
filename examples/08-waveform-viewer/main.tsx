import { createRoot } from 'react-dom/client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { simulate, simulateStream } from '@spice-ts/core';
import { WaveformViewer, BodePlot } from '@spice-ts/ui/react';
import { ACStreamingController } from '@spice-ts/ui';
import type { SimulationResult, ACResult } from '@spice-ts/core';
import type { ACDataset } from '@spice-ts/ui';

const RC_NETLIST = `
* RC Low-Pass Filter
V1 in 0 PULSE(0 5 0 1n 1n 5m 10m) AC 1
R1 in out 1k
C1 out 0 100n
.tran 1u 10m
.ac dec 20 1 10Meg
`;

const STREAM_TRAN_NETLIST = `
* RC pulse response (streaming demo)
V1 in 0 PULSE(0 5 0 10u 10u 2m 4m)
R1 in out 10k
C1 out 0 100n
.tran 0.1u 20m 0 0.1u
`;

const STREAM_AC_NETLIST = `
* RC Low-Pass AC sweep (streaming demo)
V1 in 0 AC 1
R1 in out 1k
C1 out 0 100n
.ac dec 100 1 10Meg
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

function StreamingBodePlot() {
  const [acData, setAcData] = useState<ACDataset[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<ACStreamingController | null>(null);
  const rafRef = useRef<number>(0);

  const handleRun = useCallback(() => {
    // Cleanup previous
    controllerRef.current?.stop();
    cancelAnimationFrame(rafRef.current);
    setAcData(null);
    setError(null);
    setRunning(true);

    let dirty = false;
    const controller = new ACStreamingController(['out'], () => { dirty = true; });
    controllerRef.current = controller;

    const loop = () => {
      if (dirty) {
        dirty = false;
        setAcData([controller.getDataset()]);
      }
      if (controller.isRunning()) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        setAcData([controller.getDataset()]);
        setRunning(false);
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    const stream = simulateStream(STREAM_AC_NETLIST);
    controller.consume(stream as AsyncIterable<any>).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
      setRunning(false);
    });
  }, []);

  return (
    <div>
      <div style={{ marginBottom: '12px' }}>
        <button style={buttonStyle} onClick={handleRun}>
          {running ? '⏳ Running...' : acData ? '↻ Re-run AC' : '▶ Run AC Sweep'}
        </button>
      </div>
      {error && (
        <div style={{ color: '#f87171', fontSize: '13px', marginBottom: '8px' }}>
          Simulation error: {error}
        </div>
      )}
      {acData && (
        <BodePlot data={acData} signals={['out']} colors={{ out: '#f97316' }} theme="dark" />
      )}
    </div>
  );
}

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
    setTimeout(() => {
      const s = simulateStream(STREAM_TRAN_NETLIST);
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

      <h2>Streaming Transient</h2>
      <p style={{ fontSize: '13px', color: 'hsl(215, 20%, 55%)', marginBottom: '12px' }}>
        Watch the RC pulse response draw in real-time.
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
          xDomain={[0, 20e-3]}
        />
      )}

      <h2>Streaming AC Sweep</h2>
      <p style={{ fontSize: '13px', color: 'hsl(215, 20%, 55%)', marginBottom: '12px' }}>
        Watch the Bode plot build frequency-by-frequency.
      </p>
      <StreamingBodePlot />

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
