/**
 * spice-ts side of the corpus-f plot types beyond the shared adapter (#694): S-parameter and
 * sensitivity results, named as ngspice-47 writes them to a raw file. Decks without such a plot
 * type go through `runNativeSpiceTs` unchanged.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ComplexValue, SampleSeries } from '../../comparison-harness.js';
import { type ClassicCircuit, type EngineAnalysis, type EngineExecution, runNativeSpiceTs } from '../classic/report.js';
import { type ControlPlotType, isControlPlotType } from './lib.js';

interface CoreComplex { real: number; imaginary: number }
interface SParameters { frequencies: number[]; vectors: Map<string, CoreComplex[]> }
interface SensitivityEntry {
  device: string;
  parameter:
    | 'resistance' | 'capacitance' | 'inductance' | 'dc' | 'acMagnitude' | 'gain'
    | 'multiplier' | 'scale';
  dc?: number;
  ac?: CoreComplex[];
}
interface Sensitivity { mode: 'dc' | 'ac'; frequencies: number[]; entries: SensitivityEntry[] }
interface CoreResult {
  sParameters?: SParameters;
  sensitivity?: Sensitivity;
  control?: { runs: Array<{ plot: string; analysis: string; result: CoreResult }> };
}

const complex = (values: readonly CoreComplex[]): ComplexValue[] => values.map(value => ({ re: value.real, im: value.imaginary }));

/**
 * ngspice raw name of an S-parameter vector: `s_1_1`, `y_..`, `z_..`, `nf`, `sopt`, `nfmin`, `rn`;
 * noise correlation `Cy_i_j` is a current-typed vector, which `write` names `i(cy_i_j)`.
 * Same mapping as benchmarks/rf-port-sp/compare.ts (verified against ngspice-47 there).
 */
export function sParameterSignalName(name: string): string {
  const lower = name.toLowerCase();
  return /^cy_\d+_\d+$/.test(lower) ? `i(${lower})` : lower;
}

/**
 * ngspice raw name of a sensitivity vector. Sensitivities carry the output's unit (volts), so
 * `write` names them `v(<name>)`. Same mapping as benchmarks/sensitivity/compare.ts (verified
 * against ngspice-47 there).
 */
export function sensitivitySignalName(entry: Pick<SensitivityEntry, 'device' | 'parameter'>, mode: 'dc' | 'ac'): string {
  const device = entry.device.toLowerCase();
  switch (entry.parameter) {
    case 'resistance': return mode === 'ac' ? `v(${device}_ac)` : `v(${device})`;
    case 'gain': return `v(${device}_gain)`;
    case 'acMagnitude': return `v(${device}_acmag)`;
    case 'multiplier': return `v(${device}_m)`;
    case 'scale': return `v(${device}_scale)`;
    default: return `v(${device})`;
  }
}

export function sParameterSeries(sp: SParameters): SampleSeries {
  return {
    grid: [...sp.frequencies],
    signals: Object.fromEntries([...sp.vectors].map(([name, values]) => [sParameterSignalName(name), complex(values)])),
  };
}

export function sensitivitySeries(sens: Sensitivity): SampleSeries {
  return {
    // ngspice's DC sensitivity plot has no scale vector: the grid is the point index.
    grid: sens.mode === 'ac' ? [...sens.frequencies] : [0],
    signals: Object.fromEntries(sens.entries.map(entry => [
      sensitivitySignalName(entry, sens.mode),
      entry.dc !== undefined ? [{ re: entry.dc, im: 0 }] : complex(entry.ac ?? []),
    ])),
  };
}

/**
 * The first plot of a type, as the ngspice wrapper exports `setplot <type>1`: the first control
 * run of that analysis when the deck ran one from `.control`, else the deck's dot-card result.
 */
export function controlPlotAnalyses(result: CoreResult, types: readonly ControlPlotType[]): EngineAnalysis[] {
  const analyses: EngineAnalysis[] = [];
  for (const type of types) {
    const field = type === 'sp' ? 'sParameters' : 'sensitivity';
    const run = result.control?.runs.find(candidate => candidate.result[field] !== undefined)?.result ?? result;
    // The shared adapter's type union predates these plots; compareExecutions only reads it as a key.
    const engineType = type as unknown as EngineAnalysis['type'];
    if (type === 'sp' && run.sParameters) {
      analyses.push({ type: engineType, plotName: 'SP Analysis', series: sParameterSeries(run.sParameters) });
    } else if (type === 'sens' && run.sensitivity) {
      analyses.push({ type: engineType, plotName: 'Sensitivity Analysis', series: sensitivitySeries(run.sensitivity) });
    }
  }
  return analyses;
}

/** Same classification as the shared adapter's catch block (classic/report.ts runNativeSpiceTs). */
function failedExecution(error: unknown): EngineExecution {
  const message = error instanceof Error ? error.message : String(error);
  return {
    status: /unsupported|unknown|parse|expected|invalid/i.test(message) ? 'unsupported' : 'failed',
    convergence: /converg|singular|timestep/i.test(message) ? 'failed' : 'not-run',
    analyses: [],
    error: message.trim().replaceAll(/\s+/g, ' ').slice(0, 1000),
  };
}

/**
 * corpus-f's spice-ts adapter: the shared adapter for op/dc/ac/tran/pz/noise/disto, plus `sp` and
 * `sens` plots. A deck declaring both kinds is simulated by the shared adapter first; only if that
 * succeeds is it simulated once more for the extra plots (same bytes, same `simulate()` call).
 */
export async function runCorpusFSpiceTs(input: Buffer, circuit: ClassicCircuit): Promise<EngineExecution> {
  const extra = (circuit.analyses as readonly string[]).filter(isControlPlotType);
  if (extra.length === 0) return runNativeSpiceTs(input, circuit, { parseFirst: false });
  const classic = circuit.analyses.filter(type => !isControlPlotType(type));
  const base = classic.length > 0 ? await runNativeSpiceTs(input, { ...circuit, analyses: classic }, { parseFirst: false }) : undefined;
  if (base && base.status !== 'success') return base;
  const text = input.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(input)) {
    return { status: 'unsupported', convergence: 'not-run', analyses: [], error: 'fixture is not lossless UTF-8 and cannot be supplied to the spice-ts string API' };
  }
  let result: CoreResult;
  try {
    const core = await import(pathToFileURL(resolve('packages/core/dist/index.js')).href) as { simulate(text: string): Promise<CoreResult> };
    result = await core.simulate(text);
  } catch (error) {
    return failedExecution(error);
  }
  const analyses = [...base?.analyses ?? [], ...controlPlotAnalyses(result, extra)];
  const missing = circuit.analyses.filter(type => !analyses.some(analysis => analysis.type === type));
  if (missing.length > 0) {
    return { status: 'unsupported', convergence: analyses.length > 0 ? 'converged' : 'not-run', analyses, error: `no spice-ts result for analyses: ${missing.join(', ')}` };
  }
  return { status: 'success', convergence: 'converged', analyses };
}
