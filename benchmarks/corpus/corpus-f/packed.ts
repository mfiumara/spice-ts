/**
 * Packed executions for corpus-f's runner (#839).
 *
 * One `{ re, im }` object per sample costs about 57 bytes of V8 heap; a 1e6-point transient with
 * 47 signals (corpus-i VACASK bjtring) needs 2.7 GB per engine that way, past Node's default
 * 4 GB heap once the simulator's own result or the other engine's reference is alive too. The
 * runner therefore keeps both engines' samples in Float64Arrays (off the V8 heap) and hands the
 * unchanged metric (`compareExecutions`, `normalizedSignalErrors`) ComplexValue arrays for a
 * bounded batch of signals at a time. Every signal is scored exactly as before: the metric is per
 * signal, so splitting the signal list changes no value and no order.
 */
import { getHeapStatistics } from 'node:v8';
import { compareExecutions, type ComparisonReceipt } from '../../aggregate-report.js';
import type { ComparisonMetrics, ComplexValue } from '../../comparison-harness.js';
import {
  type EncodedAnalysis,
  type EncodedExecution,
  encodeAnalysis,
  type EngineAnalysis,
  type EngineExecution,
  type SampleEncoding,
} from '../classic/report.js';
import type { PackedColumn } from './raw-stream.js';
import { pairPlots } from '../../plot-pairing.js';

/** One signal's samples; a real waveform from spice-ts carries no `im` (every imaginary part is +0). */
export type PackedSignal = PackedColumn | { re: Float64Array; im?: undefined };

export interface PackedAnalysis {
  type: EngineAnalysis['type'];
  plotName: string;
  plotId?: string;
  grid: Float64Array;
  secondaryGrid?: Float64Array;
  signals: Record<string, PackedSignal>;
}

export interface PackedExecution extends Omit<EngineExecution, 'analyses'> {
  analyses: PackedAnalysis[];
}

/** Sample encoding for the spice-ts adapter that never builds a per-sample object. */
export const PACKED_SAMPLES: SampleEncoding<PackedSignal> = {
  real(values) {
    return { re: Float64Array.from(values) };
  },
  complex(values) {
    return { re: Float64Array.from(values, value => value.re), im: Float64Array.from(values, value => value.im) };
  },
};

export function packEncoded(execution: EncodedExecution<PackedSignal>): PackedExecution {
  return {
    ...execution,
    analyses: execution.analyses.map((analysis: EncodedAnalysis<PackedSignal>) => ({
      type: analysis.type,
      plotName: analysis.plotName,
      grid: Float64Array.from(analysis.series.grid),
      ...(analysis.series.secondaryGrid ? { secondaryGrid: Float64Array.from(analysis.series.secondaryGrid) } : {}),
      ...(analysis.plotId === undefined ? {} : { plotId: analysis.plotId }),
      signals: analysis.series.signals,
    })),
  };
}

/** Typed-array form of an execution; values (including -0 and NaN) are kept bit-for-bit. */
export function packExecution(execution: EngineExecution): PackedExecution {
  return packEncoded({ ...execution, analyses: execution.analyses.map(analysis => encodeAnalysis(analysis, PACKED_SAMPLES)) });
}

/** An execution in either form, as packed. */
export function asPacked(execution: EngineExecution | PackedExecution): PackedExecution {
  return {
    ...execution,
    analyses: execution.analyses.map(analysis => ('series' in analysis
      ? packEncoded({ status: 'success', convergence: 'converged', analyses: [encodeAnalysis(analysis, PACKED_SAMPLES)] }).analyses[0]
      : analysis)),
  };
}

export function samples(signal: PackedSignal): ComplexValue[] {
  const { im } = signal;
  return im === undefined ? Array.from(signal.re, re => ({ re, im: 0 })) : Array.from(signal.re, (re, index) => ({ re, im: im[index] }));
}

/** One analysis with per-sample objects, restricted to `names` when given. */
export function unpackAnalysis(analysis: PackedAnalysis, names?: ReadonlySet<string>): EngineAnalysis {
  return {
    type: analysis.type,
    ...(analysis.plotId === undefined ? {} : { plotId: analysis.plotId }),
    plotName: analysis.plotName,
    series: {
      grid: Array.from(analysis.grid),
      ...(analysis.secondaryGrid ? { secondaryGrid: Array.from(analysis.secondaryGrid) } : {}),
      signals: Object.fromEntries(Object.entries(analysis.signals)
        .filter(([name]) => names === undefined || names.has(name))
        .map(([name, signal]) => [name, samples(signal)])),
    },
  };
}

export function unpackExecution(packed: PackedExecution): EngineExecution {
  return { ...packed, analyses: packed.analyses.map(analysis => unpackAnalysis(analysis)) };
}

