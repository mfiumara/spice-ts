import { createRoot } from 'react-dom/client';
import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { simulateStepStream } from '@spice-ts/core';
import type { StepStreamEvent } from '@spice-ts/core';
import { TransientPlot, BodePlot, CursorTooltip, Legend } from '@spice-ts/ui/react';
import type { LegendSignal } from '@spice-ts/ui/react';
import { DARK_THEME, formatTime, formatFrequency, formatSI, DEFAULT_PALETTE } from '@spice-ts/ui';
import type { TransientDataset, ACDataset, CursorState } from '@spice-ts/ui';
import './showcase.css';

// ─── Circuit definitions ────────────────────────────────────────────

interface CircuitDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  group: string;
  tag?: string;
  tranNetlist?: string;
  acNetlist?: string;
  dcNetlist?: string;
  xLabel?: string;
  signals: string[];
}

const CIRCUITS: CircuitDef[] = [
  {
    id: 'rc-lowpass',
    name: 'RC Low-Pass (.step)',
    desc: 'Sweep R: 1k, 5k, 10k',
    icon: '\u2393',
    group: 'Filters',
    tag: '.step',
    signals: ['out'],
    tranNetlist: `
* RC pulse response with parametric R sweep
V1 in 0 PULSE(0 5 0 10u 10u 2m 4m)
R1 in out 1k
C1 out 0 100n
.tran 0.1u 10m 0 0.1u
.step param R1 list 1k 5k 10k`,
    acNetlist: `
* RC low-pass filter with parametric R sweep
V1 in 0 AC 1
R1 in out 1k
C1 out 0 100n
.ac dec 100 1 10Meg
.step param R1 list 1k 5k 10k`,
  },
  {
    id: 'rlc-bandpass', name: 'RLC Bandpass', desc: 'Impulse + Bode',
    icon: '\u236E', group: 'Filters', tag: '.tran', signals: ['n1'],
    tranNetlist: `
* Series RLC bandpass — impulse in, voltage across C
V1 in 0 PULSE(0 5 0 1n 1n 1u 100u)
R1 in mid 100
L1 mid n1 10m
C1 n1 0 1u
.tran 1u 2m`,
    acNetlist: `
* Series RLC bandpass — frequency response
V1 in 0 AC 1
R1 in mid 100
L1 mid n1 10m
C1 n1 0 1u
.ac dec 100 10 100k`,
  },
  {
    id: 'sallen-key', name: 'Sallen-Key Low-Pass', desc: '2nd-order, \u201340dB/dec',
    icon: '\u2393', group: 'Filters', tag: '.ac', signals: ['out'],
    acNetlist: `
* Unity-gain Sallen-Key low-pass — VCVS ideal opamp
V1 in 0 AC 1
R1 in n1 10k
R2 n1 n2 10k
C1 n1 out 10n
C2 n2 0 10n
E1 out 0 n2 0 1e6
.ac dec 100 10 1Meg`,
  },
  {
    id: 'cmos-inverter', name: 'CMOS Inverter', desc: 'DC transfer curve',
    icon: '\u23DA', group: 'Non-Linear', tag: '.dc', signals: ['out'],
  },
  {
    id: 'rectifier', name: 'Half-Wave Rectifier', desc: 'Diode clipping',
    icon: '\u23DA', group: 'Non-Linear', tag: '.tran', signals: ['out'],
  },
  {
    id: 'cs-amp', name: 'Common-Source Amp', desc: 'MOSFET gain stage',
    icon: '\u23DA', group: 'Non-Linear', tag: '.ac', signals: ['out'],
  },
  {
    id: 'inv-amp', name: 'Inverting Amplifier', desc: '.step Rf: 1k\u20131 00k',
    icon: '\u25B3', group: 'Opamp Circuits', tag: '.step', signals: ['out'],
  },
  {
    id: 'integrator', name: 'Integrator', desc: 'Square \u2192 triangle',
    icon: '\u25B3', group: 'Opamp Circuits', tag: '.tran', signals: ['out'],
  },
  {
    id: 'rlc-step', name: 'RLC Step Response', desc: '.step R: under/over-damped',
    icon: '\u223F', group: 'Impulse Response', tag: '.step', signals: ['out'],
  },
  {
    id: 'lc-tank', name: 'LC Tank', desc: 'Decaying oscillation',
    icon: '\u223F', group: 'Impulse Response', tag: '.tran', signals: ['out'],
  },
];

// ─── Streaming accumulators ─────────────────────────────────────────

class StepTransientAccumulator {
  private steps = new Map<number, { time: number[]; signals: Map<string, number[]>; label: string }>();
  constructor(private signalNames: string[]) {}

