import { createRoot } from 'react-dom/client';
import { useState, useDeferredValue, useMemo, useRef, useCallback, useEffect } from 'react';
import { parse, simulate, simulateStream, ParseError } from '@spice-ts/core';
import type { CircuitIR, AnalysisCommand } from '@spice-ts/core';
import { SchematicView, TransientPlot, BodePlot, DCSweepPlot, Legend } from '@spice-ts/ui/react';
import type { LegendSignal } from '@spice-ts/ui/react';
import type { TransientDataset, ACDataset, DCSweepDataset } from '@spice-ts/ui';
import { DEFAULT_PALETTE } from '@spice-ts/ui';
import { highlight } from './highlight.js';
import './editor.css';

// Schematic-friendly starter that also has a transient analysis ready to run.
const STARTER = `* spice-ts editor — edit me, schematic + sim update live
V1 in 0 PULSE(0 5 0 1n 1n 5m 10m)
R1 in out 1k
C1 out 0 100n
.tran 10u 20m
`;

type AnalysisKind = 'tran' | 'ac' | 'dc';

interface ParseResult {
  ir: CircuitIR | null;
  analysis: AnalysisCommand | null;
  error: { line: number; message: string } | null;
}

function parseNetlist(netlist: string): ParseResult {
  if (!netlist.trim()) return { ir: null, analysis: null, error: null };
  try {
    const circuit = parse(netlist);
    const ir = circuit.toIR();
    const analysis = circuit.analyses.find(a => a.type === 'tran' || a.type === 'ac' || a.type === 'dc') ?? null;
    if (ir.components.length === 0) return { ir: null, analysis, error: null };
    return { ir, analysis, error: null };
  } catch (e) {
    if (e instanceof ParseError) {
      return { ir: null, analysis: null, error: { line: e.line, message: e.message.split('\n')[0].replace(/^Parse error at line \d+: /, '') } };
    }
    return { ir: null, analysis: null, error: { line: 0, message: e instanceof Error ? e.message : String(e) } };
  }
}

// Auto-detect signal names from the IR. Prefer non-ground node voltages —
// caller can override via the Signals input.
function defaultSignals(ir: CircuitIR): string[] {
  const nets = new Set<string>();
  for (const c of ir.components) {
    for (const p of c.ports) if (p.net !== '0') nets.add(p.net);
  }
  return [...nets];
}

function buildLegend(signals: string[], visibility: Record<string, boolean>): LegendSignal[] {
  const palette = DEFAULT_PALETTE as unknown as string[];
  return signals.map((id, i) => ({
    id, label: id, color: palette[i % palette.length], visible: visibility[id] ?? true,
  }));
}

