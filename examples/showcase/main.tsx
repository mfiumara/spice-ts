import { createRoot } from 'react-dom/client';
import { useState, useCallback, useRef } from 'react';
import { simulateStepStream } from '@spice-ts/core';
import type { StepStreamEvent } from '@spice-ts/core';
import { TransientPlot, BodePlot, CursorTooltip, Legend } from '@spice-ts/ui/react';
import type { LegendSignal } from '@spice-ts/ui/react';
import { DARK_THEME, formatTime, formatFrequency, formatSI, DEFAULT_PALETTE } from '@spice-ts/ui';
import type { TransientDataset, ACDataset, CursorState } from '@spice-ts/ui';

// --- Netlists ---
// Fine timestep (0.1us over 10ms = 100k points) so the streaming draw is visible.

const STEP_TRAN_NETLIST = `
* RC pulse response with parametric R sweep
V1 in 0 PULSE(0 5 0 10u 10u 2m 4m)
R1 in out 1k
C1 out 0 100n
.tran 0.1u 10m 0 0.1u
.step param R1 list 1k 5k 10k
`;

const STEP_AC_NETLIST = `
* RC low-pass filter with parametric R sweep
V1 in 0 AC 1
R1 in out 1k
C1 out 0 100n
.ac dec 100 1 10Meg
.step param R1 list 1k 5k 10k
`;

// --- Streaming accumulators ---

/** Accumulates StepStreamEvents into TransientDataset[] for progressive rendering. */
class StepTransientAccumulator {
  private steps = new Map<number, { time: number[]; signals: Map<string, number[]>; label: string }>();
  private signalNames: string[];

  constructor(signalNames: string[]) {
    this.signalNames = signalNames;
  }

  push(event: StepStreamEvent): void {
    const point = event.point;
    if (!('time' in point)) return;

    if (!this.steps.has(event.stepIndex)) {
      const signals = new Map<string, number[]>();
      for (const name of this.signalNames) signals.set(name, []);
      this.steps.set(event.stepIndex, {
        time: [],
        signals,
        label: `${event.paramName}=${formatSI(event.paramValue)}\u03A9`,
      });
    }

    const step = this.steps.get(event.stepIndex)!;
    step.time.push(point.time);
    for (const name of this.signalNames) {
      const value = point.voltages.get(name) ?? point.currents.get(name) ?? 0;
      step.signals.get(name)!.push(value);
    }
  }

  getDatasets(): TransientDataset[] {
    return [...this.steps.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, s]) => ({ time: s.time, signals: s.signals, label: s.label }));
  }
}

/** Accumulates StepStreamEvents into ACDataset[] for progressive rendering. */
class StepACAccumulator {
  private steps = new Map<number, {
    frequencies: number[];
    magnitudes: Map<string, number[]>;
    phases: Map<string, number[]>;
    label: string;
  }>();
  private signalNames: string[];

  constructor(signalNames: string[]) {
    this.signalNames = signalNames;
  }

  push(event: StepStreamEvent): void {
    const point = event.point;
    if (!('frequency' in point)) return;

    if (!this.steps.has(event.stepIndex)) {
      const magnitudes = new Map<string, number[]>();
      const phases = new Map<string, number[]>();
      for (const name of this.signalNames) {
        magnitudes.set(name, []);
        phases.set(name, []);
      }
      this.steps.set(event.stepIndex, {
        frequencies: [],
        magnitudes,
        phases,
        label: `${event.paramName}=${formatSI(event.paramValue)}\u03A9`,
      });
    }

    const step = this.steps.get(event.stepIndex)!;
    step.frequencies.push(point.frequency);
    for (const name of this.signalNames) {
      const phasor = point.voltages.get(name) ?? point.currents.get(name);
      if (phasor) {
        step.magnitudes.get(name)!.push(20 * Math.log10(Math.max(phasor.magnitude, 1e-30)));
        step.phases.get(name)!.push(phasor.phase);
      }
    }
  }

  getDatasets(): ACDataset[] {
    return [...this.steps.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, s]) => ({
        frequencies: s.frequencies,
        magnitudes: s.magnitudes,
        phases: s.phases,
        label: s.label,
      }));
  }
}

/** Build legend signals from datasets. */
function buildLegendSignals(
  datasets: { label: string }[],
  signals: string[],
  visibility: Record<string, boolean>,
): LegendSignal[] {
  const result: LegendSignal[] = [];
  let colorIdx = 0;
  for (const ds of datasets) {
    for (const name of signals) {
      const id = ds.label ? `${ds.label}:${name}` : name;
      result.push({
        id,
        label: ds.label ? `${ds.label}: ${name}` : name,
        color: DEFAULT_PALETTE[colorIdx % DEFAULT_PALETTE.length],
        visible: visibility[id] ?? true,
      });
      colorIdx++;
    }
  }
  return result;
}

// --- Styles ---

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

const noteStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'hsl(215, 20%, 40%)',
  fontStyle: 'italic',
  marginTop: '4px',
};

// --- Components ---

