import { createRoot } from 'react-dom/client';
import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { simulateStepStream, simulate, parse } from '@spice-ts/core';
import type { StepStreamEvent, DCSweepResult, IntegrationMethod } from '@spice-ts/core';
import { TransientPlot, BodePlot, DCSweepPlot, CursorTooltip, Legend, SchematicView } from '@spice-ts/ui/react';
import type { LegendSignal } from '@spice-ts/ui/react';
import { DARK_THEME, formatTime, formatFrequency, formatVoltage, formatSI, DEFAULT_PALETTE } from '@spice-ts/ui';
import type { TransientDataset, ACDataset, DCSweepDataset, CursorState } from '@spice-ts/ui';
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
  integrationMethod?: IntegrationMethod;
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
E1 out 0 n2 out 1e6
.ac dec 100 10 1Meg`,
  },
  {
    id: 'cmos-inverter', name: 'CMOS Inverter', desc: 'DC transfer curve',
    icon: '\u23DA', group: 'Non-Linear', tag: '.dc', signals: ['out'],
    xLabel: 'Vin (V)',
    dcNetlist: `
* CMOS inverter DC transfer curve — BSIM3v3 (Level 49)
VDD vdd 0 DC 1.8
VIN in 0 DC 0
.model NMOD NMOS (LEVEL=49 VTH0=0.5 U0=400 TOX=4n)
.model PMOD PMOS (LEVEL=49 VTH0=-0.5 U0=150 TOX=4n)
MP out in vdd vdd PMOD W=20u L=0.18u
MN out in 0   0  NMOD W=10u L=0.18u
.dc VIN 0 1.8 0.01`,
  },
  {
    id: 'rectifier', name: 'Half-Wave Rectifier', desc: 'Diode clipping',
    icon: '\u23DA', group: 'Non-Linear', tag: '.tran', signals: ['in', 'out'],
    tranNetlist: `
* Half-wave rectifier — sine in, rectified out
V1 in 0 SIN(0 5 1k)
Rs in anode 10
D1 anode out DMOD
Rl out 0 10k
Cl out 0 10u
.model DMOD D(IS=1e-14 N=1)
.tran 1u 4m`,
  },
  {
    id: 'cs-amp', name: 'Common-Source Amp', desc: 'MOSFET gain stage',
    icon: '\u23DA', group: 'Non-Linear', tag: '.ac', signals: ['out'],
    acNetlist: `
* NMOS common-source amplifier — Bode plot
VDD vdd 0 DC 5
VGS in 0 DC 1.5 AC 1
.model NMOD NMOS(VTO=1 KP=1e-4)
M1 out in 0 0 NMOD W=100u L=1u
RD vdd out 10k
.ac dec 100 1 10Meg`,
  },
  {
    id: 'inv-amp', name: 'Inverting Amplifier', desc: '.step Rf: 1k\u20131 00k',
    icon: '\u25B3', group: 'Opamp Circuits', tag: '.step', signals: ['out'],
    tranNetlist: `
* Inverting opamp amplifier — VCVS model, sweep Rf
V1 in 0 PULSE(0 0.1 0 1u 1u 5m 10m)
Rin in nm 1k
Rf nm out 10k
E1 out 0 0 nm 1e6
.step param Rf list 1k 10k 100k
.tran 10u 20m`,
  },
  {
    id: 'integrator', name: 'Integrator', desc: 'Square \u2192 triangle',
    icon: '\u25B3', group: 'Opamp Circuits', tag: '.tran', signals: ['in', 'out'],
    tranNetlist: `
* Opamp integrator — square wave in, triangle wave out
V1 in 0 PULSE(-1 1 0 1n 1n 5m 10m)
Rin in nm 10k
Cf nm out 100n
E1 out 0 0 nm 1e6
.tran 10u 20m`,
  },
  {
    id: 'rlc-step', name: 'RLC Step Response', desc: '.step R: under/over-damped',
    icon: '\u223F', group: 'Impulse Response', tag: '.step', signals: ['n1'],
    tranNetlist: `
* RLC step response — three damping regimes
V1 in 0 PULSE(0 5 0 1n 1n 50m 100m)
R1 in mid 10
L1 mid n1 10m
C1 n1 0 100u
.step param R1 list 10 200 1k
.tran 10u 10m`,
  },
  {
    id: 'lc-tank', name: 'LC Tank', desc: 'Decaying oscillation',
    icon: '\u223F', group: 'Impulse Response', tag: '.tran', signals: ['out'],
    tranNetlist: `
