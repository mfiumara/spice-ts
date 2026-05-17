import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { simulate } from '@spice-ts/core';
import type { SimulationOptions, SimulationResult, StepResult } from '@spice-ts/core';

type ShowcaseKind = 'tran' | 'ac' | 'dc';

interface ShowcaseCase {
  id: string;
  name: string;
  kind: ShowcaseKind;
  netlist: string;
  signals: string[];
  options?: SimulationOptions;
}

interface Series {
  xs: number[];
  ys: number[];
}

interface Tolerance {
  maxAbs: number;
  rms: number;
}

async function loadShowcaseCases(): Promise<ShowcaseCase[]> {
  const source = await readFile(fileURLToPath(new URL('./main.tsx', import.meta.url)), 'utf8');
  const circuitsStart = source.indexOf('const CIRCUITS: CircuitDef[] = [');
  const circuitsEnd = source.indexOf('\n];', circuitsStart);
  const body = source.slice(circuitsStart, circuitsEnd + 3);
  const blockRe = /\n  \{[\s\S]*?\n  \},(?=\n  \{|\n];)/g;
  const cases: ShowcaseCase[] = [];

  for (const [block] of body.matchAll(blockRe)) {
    const id = block.match(/id:\s*'([^']+)'/)?.[1];
    const name = block.match(/name:\s*'([^']+)'/)?.[1] ?? id;
    if (!id) continue;

    const signalsText = block.match(/signals:\s*\[([^\]]*)\]/)?.[1] ?? '';
    const signals = [...signalsText.matchAll(/'([^']+)'/g)].map(match => match[1]);
    const options = parseSimulationOptions(block);

    for (const kind of ['tran', 'ac', 'dc'] as const) {
      const netlist = block.match(new RegExp(`${kind}Netlist:\\s*\`([\\s\\S]*?)\``))?.[1]?.trim();
      if (netlist) cases.push({ id, name, kind, netlist, signals, options });
    }
  }

  return cases;
}

function parseSimulationOptions(block: string): SimulationOptions | undefined {
  const options: SimulationOptions = {};
  const integrationMethod = block.match(/integrationMethod:\s*'([^']+)'/)?.[1] as SimulationOptions['integrationMethod'] | undefined;
  if (integrationMethod) options.integrationMethod = integrationMethod;

  const reltol = block.match(/reltol:\s*([0-9.eE+-]+)/)?.[1];
  if (reltol) options.reltol = Number(reltol);

  return Object.keys(options).length > 0 ? options : undefined;
}

function steps(result: SimulationResult): Array<SimulationResult | StepResult> {
  return result.steps ?? [result];
}

function resultSeries(result: SimulationResult | StepResult, kind: ShowcaseKind, signal: string): Series {
  if (kind === 'tran') {
    expect(result.transient).toBeDefined();
    return {
      xs: Array.from(result.transient!.time),
      ys: Array.from(result.transient!.voltage(signal)),
    };
  }

  if (kind === 'ac') {
    expect(result.ac).toBeDefined();
    return {
      xs: Array.from(result.ac!.frequencies),
      ys: Array.from(result.ac!.voltage(signal), phasor => phasor.magnitude),
    };
  }

  expect(result.dcSweep).toBeDefined();
  return {
    xs: Array.from(result.dcSweep!.sweepValues),
    ys: Array.from(result.dcSweep!.voltage(signal)),
  };
}

function interpolate(series: Series, x: number): number {
  const { xs, ys } = series;
  if (x <= xs[0]) return ys[0];
  const last = xs.length - 1;
  if (x >= xs[last]) return ys[last];

  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }

  const f = (x - xs[lo]) / (xs[hi] - xs[lo]);
  return ys[lo] + (ys[hi] - ys[lo]) * f;
}

function compareSeries(native: Series, ngspice: Series, kind: ShowcaseKind): { maxAbs: number; rms: number; points: number } {
  const xs = kind === 'tran'
    ? native.xs.filter(x => x >= ngspice.xs[0] && x <= ngspice.xs[ngspice.xs.length - 1])
    : native.xs;

  let maxAbs = 0;
  let sumSquares = 0;
  for (const x of xs) {
    const diff = Math.abs(interpolate(native, x) - interpolate(ngspice, x));
    maxAbs = Math.max(maxAbs, diff);
    sumSquares += diff * diff;
  }

  return {
    maxAbs,
    rms: Math.sqrt(sumSquares / Math.max(xs.length, 1)),
    points: xs.length,
  };
}

function toleranceFor(testCase: ShowcaseCase): Tolerance {
  if (testCase.kind === 'ac') return { maxAbs: 1e-5, rms: 1e-5 };

  switch (testCase.id) {
    case 'rectifier':
      return { maxAbs: 0.1, rms: 0.06 };
    case 'buck':
      return { maxAbs: 0.35, rms: 0.25 };
    case 'boost':
      return { maxAbs: 0.45, rms: 0.25 };
    case 'buck-boost':
      return { maxAbs: 0.65, rms: 0.55 };
    default:
      return { maxAbs: 2e-3, rms: 5e-4 };
  }
}

const SHOWCASE_CASES = await loadShowcaseCases();

describe('showcase simulator parity', () => {
  expect(SHOWCASE_CASES.length).toBeGreaterThan(0);

  for (const testCase of SHOWCASE_CASES) {
    it(`${testCase.name} ${testCase.kind} works in spice-ts and aligns with ngspice`, async () => {
      const nativeResult = await simulate(testCase.netlist, { ...testCase.options, simulator: 'spice-ts' });
      const ngspiceResult = await simulate(testCase.netlist, { ...testCase.options, simulator: 'ngspice-wasm' });

      const nativeSteps = steps(nativeResult);
      const ngspiceSteps = steps(ngspiceResult);
      expect(nativeSteps.length).toBe(ngspiceSteps.length);

      const tolerance = toleranceFor(testCase);
      for (let stepIndex = 0; stepIndex < nativeSteps.length; stepIndex++) {
        for (const signal of testCase.signals) {
          const stats = compareSeries(
            resultSeries(nativeSteps[stepIndex], testCase.kind, signal),
            resultSeries(ngspiceSteps[stepIndex], testCase.kind, signal),
            testCase.kind,
          );

          expect(stats.points).toBeGreaterThan(0);
          expect(stats.maxAbs).toBeLessThanOrEqual(tolerance.maxAbs);
          expect(stats.rms).toBeLessThanOrEqual(tolerance.rms);
        }
      }
    }, 30_000);
  }
});
