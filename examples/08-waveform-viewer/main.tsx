import { createRoot } from 'react-dom/client';
import { useState, useEffect } from 'react';
import { simulate } from '@spice-ts/core';
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

function App() {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    simulate(RC_NETLIST)
      .then(setResult)
      .catch((e: Error) => setError(e.message));
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