* LC tank — lightly-damped oscillation, f0 \u2248 15.9 kHz
V1 in 0 PULSE(0 5 0 1n 1n 5u 200u)
Rs in n1 10
L1 n1 out 10m
C1 out 0 10n
.tran 100n 200u`,
  },
  {
    integrationMethod: 'gear2',
    id: 'buck', name: 'Buck Converter', desc: '12V \u2192 ~6V, 50% duty',
    icon: '\u26A1', group: 'Power Electronics', tag: '.tran', signals: ['out'],
    tranNetlist: `
* Buck converter — NMOS switch + freewheeling diode + LC filter
* Vin=12V, D=50%, f=100kHz, Vout~6V
Vin in 0 DC 12
Vg gate 0 PULSE(0 15 0 100n 100n 4.8u 10u)
.model NMOD NMOS(VTO=2 KP=10)
.model DMOD D(IS=1e-14 N=1)
M1 sw gate in 0 NMOD W=1m L=1u
D1 0 sw DMOD
L1 sw out 100u
C1 out 0 100u
Rload out 0 10
.tran 50n 500u`,
  },
  {
    integrationMethod: 'gear2',
    id: 'boost', name: 'Boost Converter', desc: '5V \u2192 ~10V, 50% duty',
    icon: '\u26A1', group: 'Power Electronics', tag: '.tran', signals: ['out'],
    tranNetlist: `
* Boost converter — inductor charges from Vin, discharges through D to Cout
* Vin=5V, D=50%, f=100kHz, Vout~10V
Vin in 0 DC 5
Vg gate 0 PULSE(0 15 0 100n 100n 4.8u 10u)
.model NMOD NMOS(VTO=2 KP=10)
.model DMOD D(IS=1e-14 N=1)
L1 in sw 100u
M1 sw gate 0 0 NMOD W=1m L=1u
D1 sw out DMOD
C1 out 0 100u
Rload out 0 10
.tran 50n 500u`,
  },
  {
    integrationMethod: 'gear2',
    id: 'buck-boost', name: 'Buck-Boost Converter', desc: '12V \u2192 \u2013Vout (inverting)',
    icon: '\u26A1', group: 'Power Electronics', tag: '.tran', signals: ['neg'],
    tranNetlist: `