function SteppedTransient() {
  const [data, setData] = useState<TransientDataset[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<CursorState | null>(null);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [elapsed, setElapsed] = useState<number | null>(null);
  const stopRef = useRef(false);

  const handleRun = useCallback(() => {
    setData(null);
    setError(null);
    setRunning(true);
    setElapsed(null);
    stopRef.current = false;

    const accumulator = new StepTransientAccumulator(['out']);
    let dirty = false;
    const t0 = performance.now();

    const raf = () => {
      if (dirty) {
        dirty = false;
        setData(accumulator.getDatasets());
      }
      if (!stopRef.current) {
        requestAnimationFrame(raf);
      }
    };
    requestAnimationFrame(raf);

    (async () => {
      let count = 0;
      for await (const event of simulateStepStream(STEP_TRAN_NETLIST)) {
        if (stopRef.current) break;
        accumulator.push(event);
        dirty = true;
        if (++count % 500 === 0) {
          await new Promise<void>((r) => setTimeout(r, 0));
        }
      }
      stopRef.current = true;
      setData(accumulator.getDatasets());
      setRunning(false);
      setElapsed(Math.round(performance.now() - t0));
    })().catch((err: unknown) => {
      stopRef.current = true;
      setError(err instanceof Error ? err.message : String(err));
      setRunning(false);
    });
  }, []);

  const handleToggle = useCallback((signalId: string) => {
    setVisibility((prev) => ({ ...prev, [signalId]: !(prev[signalId] ?? true) }));
  }, []);

  return (
    <div>
      <div style={{ marginBottom: '12px' }}>
        <button style={buttonStyle} onClick={handleRun} disabled={running}>
          {running ? '\u23F3 Simulating...' : data ? '\u21BB Re-run' : '\u25B6 Run Simulation'}
        </button>
        {elapsed !== null && (
          <span style={{ ...noteStyle, marginLeft: '12px' }}>
            Completed in {elapsed}ms
          </span>
        )}
      </div>
      {error && (
        <div style={{ color: '#f87171', fontSize: '13px', marginBottom: '8px' }}>
          Simulation error: {error}
        </div>
      )}
      {data && (
        <div style={{ position: 'relative' }}>
          <TransientPlot
            data={data}
            signals={['out']}
            theme="dark"
            height={300}
            xDomain={[0, 10e-3]}
            onCursorMove={setCursor}
            signalVisibility={visibility}
          />
          <Legend
            signals={buildLegendSignals(data, ['out'], visibility)}
            onToggle={handleToggle}
          />
          <CursorTooltip cursor={cursor} theme={DARK_THEME} formatX={formatTime} />
        </div>
      )}
    </div>
  );
}

function SteppedAC() {
  const [data, setData] = useState<ACDataset[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<CursorState | null>(null);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [elapsed, setElapsed] = useState<number | null>(null);
  const stopRef = useRef(false);

  const handleRun = useCallback(() => {
    setData(null);
    setError(null);
    setRunning(true);
    setElapsed(null);
    stopRef.current = false;

    const accumulator = new StepACAccumulator(['out']);
    let dirty = false;
    const t0 = performance.now();

    const raf = () => {
      if (dirty) {
        dirty = false;
        setData(accumulator.getDatasets());
      }
      if (!stopRef.current) {
        requestAnimationFrame(raf);
      }
    };
    requestAnimationFrame(raf);

    (async () => {
      let count = 0;
      for await (const event of simulateStepStream(STEP_AC_NETLIST)) {
        if (stopRef.current) break;
        accumulator.push(event);
        dirty = true;
        if (++count % 50 === 0) {
          await new Promise<void>((r) => setTimeout(r, 0));
        }
      }
      stopRef.current = true;
      setData(accumulator.getDatasets());
      setRunning(false);
      setElapsed(Math.round(performance.now() - t0));
    })().catch((err: unknown) => {
      stopRef.current = true;
      setError(err instanceof Error ? err.message : String(err));
      setRunning(false);
    });
  }, []);

  const handleToggle = useCallback((signalId: string) => {
    setVisibility((prev) => ({ ...prev, [signalId]: !(prev[signalId] ?? true) }));
  }, []);

  return (
    <div>
      <div style={{ marginBottom: '12px' }}>
        <button style={buttonStyle} onClick={handleRun} disabled={running}>
          {running ? '\u23F3 Simulating...' : data ? '\u21BB Re-run' : '\u25B6 Run Simulation'}
        </button>
        {elapsed !== null && (
          <span style={{ ...noteStyle, marginLeft: '12px' }}>
            Completed in {elapsed}ms
          </span>
        )}
      </div>
      {error && (
        <div style={{ color: '#f87171', fontSize: '13px', marginBottom: '8px' }}>
          Simulation error: {error}
        </div>
      )}
      {data && (
        <div style={{ position: 'relative' }}>
          <BodePlot
            data={data}
            signals={['out']}
            theme="dark"
            height={200}
            xDomain={[1, 10e6]}
            onCursorMove={setCursor}
            signalVisibility={visibility}
          />
          <Legend
            signals={buildLegendSignals(data, ['out'], visibility)}
            onToggle={handleToggle}
          />
          <CursorTooltip cursor={cursor} theme={DARK_THEME} formatX={formatFrequency} />
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <div>
      <h1>spice-ts Showcase</h1>

      <h2>Transient — RC Pulse Response (.step R1)</h2>
      <p style={{ fontSize: '13px', color: 'hsl(215, 20%, 55%)', marginBottom: '4px' }}>
        Family of RC charging curves with R1 swept across 1k&Omega;, 5k&Omega;, and 10k&Omega;.
        Watch each step draw progressively as the simulator solves 100k timesteps (0.1&mu;s resolution over 10ms).
      </p>
      <p style={noteStyle}>
        Timestep deliberately fine (0.1&mu;s) to visualize streaming — a coarser timestep would complete near-instantly.
      </p>
      <SteppedTransient />

      <h2>AC — RC Frequency Response (.step R1)</h2>
      <p style={{ fontSize: '13px', color: 'hsl(215, 20%, 55%)', marginBottom: '4px' }}>
        Family of Bode plots showing how the cutoff frequency shifts with R1.
        100 points per decade across 7 decades (1Hz to 10MHz).
      </p>
      <p style={noteStyle}>
        Each step solves ~700 frequency points — watch the curves build from low to high frequency.
      </p>
      <SteppedAC />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