  push(event: StepStreamEvent): void {
    const point = event.point;
    if (!('time' in point)) return;
    if (!this.steps.has(event.stepIndex)) {
      const signals = new Map<string, number[]>();
      for (const name of this.signalNames) signals.set(name, []);
      this.steps.set(event.stepIndex, {
        time: [], signals,
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
    return [...this.steps.entries()].sort(([a], [b]) => a - b)
      .map(([, s]) => ({ time: s.time, signals: s.signals, label: s.label }));
  }
}

class StepACAccumulator {
  private steps = new Map<number, {
    frequencies: number[]; magnitudes: Map<string, number[]>;
    phases: Map<string, number[]>; label: string;
  }>();
  constructor(private signalNames: string[]) {}

  push(event: StepStreamEvent): void {
    const point = event.point;
    if (!('frequency' in point)) return;
    if (!this.steps.has(event.stepIndex)) {
      const magnitudes = new Map<string, number[]>();
      const phases = new Map<string, number[]>();
      for (const name of this.signalNames) { magnitudes.set(name, []); phases.set(name, []); }
      this.steps.set(event.stepIndex, {
        frequencies: [], magnitudes, phases,
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
    return [...this.steps.entries()].sort(([a], [b]) => a - b)
      .map(([, s]) => ({ frequencies: s.frequencies, magnitudes: s.magnitudes, phases: s.phases, label: s.label }));
  }
}

function buildLegendSignals(datasets: { label: string }[], signals: string[], visibility: Record<string, boolean>, palette?: string[]): LegendSignal[] {
  const pal = palette ?? DEFAULT_PALETTE as unknown as string[];
  const result: LegendSignal[] = [];
  let colorIdx = 0;
  for (const ds of datasets) {
    for (const name of signals) {
      const id = ds.label ? `${ds.label}:${name}` : name;
      result.push({ id, label: ds.label ? `${ds.label}: ${name}` : name, color: pal[colorIdx % pal.length], visible: visibility[id] ?? true });
      colorIdx++;
    }
  }
  return result;
}

// ─── SVG icons (inline for zero deps) ───────────────────────────────

const PlayIcon = () => <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5,3 19,12 5,21"/></svg>;
const StopIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>;
const WaveIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h4l3-9 4 18 3-9h6"/></svg>;
const GridIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
const FileIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>;
const GearIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>;
const HelpIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>;

// ─── Konami code hook ───────────────────────────────────────────────

const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];

function useKonamiCode(onActivate: () => void) {
  const pos = useRef(0);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === KONAMI[pos.current]) {
        pos.current++;
        if (pos.current === KONAMI.length) {
          pos.current = 0;
          onActivate();
        }
      } else {
        pos.current = 0;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onActivate]);
}

// ─── App ────────────────────────────────────────────────────────────

function App() {
  const [vaultTec, setVaultTec] = useState(false);
  const [activeCircuit, setActiveCircuit] = useState('rc-lowpass');
  const [activeView, setActiveView] = useState<'tran' | 'ac'>('tran');
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useKonamiCode(useCallback(() => setVaultTec(prev => !prev), []));

  // Apply vault-tec class to body for scanlines/vignette pseudo-elements
  useEffect(() => {
    document.body.classList.toggle('vault-tec', vaultTec);
    if (vaultTec) {
      document.body.classList.add('vault-tec-enter');
      const t = setTimeout(() => document.body.classList.remove('vault-tec-enter'), 600);
      return () => clearTimeout(t);
    }
  }, [vaultTec]);

  // Monochrome CRT colors for vault-tec mode (differentiated by brightness)
  const vaultTecPalette = ['#33ff66', '#22cc44', '#119922'];
  const vaultTecTheme = useMemo(() => vaultTec ? {
    background: '#050a04',
    surface: '#0a1208',
    border: '#1a2816',
    grid: 'rgba(51, 255, 102, 0.05)',
    text: '#33ff66',
    textMuted: '#146628',
    cursor: '#22aa44',
    tooltipBg: '#0a1208',
    tooltipBorder: '#243820',
    font: "'Share Tech Mono', monospace",
    fontSize: 11,
  } : undefined, [vaultTec]);

  // Build color overrides from datasets for vault-tec mode
  const vaultTecColors = useCallback((datasets: { label: string }[] | null, signals: string[]) => {
    if (!vaultTec || !datasets) return undefined;
    const colors: Record<string, string> = {};
    let idx = 0;
    for (const ds of datasets) {
      for (const name of signals) {
        const id = ds.label ? `${ds.label}:${name}` : name;
        colors[id] = vaultTecPalette[idx % vaultTecPalette.length];
        idx++;
      }
    }
    return colors;
  }, [vaultTec]);

  const [tranData, setTranData] = useState<TransientDataset[] | null>(null);
  const [acData, setAcData] = useState<ACDataset[] | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tranCursor, setTranCursor] = useState<CursorState | null>(null);
  const [acCursor, setAcCursor] = useState<CursorState | null>(null);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const stopRef = useRef(false);

  const circuit = CIRCUITS.find(c => c.id === activeCircuit)!;

  const handleRun = useCallback(() => {
    const netlist = activeView === 'tran' ? circuit.tranNetlist : circuit.acNetlist;
    if (!netlist) return;

    if (activeView === 'tran') setTranData(null); else setAcData(null);
    setError(null);
    setRunning(true);
    setElapsed(null);
    setVisibility({});
    stopRef.current = false;

    const t0 = performance.now();

    const run = async () => {
      if (activeView === 'tran') {
        const acc = new StepTransientAccumulator(circuit.signals);
        let dirty = false;
        const raf = () => {
          if (dirty) { dirty = false; setTranData(acc.getDatasets()); }
          if (!stopRef.current) requestAnimationFrame(raf);
        };
        requestAnimationFrame(raf);

        let count = 0;
        for await (const event of simulateStepStream(netlist)) {
          if (stopRef.current) break;
          acc.push(event); dirty = true;
          if (++count % 500 === 0) await new Promise<void>(r => setTimeout(r, 0));
        }
        setTranData(acc.getDatasets());
      } else {
        const acc = new StepACAccumulator(circuit.signals);
        let dirty = false;
        const raf = () => {
          if (dirty) { dirty = false; setAcData(acc.getDatasets()); }
          if (!stopRef.current) requestAnimationFrame(raf);
        };
        requestAnimationFrame(raf);

        let count = 0;
        for await (const event of simulateStepStream(netlist)) {
          if (stopRef.current) break;
          acc.push(event); dirty = true;
          if (++count % 50 === 0) await new Promise<void>(r => setTimeout(r, 0));
        }
        setAcData(acc.getDatasets());
      }

      stopRef.current = true;
      setRunning(false);
      setElapsed(Math.round(performance.now() - t0));
    };

    run().catch((err: unknown) => {
      stopRef.current = true;
      setError(err instanceof Error ? err.message : String(err));
      setRunning(false);
    });
  }, [circuit, activeView]);

  const handleStop = useCallback(() => { stopRef.current = true; }, []);

  const handleToggle = useCallback((signalId: string) => {
    setVisibility(prev => ({ ...prev, [signalId]: !(prev[signalId] ?? true) }));
  }, []);

  const handleSelectCircuit = useCallback((id: string) => {
    const c = CIRCUITS.find(x => x.id === id)!;
    setActiveCircuit(id);
    setActiveView(c.tranNetlist ? 'tran' : 'ac');
    setTranData(null);
    setAcData(null);
    setError(null);
    setElapsed(null);
    setVisibility({});
    stopRef.current = true;
    setRunning(false);
  }, []);

  // Filter and group circuits
  const filteredGroups = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const filtered = q
      ? CIRCUITS.filter(c => c.name.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q) || c.group.toLowerCase().includes(q))
      : CIRCUITS;
    const groups = new Map<string, CircuitDef[]>();
    for (const c of filtered) {
      if (!groups.has(c.group)) groups.set(c.group, []);
      groups.get(c.group)!.push(c);
    }
    return groups;
  }, [searchQuery]);

  const toggleGroup = useCallback((group: string) => {
    setCollapsed(prev => ({ ...prev, [group]: !prev[group] }));
  }, []);

  const hasNetlist = !!(circuit.tranNetlist || circuit.acNetlist);

  return (
    <div className="app">
      {/* ── Top Bar ── */}
      <header className="topbar">
        <div className="topbar-logo">
          <WaveIcon />
          <span>spice-<span className="ts">ts</span></span>
        </div>
      </header>

      {/* ── Icon Rail ── */}
      <nav className="rail">
        <button className="rail-btn active" title="Circuits"><GridIcon /></button>
        <div className="rail-spacer" />
        <button className="rail-btn" title="Help"><HelpIcon /></button>
      </nav>

      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>Circuits</h2>
          <input
            className="sidebar-search"
            type="text"
            placeholder="Search circuits..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="sidebar-list">
          {[...filteredGroups.entries()].map(([groupName, items]) => (
            <div key={groupName} style={{ marginBottom: 4 }}>
              <div
                className="circuit-group-header"
                onClick={() => toggleGroup(groupName)}
              >
                <svg
                  className={`chevron ${collapsed[groupName] ? '' : 'open'}`}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
                <span>{groupName}</span>
                <span className="circuit-group-count">{items.length}</span>
              </div>
              {!collapsed[groupName] && items.map(c => {
                const implemented = !!(c.tranNetlist || c.acNetlist);
                return (
                  <div
                    key={c.id}
                    className={`circuit-item ${c.id === activeCircuit ? 'active' : ''} ${!implemented ? 'disabled' : ''}`}
                    onClick={() => implemented && handleSelectCircuit(c.id)}
                  >
                    <div className="circuit-item-icon">{c.icon}</div>
                    <div>
                      <div className="circuit-item-name">{c.name}</div>
                      <div className="circuit-item-desc">{implemented ? c.desc : 'Coming soon'}</div>
                    </div>
                    {c.tag && <span className="circuit-item-tag">{c.tag}</span>}
                  </div>
                );
              })}
            </div>
          ))}
          {filteredGroups.size === 0 && (
            <div className="sidebar-empty">No circuits match your search</div>
          )}
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div className="main">
        {/* Toolbar */}
        <div className="toolbar">
          <button className="toolbar-btn primary" onClick={handleRun} disabled={running || !hasNetlist}>
            <PlayIcon /> Run
          </button>
          <button className="toolbar-btn" onClick={handleStop} disabled={!running}>
            <StopIcon /> Stop
          </button>
          <div className="toolbar-sep" />
          {circuit.tranNetlist && (
            <button
              className={`toolbar-btn ${activeView === 'tran' ? 'active' : ''}`}
              onClick={() => setActiveView('tran')}
            >Transient</button>
          )}
          {circuit.acNetlist && (
            <button
              className={`toolbar-btn ${activeView === 'ac' ? 'active' : ''}`}
              onClick={() => setActiveView('ac')}
            >AC Sweep</button>
          )}
          <div className="toolbar-info">
            {elapsed !== null && (
              <span>Elapsed: <span className="value">{elapsed}ms</span></span>
            )}
          </div>
        </div>

        {/* Panels */}
        <div className="panels">
          {error && <div className="panel"><div className="panel-error">Simulation error: {error}</div></div>}

          {!hasNetlist && (
            <div className="panel">
              <div className="panel-placeholder">
                Circuit not yet implemented &mdash; coming soon
              </div>
            </div>
          )}

          {/* Transient panel */}
          {activeView === 'tran' && circuit.tranNetlist && (
            <div className="panel">
              <div className="panel-header">
                <h3>Transient &mdash; V({circuit.signals[0]})</h3>
                {circuit.tag === '.step' && <span className="panel-badge">.step</span>}
              </div>
              <div className="panel-body">
                {!tranData && !running && (
                  <div className="panel-placeholder">Press Run to simulate</div>
                )}
                {!tranData && running && (
                  <div className="panel-placeholder">Simulating transient...</div>
                )}
                {tranData && (
                  <div style={{ position: 'relative' }}>
                    <TransientPlot
                      data={tranData}
                      signals={circuit.signals}
                      theme={vaultTecTheme ?? 'dark'}
                      colors={vaultTecColors(tranData, circuit.signals)}
                      height={280}
                      xDomain={[0, 10e-3]}
                      onCursorMove={setTranCursor}
                      signalVisibility={visibility}
                    />
                    <Legend
                      signals={buildLegendSignals(tranData, circuit.signals, visibility, vaultTec ? vaultTecPalette : undefined)}
                      onToggle={handleToggle}
                    />
                    <CursorTooltip cursor={tranCursor} theme={vaultTecTheme ?? DARK_THEME} formatX={formatTime} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AC panel */}
          {activeView === 'ac' && circuit.acNetlist && (
            <div className="panel">
              <div className="panel-header">
                <h3>AC &mdash; V({circuit.signals[0]})</h3>
                {circuit.tag === '.step' && <span className="panel-badge">.step</span>}
              </div>
              <div className="panel-body">
                {!acData && !running && (
                  <div className="panel-placeholder">Press Run to simulate</div>
                )}
                {!acData && running && (
                  <div className="panel-placeholder">Simulating AC...</div>
                )}
                {acData && (
                  <div style={{ position: 'relative' }}>
                    <BodePlot
                      data={acData}
                      signals={circuit.signals}
                      theme={vaultTecTheme ?? 'dark'}
                      colors={vaultTecColors(acData, circuit.signals)}
                      height={200}
                      xDomain={[1, 10e6]}
                      onCursorMove={setAcCursor}
                      signalVisibility={visibility}
                    />
                    <Legend
                      signals={buildLegendSignals(acData, circuit.signals, visibility, vaultTec ? vaultTecPalette : undefined)}
                      onToggle={handleToggle}
                    />
                    <CursorTooltip cursor={acCursor} theme={vaultTecTheme ?? DARK_THEME} formatX={formatFrequency} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Status Bar */}
        <div className="statusbar">
          <span>spice-ts v0.2.1</span>
          <span className="sep" />
          <span>Browser Runtime</span>
          <span className="sep" />
          {elapsed !== null ? (
            <span className="ok">Simulation complete &mdash; {elapsed}ms</span>
          ) : running ? (
            <span>Simulating...</span>
          ) : (
            <span>Ready</span>
          )}
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