/**
 * `EngineExecution`-shaped view that builds a signal's samples only when that signal is read
 * (a fresh array per read; nothing is cached). Listing signal names materialises nothing. For
 * consumers that read one signal at a time, such as `pairedReferenceSeries` with
 * `normalizedSignalErrors`.
 */
export function lazyExecution(packed: PackedExecution): EngineExecution {
  return {
    ...packed,
    analyses: packed.analyses.map(analysis => {
      const signals: Record<string, ComplexValue[]> = {};
      for (const [name, signal] of Object.entries(analysis.signals)) {
        Object.defineProperty(signals, name, { enumerable: true, get: () => samples(signal) });
      }
      return {
        type: analysis.type,
        plotName: analysis.plotName,
        series: { get grid() { return Array.from(analysis.grid); }, signals, ...(analysis.secondaryGrid ? { secondaryGrid: Array.from(analysis.secondaryGrid) } : {}) },
        ...(analysis.plotId === undefined ? {} : { plotId: analysis.plotId }),
      };
    }),
  };
}

/** Heap per materialised sample: a `{ re, im }` object and its array slot (about 57 B measured on Node 22). */
const BYTES_PER_SAMPLE = 64;

/**
 * Samples (spice-ts plus ngspice) materialised per comparison batch: one eighth of this process's
 * V8 heap limit, about 8.5M samples at Node 22's default 4 GB. The batch size changes no result.
 */
export function defaultBatchSamples(): number {
  return Math.max(1, Math.floor(getHeapStatistics().heap_size_limit / 8 / BYTES_PER_SAMPLE));
}

function mergeMetrics(first: ComparisonMetrics, next: ComparisonMetrics): ComparisonMetrics {
  return { ...first, signals: { ...first.signals, ...next.signals } };
}

/**
 * `compareExecutions` on packed executions, materialising per-sample objects for at most
 * `budget` samples at a time. Each spice-ts analysis's signals are taken in the metric's own
 * sorted order and split into contiguous batches; the receipts of one analysis are concatenated
 * back in that order, so the result is identical to one `compareExecutions` call.
 */
export function compareInBatches(spiceTs: PackedExecution, ngspice: PackedExecution, budget = defaultBatchSamples()): ComparisonReceipt[] {
  const receipts: ComparisonReceipt[] = [];
  for (const pair of pairPlots(spiceTs.analyses, ngspice.analyses)) {
    const analysis = (pair.left ?? pair.right)!;
    const common = pair.left && pair.right ? Object.keys(pair.left.signals).filter(name => pair.right!.signals[name] !== undefined) : [];
    // Choose coverage before batching, so disjoint plots retain both sides' names
    // without inventing missing signals in batches of a partially shared plot.
    const names = (common.length ? common : [...new Set([...Object.keys(pair.left?.signals ?? {}), ...Object.keys(pair.right?.signals ?? {})])]).sort();
    const referencePoints = pair.right?.grid.length ?? 0;
    const perBatch = Math.max(1, Math.floor(budget / Math.max(1, analysis.grid.length + referencePoints)));
    let merged: ComparisonReceipt | undefined;
    for (let start = 0; start < Math.max(1, names.length); start += perBatch) {
      const batch = new Set(names.slice(start, start + perBatch));
      const [receipt] = compareExecutions(
        { status: 'success', convergence: 'converged', analyses: pair.left ? [unpackAnalysis(pair.left, batch)] : [] },
        { status: 'success', convergence: 'converged', analyses: pair.right ? [unpackAnalysis(pair.right, batch)] : [] },
      );
      if (!receipt) continue;
      merged = merged === undefined ? receipt : {
        ...merged,
        signals: [...merged.signals, ...receipt.signals],
        metrics: mergeMetrics(merged.metrics, receipt.metrics),
        linearMetrics: mergeMetrics(merged.linearMetrics, receipt.linearMetrics),
      };
    }
    if (merged) {
      if (merged.plot || spiceTs.analyses.filter(a => a.type === analysis.type).length > 1) merged.plot = { spiceTs: pair.left?.plotId ?? pair.left?.plotName, ngspice: pair.right?.plotId ?? pair.right?.plotName, ...(pair.right ? { ngspiceIndex: ngspice.analyses.indexOf(pair.right) } : {}) };
      const { analysis: type, plot, ...rest } = merged;
      receipts.push({ analysis: type, ...(plot ? { plot } : {}), ...rest });
    }
  }
  // compareExecutions' own order: spice-ts analysis order, then a stable sort by analysis type.
  return receipts.sort((a, b) => a.analysis.localeCompare(b.analysis));
}
