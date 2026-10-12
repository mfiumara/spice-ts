import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { MNAAssembler } from '../mna/assembler.js';
import { buildCompanionSystem } from '../mna/companion.js';
import { stampDynamicDevices, stampStaticDevices } from '../mna/linear-stamp.js';
import { MOSFET } from '../devices/mosfet.js';
import type { DeviceModel } from '../devices/device.js';
import { createSparseSolver } from '../solver/sparse-solver.js';
import type { SparseSolver } from '../solver/sparse-solver.js';
import { resolveOptions } from '../types.js';
import type { IntegrationMethod } from '../types.js';
import type { CompiledCircuit } from '../circuit.js';
import { attemptStep, isIterationInvariant } from './transient-step.js';
import { solveTransient } from './transient.js';

/**
 * Issue #710: the companion build is the top self-time area of the M2 RC
 * ladder. Two changes, both required to leave every result bit-identical:
 *
 *  1. On a circuit whose stamps do not read the Newton iterate, the second
 *     Newton iteration of a step rebuilds the same system and solves it to the
 *     same x. attemptStep returns that converged result directly.
 *  2. buildCompanionSystem fuses its column passes into one.
 *
 * The references are the pre-#710 code paths: (1) the same circuit with the
 * shortcut disabled through an instance `stamp` override that delegates to the
 * prototype (same additions in the same order), (2) a frozen copy of the
 * pre-#710 buildCompanionSystem fast path.
 */

function expectSameBits(actual: ArrayLike<number>, expected: ArrayLike<number>, label: string): void {
  expect(actual.length, label).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    if (!Object.is(actual[i], expected[i])) {
      throw new Error(`${label}[${i}]: ${actual[i]} is not bit-identical to ${expected[i]}`);
    }
  }
}

/** Disable the shortcut without changing any stamp: an own `stamp` that calls the prototype's. */
function withOverride(compiled: CompiledCircuit, name: string): CompiledCircuit {
  const device = compiled.devices.find(candidate => candidate.name === name)!;
  const prototypeStamp = Object.getPrototypeOf(device).stamp as DeviceModel['stamp'];
  Object.defineProperty(device, 'stamp', {
    value: function (this: DeviceModel, ...args: Parameters<DeviceModel['stamp']>) {
      return prototypeStamp.apply(this, args);
    },
    configurable: true,
    writable: true,
  });
  return compiled;
}

function countingSolver(): { solver: SparseSolver; solves: () => number } {
  const inner = createSparseSolver();
  let count = 0;
  const solver: SparseSolver = {
    analyzePattern: (...args) => inner.analyzePattern(...args),
    factorize: (...args) => inner.factorize(...args),
    solve: (...args) => { count++; return inner.solve(...args); },
    isPatternAnalyzed: () => inner.isPatternAnalyzed(),
  };
  return { solver, solves: () => count };
}

const LINEAR_DECKS: Record<string, string> = {
  'rc ladder, pulse, trap': `
V1 n0 0 PULSE(0 1 0 1n 1n 50n 100n)
R1 n0 n1 1k
C1 n1 0 1p
R2 n1 n2 1k
C2 n2 0 1p
R3 n2 n3 1k
C3 n3 0 1p
.tran 1n 100n
`,
  'sin + current source, floating cap, gear': `
V1 a 0 SIN(0 2 10meg)
I1 0 b PULSE(0 1m 20n 5n 5n 30n 100n)
R1 a b 2k
C1 a b 3p
R2 b c 500
C2 c 0 10p
R3 c 0 10k
.options method=gear
.tran 1n 200n
`,
  'pwl, zero-ohm branch resistor, uic': `
V1 a 0 PWL(0 0 10n 5 30n 5 40n -1)
R0 a b 0
R1 b c 1k
C1 c 0 2p IC=0.5
C2 c d 1p
R2 d 0 3k
.tran 0.5n 80n uic
`,
};

