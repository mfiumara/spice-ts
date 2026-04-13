import { createRoot } from 'react-dom/client';
import { useState, useEffect } from 'react';
import { simulate } from '@spice-ts/core';
import type { StepResult } from '@spice-ts/core';
import { TransientPlot, BodePlot, CursorTooltip } from '@spice-ts/ui/react';
import { DARK_THEME, formatTime, formatFrequency, formatSI } from '@spice-ts/ui';
import type { TransientDataset, ACDataset, CursorState } from '@spice-ts/ui';

// --- Netlists ---

const STEP_TRAN_NETLIST = `
* RC pulse response with parametric R sweep
V1 in 0 PULSE(0 5 0 10u 10u 2m 4m)
R1 in out 1k
C1 out 0 100n
.tran 1u 10m
.step param R1 list 1k 5k 10k
`;

const STEP_AC_NETLIST = `
* RC low-pass filter with parametric R sweep
V1 in 0 AC 1
R1 in out 1k
C1 out 0 100n
.ac dec 20 1 10Meg
.step param R1 list 1k 5k 10k
`;

// --- Data conversion ---

function stepsToTransientDatasets(
  steps: StepResult[],
  signals: string[],
): TransientDataset[] {
  return steps.map((step) => {
    const signalMap = new Map<string, number[]>();
    if (step.transient) {
      for (const name of signals) {
        try { signalMap.set(name, step.transient.voltage(name)); } catch {
          try { signalMap.set(name, step.transient.current(name)); } catch { /* skip */ }
        }
      }
    }
    return {
      time: step.transient?.time ?? [],
      signals: signalMap,
      label: `${step.paramName}=${formatSI(step.paramValue)}\u03A9`,
    };
  });
}

function stepsToACDatasets(
  steps: StepResult[],
  signals: string[],
): ACDataset[] {
  return steps.map((step) => {
    const magnitudes = new Map<string, number[]>();
    const phases = new Map<string, number[]>();
    if (step.ac) {
      for (const name of signals) {
        try {
          const phasors = step.ac.voltage(name);
          magnitudes.set(name, phasors.map(p => 20 * Math.log10(Math.max(p.magnitude, 1e-30))));
          phases.set(name, phasors.map(p => p.phase));
        } catch {
          try {
            const phasors = step.ac.current(name);
            magnitudes.set(name, phasors.map(p => 20 * Math.log10(Math.max(p.magnitude, 1e-30))));
            phases.set(name, phasors.map(p => p.phase));
          } catch { /* skip */ }
        }
      }
    }
    return {
      frequencies: step.ac?.frequencies ?? [],
      magnitudes,
      phases,
      label: `${step.paramName}=${formatSI(step.paramValue)}\u03A9`,
    };
  });
}

// --- Components ---

function SteppedTransient() {
  const [data, setData] = useState<TransientDataset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<CursorState | null>(null);

  useEffect(() => {
    simulate(STEP_TRAN_NETLIST).then((result) => {
      if (result.steps) {
        setData(stepsToTransientDatasets(result.steps, ['out']));
      }
    }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, []);

  if (error) return <div style={{ color: '#f87171', fontSize: '13px' }}>Error: {error}</div>;
  if (!data) return <div style={{ color: 'hsl(215, 20%, 55%)', fontSize: '13px' }}>Simulating...</div>;

  return (
    <div style={{ position: 'relative' }}>
      <TransientPlot
        data={data}
        signals={['out']}
        theme="dark"
        height={300}
        onCursorMove={setCursor}
      />
      <CursorTooltip cursor={cursor} theme={DARK_THEME} formatX={formatTime} />
    </div>
  );
}

function SteppedAC() {
  const [data, setData] = useState<ACDataset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<CursorState | null>(null);

  useEffect(() => {
    simulate(STEP_AC_NETLIST).then((result) => {
      if (result.steps) {
        setData(stepsToACDatasets(result.steps, ['out']));
      }
    }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, []);

  if (error) return <div style={{ color: '#f87171', fontSize: '13px' }}>Error: {error}</div>;
  if (!data) return <div style={{ color: 'hsl(215, 20%, 55%)', fontSize: '13px' }}>Simulating...</div>;

  return (
    <div style={{ position: 'relative' }}>
      <BodePlot
        data={data}
        signals={['out']}
        theme="dark"
        height={200}
        onCursorMove={setCursor}
      />
      <CursorTooltip cursor={cursor} theme={DARK_THEME} formatX={formatFrequency} />
    </div>
  );
}

function App() {
  return (
    <div>
      <h1>spice-ts Showcase</h1>

      <h2>Transient — RC Pulse Response (.step R1)</h2>
      <p style={{ fontSize: '13px', color: 'hsl(215, 20%, 55%)', marginBottom: '12px' }}>
        Family of RC charging curves with R1 swept across 1k, 5k, and 10k.
      </p>
      <SteppedTransient />

      <h2>AC — RC Frequency Response (.step R1)</h2>
      <p style={{ fontSize: '13px', color: 'hsl(215, 20%, 55%)', marginBottom: '12px' }}>
        Family of Bode plots showing how the cutoff frequency shifts with R1.
      </p>
      <SteppedAC />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