function App() {
  const [netlist, setNetlist] = useState(STARTER);
  const [signalsText, setSignalsText] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [tranData, setTranData] = useState<TransientDataset[] | null>(null);
  const [acData, setAcData]     = useState<ACDataset[] | null>(null);
  const [dcData, setDcData]     = useState<DCSweepDataset[] | null>(null);
  const [activeSignals, setActiveSignals] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  // Plot components preserve zoom/pan/x-domain across `data` changes so that
  // streaming doesn't reset the view mid-run. That helpful behavior becomes
  // confusing when a brand-new run produces a different time range — it'd
  // render off-screen behind the stale view. Bumping `runId` and using it as
  // a React key forces a fresh plot instance per Run, which auto-fits.
  const [runId, setRunId] = useState(0);
  const stopRef = useRef(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  // Keep the highlighted <pre> scrolled in sync with the <textarea>. Without
  // this, the visible characters drift apart from the caret as the user
  // scrolls vertically or horizontally past the viewport.
  const syncScroll = useCallback(() => {
    const ta = taRef.current, pre = preRef.current;
    if (ta && pre) {
      pre.scrollTop = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
    }
  }, []);

  const highlighted = useMemo(() => highlight(netlist), [netlist]);

  const deferredNetlist = useDeferredValue(netlist);
  const result = useMemo(() => parseNetlist(deferredNetlist), [deferredNetlist]);
  const stale = netlist !== deferredNetlist;

  // Ground-truth signal list for the active run. If user typed something into
  // the signals input, use that (comma-separated). Otherwise fall back to all
  // non-ground nets in the IR.
  const signals = useMemo(() => {
    const typed = signalsText.split(',').map(s => s.trim()).filter(Boolean);
    if (typed.length > 0) return typed;
    return result.ir ? defaultSignals(result.ir) : [];
  }, [signalsText, result.ir]);

  const analysisKind: AnalysisKind | null = result.analysis?.type === 'op' ? null : (result.analysis?.type ?? null);

  const reset = () => {
    setTranData(null); setAcData(null); setDcData(null);
    setError(null); setElapsed(null);
    setVisibility({});
  };

  const run = useCallback(async () => {
    if (running) return;
    // Re-parse against the live netlist string. The component-level `result`
    // is derived from `useDeferredValue(netlist)` which can lag behind the
    // textarea by a render or two — using it here means a fast-typed edit
    // could be missed and the run would use stale signals / analysis.
    const fresh = parseNetlist(netlist);
    if (fresh.error || !fresh.ir || !fresh.analysis) {
      setError(fresh.error?.message ?? 'no .tran / .ac / .dc directive');
      return;
    }
    const runSignals = signalsText.trim()
      ? signalsText.split(',').map(s => s.trim()).filter(Boolean)
      : defaultSignals(fresh.ir);

    reset();
    setActiveSignals(runSignals);
    setRunning(true);
    setRunId(n => n + 1);
    stopRef.current = false;
    const t0 = performance.now();

    try {
      const kind = fresh.analysis.type;
      if (kind === 'tran') {
        const time: number[] = [];
        const sigMap = new Map<string, number[]>();
        for (const s of runSignals) sigMap.set(s, []);
        // Snapshot turns the in-progress mutable buffers into the immutable
        // arrays/Maps the plot expects. Called both during streaming (RAF
        // tick, every frame) and once unconditionally at the end.
        const snapshot = (): TransientDataset[] => [{
          time: [...time],
          signals: new Map([...sigMap].map(([k, v]) => [k, [...v]])),
          label: '',
        }];
        let dirty = false;
        const raf = () => {
          if (dirty) { dirty = false; setTranData(snapshot()); }
          if (!stopRef.current) requestAnimationFrame(raf);
        };
        requestAnimationFrame(raf);

        let count = 0;
        for await (const step of simulateStream(netlist)) {
          if (stopRef.current) break;
          if (!('time' in step)) continue;
          time.push(step.time);
          for (const s of runSignals) {
            const v = step.voltages.get(s) ?? step.currents.get(s) ?? 0;
            sigMap.get(s)!.push(v);
          }
          if (++count % 500 === 0) await new Promise<void>(r => setTimeout(r, 0));
          dirty = true;
        }
        // Final unconditional flush, then bump runId so the plot remounts
        // with a fresh renderer that auto-fits the now-complete dataset.
        setTranData(snapshot());
        setRunId(n => n + 1);
        stopRef.current = true;
      } else if (kind === 'ac') {
        const frequencies: number[] = [];
        const mags = new Map<string, number[]>();
        const phases = new Map<string, number[]>();
        for (const s of runSignals) { mags.set(s, []); phases.set(s, []); }
        const snapshot = (): ACDataset[] => [{
          frequencies: [...frequencies],
          magnitudes: new Map([...mags].map(([k, v]) => [k, [...v]])),
          phases: new Map([...phases].map(([k, v]) => [k, [...v]])),
          label: '',
        }];
        let dirty = false;
        const raf = () => {
          if (dirty) { dirty = false; setAcData(snapshot()); }
          if (!stopRef.current) requestAnimationFrame(raf);
        };
        requestAnimationFrame(raf);

        let count = 0;
        for await (const point of simulateStream(netlist)) {
          if (stopRef.current) break;
          if (!('frequency' in point)) continue;
          frequencies.push(point.frequency);
          for (const s of runSignals) {
            const phasor = point.voltages.get(s) ?? point.currents.get(s);
            if (phasor) {
              mags.get(s)!.push(20 * Math.log10(Math.max(phasor.magnitude, 1e-30)));
              phases.get(s)!.push(phasor.phase);
            }
          }
          if (++count % 50 === 0) await new Promise<void>(r => setTimeout(r, 0));
          dirty = true;
        }
        setAcData(snapshot());
        setRunId(n => n + 1);
        stopRef.current = true;
      } else if (kind === 'dc') {
        const r = await simulate(netlist);
        if (!r.dcSweep) throw new Error('No DC sweep result');
        const sweepValues = Array.from(r.dcSweep.sweepValues);
        const sigMap = new Map<string, number[]>();
        for (const s of runSignals) {
          try { sigMap.set(s, Array.from(r.dcSweep.voltage(s))); }
          catch {
            try { sigMap.set(s, Array.from(r.dcSweep.current(s))); }
            catch { sigMap.set(s, new Array(sweepValues.length).fill(0)); }
          }
        }
        setDcData([{ sweepValues, signals: sigMap, label: '' }]);
        setRunId(n => n + 1);
      }
      setElapsed(Math.round(performance.now() - t0));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      stopRef.current = true;
    }
  }, [netlist, signalsText, running]);

  const stop = useCallback(() => { stopRef.current = true; setRunning(false); }, []);

  // Auto-cancel any in-flight sim when the netlist changes (so the next click
  // starts fresh). Doesn't auto-rerun — user clicks Run.
  useEffect(() => {
    if (running) { stopRef.current = true; setRunning(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netlist]);

  const toggleVisibility = useCallback((id: string) => {
    setVisibility(prev => ({ ...prev, [id]: !(prev[id] ?? true) }));
  }, []);

  const lineCount = netlist.split('\n').length;
  const hasResult = !!(tranData || acData || dcData);

  return (
    <div className="app">
      <header className="topbar">
        <h1>spice-<span className="accent">ts</span> editor</h1>
        <span className="hint">edit netlist on the left → schematic + sim update on the right</span>
      </header>

      <div className="split">
        <section className="pane">
          <div className="pane-header">netlist</div>
          <div className="editor-wrap">
            <pre
              className="editor-hl"
              ref={preRef}
              dangerouslySetInnerHTML={{ __html: highlighted + '\n' }}
            />
            <textarea
              className="editor-textarea"
              ref={taRef}
              value={netlist}
              onChange={e => setNetlist(e.target.value)}
              onScroll={syncScroll}
              spellCheck={false}
              wrap="off"
              autoFocus
            />
          </div>
          <div className="status">
            {result.error ? (
              <>
                <span className="err">parse error</span>
                {result.error.line > 0 && <span className="where">line {result.error.line}</span>}
                <span>{result.error.message}</span>
              </>
            ) : result.ir ? (
              <>
                <span className="ok">ok</span>
                <span className="where">{result.ir.components.length} components · {lineCount} lines{stale ? ' · parsing…' : ''}</span>
              </>
            ) : (
              <span className="where">empty</span>
            )}
          </div>
        </section>
        <section className="pane">
          <div className="pane-header">schematic</div>
          <div className="canvas">
            {result.ir ? (
              <SchematicView circuit={result.ir} theme="dark" width="100%" height="100%" />
            ) : (
              <div className="canvas-empty">
                {result.error ? 'fix the parse error to render the schematic' : 'add some components to render the schematic'}
              </div>
            )}
          </div>
          <div className="status">
            <span className="where">{result.ir ? `${result.ir.nets.length} nets` : '—'}</span>
          </div>
        </section>
      </div>

      <div className="sim-toolbar">
        <button className="btn primary" onClick={run} disabled={running || !analysisKind || !!result.error}>▶ Run</button>
        <button className="btn" onClick={stop} disabled={!running}>■ Stop</button>
        <span className="label">analysis</span>
        <span style={{ color: 'var(--text)', fontSize: 12 }}>
          {analysisKind ? `.${analysisKind}` : <span style={{ color: 'var(--text-muted)' }}>none — add a .tran / .ac / .dc directive</span>}
        </span>
        <span className="label">signals</span>
        <input
          className="signals-input"
          type="text"
          value={signalsText}
          onChange={e => setSignalsText(e.target.value)}
          placeholder={result.ir ? defaultSignals(result.ir).join(', ') : 'auto'}
        />
        <span className="info">
          {error ? <span className="err">error: {error}</span>
            : running ? `simulating… (#${runId})`
            : elapsed !== null ? <span className="ok">done in {elapsed}ms (#{runId}, {tranData?.[0]?.time.length ?? acData?.[0]?.frequencies.length ?? dcData?.[0]?.sweepValues.length ?? 0} pts)</span>
            : '—'}
        </span>
      </div>

      <section className="plot">
        {hasResult && (
          <>
            {tranData && (
              <div className="plot-pane">
                <div className="plot-canvas">
                  <TransientPlot key={`tran-${runId}`} data={tranData} signals={activeSignals} theme="dark" width="100%" height="100%" signalVisibility={visibility} />
                </div>
                <Legend signals={buildLegend(activeSignals, visibility)} onToggle={toggleVisibility} />
              </div>
            )}
            {acData && (
              <div className="plot-pane">
                <div className="plot-canvas">
                  {/* Bode height is per-pane (mag + phase) — fixed pixel value
                      avoids the 200%-of-parent trap that "100%" would create. */}
                  <BodePlot key={`ac-${runId}`} data={acData} signals={activeSignals} theme="dark" width="100%" height={180} signalVisibility={visibility} />
                </div>
                <Legend signals={buildLegend(activeSignals, visibility)} onToggle={toggleVisibility} />
              </div>
            )}
            {dcData && (
              <div className="plot-pane">
                <div className="plot-canvas">
                  <DCSweepPlot key={`dc-${runId}`} data={dcData} signals={activeSignals} theme="dark" width="100%" height="100%" signalVisibility={visibility} xLabel="Sweep" />
                </div>
                <Legend signals={buildLegend(activeSignals, visibility)} onToggle={toggleVisibility} />
              </div>
            )}
          </>
        )}
        {!hasResult && (
          <div className="plot-empty">
            {analysisKind ? 'press Run to simulate' : 'add a .tran / .ac / .dc directive to the netlist'}
          </div>
        )}
      </section>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