* Buck-boost (inverting) — neg node is the negative output rail
* Vin=12V, D=50%, f=100kHz
Vin in 0 DC 12
Vg gate 0 PULSE(0 15 0 100n 100n 4.8u 10u)
.model NMOD NMOS(VTO=2 KP=10)
.model DMOD D(IS=1e-14 N=1)
M1 in gate sw 0 NMOD W=1m L=1u
L1 sw n1 100u
D1 n1 0 DMOD
C1 n1 neg 100u
Rload neg 0 10
.tran 50n 500u`,
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
        label: event.paramName ? `${event.paramName}=${formatSI(event.paramValue)}\u03A9` : '',
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
        label: event.paramName ? `${event.paramName}=${formatSI(event.paramValue)}\u03A9` : '',
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

function buildDCSweepDatasets(result: DCSweepResult, signals: string[]): DCSweepDataset[] {
  const sweepValues = Array.from(result.sweepValues);
  const signalsMap = new Map<string, number[]>();
  for (const name of signals) {
    try {
      signalsMap.set(name, Array.from(result.voltage(name)));
    } catch {
      try {
        signalsMap.set(name, Array.from(result.current(name)));
      } catch {
        signalsMap.set(name, new Array(sweepValues.length).fill(0));
      }
    }
  }
  return [{ sweepValues, signals: signalsMap, label: '' }];
}

// ─── Simulation parameter helpers ───────────────────────────────────

function parseTranParams(netlist: string): { stop: string; step: string } {
  const m = netlist.match(/\.tran\s+(\S+)\s+(\S+)/i);
  return m ? { step: m[1], stop: m[2] } : { step: '0.1u', stop: '10m' };
}

function injectTranParams(netlist: string, step: string, stop: string): string {
  return netlist.replace(/\.tran\s+\S+\s+\S+([^\n]*)/i, `.tran ${step} ${stop}$1`);
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

// ─── Netlist syntax highlighting ────────────────────────────────────

const DEVICE_PREFIXES = ['V','R','C','L','M','D','E','F','G','H','Q','I','B'];

function NetlistLine({ line }: { line: string }) {
  const trimmed = line.trim();
  if (!trimmed) return <div style={{ height: '1em' }} />;
  if (trimmed.startsWith('*')) {
    return <div><span className="nl-comment">{trimmed}</span></div>;
  }
  const tokens = trimmed.split(/\s+/);
  const first = tokens[0];
  const upper = first.toUpperCase();

  if (upper === '.STEP' || upper === '.MODEL') {
    return <div><span className="nl-directive">{trimmed}</span></div>;
  }
  if (upper.startsWith('.')) {
    return <div><span className="nl-keyword">{trimmed}</span></div>;
  }
  if (DEVICE_PREFIXES.some(p => upper.startsWith(p))) {
    const ref = tokens[0];
    const rest = tokens.slice(1);
    if (rest.length === 0) return <div><span className="nl-ref">{ref}</span></div>;
    const value = rest[rest.length - 1];
    const nodes = rest.slice(0, -1);
    return (
      <div>
        <span className="nl-ref">{ref}</span>{' '}
        <span className="nl-node">{nodes.join(' ')}</span>{' '}
        <span className="nl-value">{value}</span>
      </div>
    );
  }
  return <div><span className="nl-muted">{trimmed}</span></div>;
}

function NetlistView({ netlist }: { netlist: string }) {
  const lines = netlist.split('\n');
  return (
    <pre className="netlist-view">
      {lines.map((line, i) => <NetlistLine key={i} line={line} />)}
    </pre>
  );
}

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
  const [activeView, setActiveView] = useState<'tran' | 'ac' | 'dc'>('tran');
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [tranStop, setTranStop] = useState(() => parseTranParams(CIRCUITS[0].tranNetlist!).stop);
  const [tranStep, setTranStep] = useState(() => parseTranParams(CIRCUITS[0].tranNetlist!).step);
  const [editedNetlist, setEditedNetlist] = useState<string>(() => (CIRCUITS[0].tranNetlist ?? '').trim());
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
  const [dcData, setDcData] = useState<DCSweepDataset[] | null>(null);
  const [dcCursor, setDcCursor] = useState<CursorState | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tranCursor, setTranCursor] = useState<CursorState | null>(null);
  const [acCursor, setAcCursor] = useState<CursorState | null>(null);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const stopRef = useRef(false);

  const circuit = CIRCUITS.find(c => c.id === activeCircuit)!;

  const handleRun = useCallback(() => {
    // DC sweep path — synchronous simulate(), no streaming
    if (activeView === 'dc') {
      if (!editedNetlist) return;
      setDcData(null);
      setError(null);
      setRunning(true);
      setElapsed(null);
      setVisibility({});
      stopRef.current = false;
      const t0 = performance.now();
      simulate(editedNetlist)
        .then(result => {
          if (stopRef.current) return;
          if (!result.dcSweep) { setError('No DC sweep result'); setRunning(false); return; }
          setDcData(buildDCSweepDatasets(result.dcSweep, circuit.signals));
          setRunning(false);
          setElapsed(Math.round(performance.now() - t0));
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : String(err));
          setRunning(false);
        });
      return;
    }

    if (!editedNetlist) return;
    const netlist = activeView === 'tran'
      ? injectTranParams(editedNetlist, tranStep, tranStop)
      : editedNetlist;

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
        for await (const event of simulateStepStream(netlist, { integrationMethod: circuit.integrationMethod })) {
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
        for await (const event of simulateStepStream(netlist, { integrationMethod: circuit.integrationMethod })) {
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
  }, [circuit, activeView, tranStop, tranStep, editedNetlist]);

  const handleStop = useCallback(() => { stopRef.current = true; }, []);

  const handleToggle = useCallback((signalId: string) => {
    setVisibility(prev => ({ ...prev, [signalId]: !(prev[signalId] ?? true) }));
  }, []);

  const handleSelectCircuit = useCallback((id: string) => {
    const c = CIRCUITS.find(x => x.id === id)!;
    const defaultView = c.tranNetlist ? 'tran' : c.acNetlist ? 'ac' : 'dc';
    setActiveCircuit(id);
    setActiveView(defaultView);
    if (c.tranNetlist) {
      const p = parseTranParams(c.tranNetlist);
      setTranStop(p.stop);
      setTranStep(p.step);
    }
    const nl = defaultView === 'dc' ? c.dcNetlist : defaultView === 'ac' ? c.acNetlist : c.tranNetlist;
    setEditedNetlist((nl ?? '').trim());
    setTranData(null);
    setAcData(null);
    setDcData(null);
    setTranCursor(null);
    setAcCursor(null);
    setDcCursor(null);
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

  const hasNetlist = !!(circuit.tranNetlist || circuit.acNetlist || circuit.dcNetlist);
  const diagramNetlist = activeView === 'dc' ? circuit.dcNetlist
    : activeView === 'ac' ? circuit.acNetlist
    : circuit.tranNetlist;

  const diagramCircuit = useMemo(() => {
    if (!diagramNetlist) return null;
    try {
      return parse(diagramNetlist).toIR();
    } catch {
      return null;
    }
  }, [diagramNetlist]);

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
                const implemented = !!(c.tranNetlist || c.acNetlist || c.dcNetlist);
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
              onClick={() => { setActiveView('tran'); setEditedNetlist((circuit.tranNetlist ?? '').trim()); }}
            >Transient</button>
          )}
          {circuit.acNetlist && (
            <button
              className={`toolbar-btn ${activeView === 'ac' ? 'active' : ''}`}
              onClick={() => { setActiveView('ac'); setEditedNetlist((circuit.acNetlist ?? '').trim()); }}
            >AC Sweep</button>
          )}
          {circuit.dcNetlist && (
            <button
              className={`toolbar-btn ${activeView === 'dc' ? 'active' : ''}`}
              onClick={() => { setActiveView('dc'); setEditedNetlist((circuit.dcNetlist ?? '').trim()); }}
            >DC Sweep</button>
          )}
          {activeView === 'tran' && circuit.tranNetlist && (
            <>
              <div className="toolbar-sep" />
              <label className="param-label">Stop</label>
              <input
                className="param-input"
                value={tranStop}
                onChange={e => setTranStop(e.target.value)}
                disabled={running}
                title="Total simulation time (e.g. 10m, 200u)"
              />
              <label className="param-label">Step</label>
              <input
                className="param-input"
                value={tranStep}
                onChange={e => setTranStep(e.target.value)}
                disabled={running}
                title="Maximum timestep (e.g. 0.1u, 1n)"
              />
            </>
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

          {/* Netlist + Schematic panel */}
          {diagramNetlist && (
            <div className="panel">
              <div className="panel-header">
                <span className="netlist-panel-label">Netlist</span>
                <span className="netlist-panel-name">{circuit.name}</span>
                {circuit.tag && <span className="panel-badge">{circuit.tag}</span>}
              </div>
              <div className="netlist-schematic-split">
                <div className="netlist-panel-body">
                  <NetlistView netlist={diagramNetlist} />
                </div>
                {diagramCircuit && (
                  <div className="schematic-split-pane">
                    <SchematicView
                      circuit={diagramCircuit}
                      theme={vaultTecTheme ?? 'dark'}
                      height={250}
                    />
                  </div>
                )}
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

          {/* DC sweep panel */}
          {activeView === 'dc' && circuit.dcNetlist && (
            <div className="panel">
              <div className="panel-header">
                <h3>DC Sweep &mdash; V({circuit.signals[0]})</h3>
                <span className="panel-badge">.dc</span>
              </div>
              <div className="panel-body">
                {!dcData && !running && (
                  <div className="panel-placeholder">Press Run to simulate</div>
                )}
                {!dcData && running && (
                  <div className="panel-placeholder">Simulating DC sweep...</div>
                )}
                {dcData && (
                  <div style={{ position: 'relative' }}>
                    <DCSweepPlot
                      data={dcData}
                      signals={circuit.signals}
                      theme={vaultTecTheme ?? 'dark'}
                      colors={vaultTecColors(dcData, circuit.signals)}
                      height={280}
                      xLabel={circuit.xLabel ?? 'Sweep (V)'}
                      onCursorMove={setDcCursor}
                      signalVisibility={visibility}
                    />
                    <Legend
                      signals={buildLegendSignals(dcData, circuit.signals, visibility, vaultTec ? vaultTecPalette : undefined)}
                      onToggle={handleToggle}
                    />
                    <CursorTooltip cursor={dcCursor} theme={vaultTecTheme ?? DARK_THEME} formatX={v => `${formatVoltage(v)}`} />
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