describe('iteration-invariant transient Newton shortcut (#710)', () => {
  it('only accepts plain R, C and non-noise independent sources', () => {
    const plain = parse(LINEAR_DECKS['rc ladder, pulse, trap']).compile();
    expect(isIterationInvariant(plain)).toBe(true);
    expect(isIterationInvariant(withOverride(parse(LINEAR_DECKS['rc ladder, pulse, trap']).compile(), 'V1'))).toBe(false);
    const nonInvariant = [
      'V1 a 0 PULSE(0 1 0 1n 1n 5n 10n)\nR1 a b 1k\nD1 b 0 DM\n.model DM D\n.tran 1n 20n\n',
      'V1 a 0 PULSE(0 1 0 1n 1n 5n 10n)\nR1 a b 1k\nL1 b 0 1u\n.tran 1n 20n\n',
      'V1 a 0 TRNOISE(1m 1n 0 0)\nR1 a b 1k\nC1 b 0 1p\n.tran 1n 20n\n',
      'V1 a 0 PULSE(0 1 0 1n 1n 5n 10n)\nR1 a b 1k\nE1 c 0 b 0 2\nR2 c 0 1k\n.tran 1n 20n\n',
    ];
    for (const netlist of nonInvariant) {
      expect(isIterationInvariant(parse(`* title\n${netlist}`).compile()), netlist).toBe(false);
    }
  });

  it('returns the converged second iteration from one solve, bit-identical to two', () => {
    for (const method of ['euler', 'trapezoidal', 'gear2'] as IntegrationMethod[]) {
      const run = (override: boolean) => {
        let compiled = parse(LINEAR_DECKS['sin + current source, floating cap, gear']).compile();
        if (override) compiled = withOverride(compiled, 'R1');
        const options = resolveOptions({ integrationMethod: method }, 1e-6);
        const counting = countingSolver();
        const assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount, {
          solverFactory: () => counting.solver,
        });
        const size = compiled.nodeCount + compiled.branchCount;
        const prevSolution = Float64Array.from({ length: size }, (_, i) => Math.sin(i + 1) * 0.3);
        const prevPrev = Float64Array.from({ length: size }, (_, i) => Math.cos(i + 2) * 0.2);
        const prevB = Float64Array.from({ length: size }, (_, i) => (i % 3 === 0 ? 0 : 1e-4 * i));
        const result = attemptStep(
          { compiled, assembler, options },
          {
            dt: 2e-9, time: 7e-9, prevSolution, prevB, gmin: 1e-12, voltageLimit: 3.5,
            prevPrevSolution: prevPrev, prevDt: 1.5e-9, integrationMethod: method,
          },
        );
        return { result, solves: counting.solves(), solution: new Float64Array(assembler.solution) };
      };
      const fast = run(false);
      const full = run(true);
      expect(fast.result.ok && full.result.ok, method).toBe(true);
      if (!fast.result.ok || !full.result.ok) continue;
      expect(full.result.iterations, method).toBe(2);
      expect(fast.result.iterations, method).toBe(full.result.iterations);
      expect(fast.result.oscillated, method).toBe(full.result.oscillated);
      expect(full.solves, method).toBe(2);
      expect(fast.solves, method).toBe(1);
      expectSameBits(fast.result.solution, full.result.solution, `${method} solution`);
      expectSameBits(fast.solution, full.solution, `${method} assembler.solution`);
    }
  });

  it('keeps every linear transient waveform bit-identical', () => {
    for (const [label, netlist] of Object.entries(LINEAR_DECKS)) {
      const run = (override: boolean) => {
        const compiled = parse(netlist).compile();
        if (override) withOverride(compiled, 'R1');
        const analysis = compiled.analyses.find(candidate => candidate.type === 'tran');
        if (analysis?.type !== 'tran') throw new Error('no .tran');
        expect(isIterationInvariant(compiled), label).toBe(!override);
        const options = resolveOptions(compiled.simulationOptions, analysis.stopTime);
        return { compiled, result: solveTransient(compiled, analysis, options) };
      };
      const fast = run(false);
      const full = run(true);
      expect(fast.result.time.length, label).toBeGreaterThan(20);
      expectSameBits(fast.result.time, full.result.time, `${label} time`);
      for (const name of fast.compiled.nodeNames) {
        expectSameBits(fast.result.voltage(name), full.result.voltage(name), `${label} v(${name})`);
      }
      for (const name of fast.compiled.branchNames) {
        expectSameBits(fast.result.current(name), full.result.current(name), `${label} i(${name})`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Frozen pre-#710 buildCompanionSystem fast path (main dd4e58be), renamed only.
// ---------------------------------------------------------------------------

interface FrozenPlan {
  readonly mosfets: MOSFET[];
  readonly others: DeviceModel[];
  readonly dynamic: DeviceModel[];
  readonly charged: DeviceModel[];
}

function frozenPlan(devices: readonly DeviceModel[]): FrozenPlan {
  const mosfets: MOSFET[] = [];
  const others: DeviceModel[] = [];
  const dynamic: DeviceModel[] = [];
  const charged: DeviceModel[] = [];
  for (const d of devices) {
    if (d instanceof MOSFET) mosfets.push(d);
    else others.push(d);
    if (d.integratesTransientCharge) {
      if (d.stampTransientCharge !== undefined) charged.push(d);
    } else if (d.storesCharge !== false && d.stampDynamic !== undefined) {
      dynamic.push(d);
    }
  }
  return { mosfets, others, dynamic, charged };
}

function frozenBuildCompanionSystem(
  assembler: MNAAssembler,
  devices: DeviceModel[],
  dt: number,
  method: IntegrationMethod,
  prevSolution: Float64Array,
  prevB?: Float64Array,
  gmin = 1e-12,
  prevPrevSolution?: Float64Array,
  prevDt?: number,
  staticCurrentHistory = false,
): void {
  if (!assembler.isFastPath) throw new Error('frozen reference covers the fast path only');
  assembler.clear();
  const ctx = assembler.getStampContext();
  const plan = frozenPlan(devices);
  if (assembler.topologyNnz > 0) {
    stampStaticDevices(assembler, plan.others, ctx);
    if (plan.mosfets.length > 0) {
      MOSFET.batchStamp(
        plan.mosfets, assembler.gValues, assembler.b, assembler.solution,
        assembler.stampIndex,
      );
    }
  } else {
    for (const device of devices) device.stamp(ctx);
  }
  stampDynamicDevices(assembler, plan.dynamic, ctx);

  const useGear2 = method === 'gear2' && prevPrevSolution !== undefined && prevDt !== undefined;
  const useTrap = method === 'trapezoidal' && prevB !== undefined;
  const effectiveMethod: IntegrationMethod =
    (method === 'gear2' && !useGear2) || (method === 'trapezoidal' && !useTrap)
      ? 'euler'
      : method;

  const gv = assembler.gValues;
  const cv = assembler.cValues;
  const colPtr = assembler.colPtr;
  const rowIdx = assembler.rowIdx;
  const diag = assembler.diagIdx;
  const n = assembler.systemSize;
  const b = assembler.b;
  for (let i = 0; i < assembler.numNodes; i++) gv[diag[i]] += gmin;

  if (effectiveMethod === 'euler') {
    const factor = 1 / dt;
    const nnz = colPtr[n];
    for (let i = 0; i < nnz; i++) gv[i] += factor * cv[i];
    for (let j = 0; j < n; j++) {
      const xj = prevSolution[j];
      if (xj === 0) continue;
      for (let p = colPtr[j]; p < colPtr[j + 1]; p++) {
        b[rowIdx[p]] += factor * cv[p] * xj;
      }
    }
  } else if (effectiveMethod === 'gear2') {
    const alpha = prevDt! / dt;
    const a1 = (2 + alpha) / ((1 + alpha) * dt);
    const a2 = (1 + alpha) / (alpha * dt);
    const a3 = 1 / (alpha * (1 + alpha) * dt);
    const nnz = colPtr[n];
    const isDynamic = new Uint8Array(n);
    for (let p = 0; p < nnz; p++) {
      if (cv[p] !== 0) isDynamic[rowIdx[p]] = 1;
    }
    for (let i = 0; i < nnz; i++) gv[i] += a1 * cv[i];
    const histDyn = new Float64Array(n);
    const xNm1 = prevPrevSolution!;
    for (let j = 0; j < n; j++) {
      const xj = prevSolution[j];
      const xjm1 = xNm1[j];
      if (xj === 0 && xjm1 === 0) continue;
      for (let p = colPtr[j]; p < colPtr[j + 1]; p++) {
        const cp = cv[p];
        if (cp === 0) continue;
        histDyn[rowIdx[p]] += a2 * cp * xj - a3 * cp * xjm1;
      }
    }
    for (let i = 0; i < n; i++) {
      if (isDynamic[i]) b[i] += histDyn[i];
    }
  } else {
    const factor = 2 / dt;
    const nnz = colPtr[n];
    const isDynamic = new Uint8Array(n);
    for (let p = 0; p < nnz; p++) {
      if (cv[p] !== 0) isDynamic[rowIdx[p]] = 1;
    }
    const Gx = new Float64Array(n);
    if (!staticCurrentHistory) {
      for (let j = 0; j < n; j++) {
        const xj = prevSolution[j];
        if (xj === 0) continue;
        for (let p = colPtr[j]; p < colPtr[j + 1]; p++) Gx[rowIdx[p]] += gv[p] * xj;
      }
    }
    for (let i = 0; i < nnz; i++) gv[i] += factor * cv[i];
    for (let j = 0; j < n; j++) {
      const xj = prevSolution[j];
      if (xj === 0) continue;
      for (let p = colPtr[j]; p < colPtr[j + 1]; p++) {
        b[rowIdx[p]] += factor * cv[p] * xj;
      }
    }
    for (let i = 0; i < n; i++) {
      if (isDynamic[i]) {
        if (staticCurrentHistory) b[i] -= prevB![i];
        else {
          b[i] -= Gx[i];
          b[i] += prevB![i];
        }
      }
    }
  }

  const integration = { method: effectiveMethod, dt, prevDt: useGear2 ? prevDt : undefined };
  for (const device of plan.charged) device.stampTransientCharge!(ctx, integration);
}

/** Deterministic xorshift values with exact zeros, signed zeros and wide magnitudes. */
function sampler(seed: number): () => number {
  let state = seed >>> 0 || 1;
  const next = (): number => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x100000000;
  };
  return () => {
    const pick = next();
    if (pick < 0.12) return 0;
    if (pick < 0.16) return -0;
    const magnitude = 10 ** (next() * 8 - 5);
    return (next() < 0.5 ? -1 : 1) * magnitude;
  };
}

const COMPANION_DECKS: Record<string, string> = {
  'MOS inverter with load caps': `
VDD vdd 0 3.3
VIN in 0 PULSE(0 3.3 1n 1n 1n 5n 10n)
M1 out in vdd vdd PM W=20u L=1u
M2 out in 0 0 NM W=10u L=1u
CL out 0 10f
M3 out2 out vdd vdd PM W=20u L=1u
M4 out2 out 0 0 NM W=10u L=1u
CL2 out2 0 10f
C3 out out2 2f
.model NM NMOS(LEVEL=1 VTO=0.7 KP=110u CGSO=1n CGDO=1n CJ=1e-4)
.model PM PMOS(LEVEL=1 VTO=-0.7 KP=50u CGSO=1n CGDO=1n CJ=1e-4)
.tran 0.1n 20n
`,
  'diode, inductor, coupled, floating caps': `
V1 a 0 SIN(0 5 1meg)
R1 a b 100
D1 b c DM
C1 c 0 1n
C2 b c 2p
L1 c d 10u
L2 e 0 10u
K1 L1 L2 0.5
R2 d 0 1k
R3 e 0 50
.model DM D(CJO=2p)
.tran 10n 2u
`,
};

describe('fused buildCompanionSystem column pass (#710)', () => {
  it('matches the frozen pre-#710 fast path bit for bit', () => {
    let compared = 0;
    for (const [label, netlist] of Object.entries(COMPANION_DECKS)) {
      // Device stamps keep state between calls (MOSFET limiting history), so
      // the reference and the change each run on their own identical copy.
      const setup = () => {
        const compiled = parse(netlist).compile();
        const assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
        const n = compiled.nodeCount + compiled.branchCount;
        buildCompanionSystem(assembler, compiled.devices, 1e-9, 'euler', new Float64Array(n));
        assembler.lockTopology();
        expect(assembler.isFastPath, label).toBe(true);
        return { compiled, assembler, n };
      };
      const reference = setup();
      const changed = setup();
      const n = reference.n;
      const random = sampler(0x710 + label.length);
      for (let trial = 0; trial < 40; trial++) {
        const vector = () => Float64Array.from({ length: n }, random);
        const prevSolution = vector();
        const prevPrev = vector();
        const prevB = vector();
        const iterate = Float64Array.from({ length: n }, () => random() % 2);
        const dt = 10 ** (-12 + 4 * Math.abs(random() % 1));
        const prevDt = dt * (0.25 + Math.abs(random() % 3));
        for (const method of ['euler', 'trapezoidal', 'gear2'] as IntegrationMethod[]) {
          for (const staticCurrentHistory of [false, true]) {
            for (const withHistory of [true, false]) {
              const args = (devices: DeviceModel[]) => [
                devices, dt, method, prevSolution, withHistory ? prevB : undefined, 1e-12,
                withHistory ? prevPrev : undefined, withHistory ? prevDt : undefined, staticCurrentHistory,
              ] as const;
              reference.assembler.solution.set(iterate);
              frozenBuildCompanionSystem(reference.assembler, ...args(reference.compiled.devices));
              changed.assembler.solution.set(iterate);
              buildCompanionSystem(changed.assembler, ...args(changed.compiled.devices));
              const where = `${label} trial ${trial} ${method} sch=${staticCurrentHistory} hist=${withHistory}`;
              expectSameBits(changed.assembler.gValues, reference.assembler.gValues, `${where} G`);
              expectSameBits(changed.assembler.b, reference.assembler.b, `${where} b`);
              compared++;
            }
          }
        }
      }
    }
    expect(compared).toBe(2 * 40 * 3 * 2 * 2);
  });
});
