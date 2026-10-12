import { describe, expect, it } from 'vitest';
import { LinearReactiveTruncation } from './transient-reactive-truncation.js';
import { TransientChargeState, chargeTruncationTimestep } from '../devices/charge-state.js';
import type { ChargeIntegration, ChargeTruncation, DeviceModel } from '../devices/device.js';
import { Capacitor } from '../devices/capacitor.js';
import { Inductor } from '../devices/inductor.js';
import { MutualInductor } from '../devices/mutual-inductor.js';
import { Resistor } from '../devices/resistor.js';

/**
 * Characterisation tests for #702: CAPtrunc/INDtrunc and CKTterr without
 * per-charge closures, dispatch or array allocations must return exactly what
 * the pre-#702 code returned (main cbbafcdf). The frozen copies below are that
 * code, renamed only; results are compared with Object.is, so every bit,
 * signed zero, Infinity and NaN must match.
 */

// ---- Frozen pre-#702 code (main cbbafcdf), renamed only. ----

const FROZEN_TRAP_COEFFICIENTS = [0.5, 0.08333333333];
const FROZEN_GEAR_COEFFICIENTS = [0.5, 0.2222222222];

function frozenChargeTruncationTimestep(
  method: ChargeIntegration['method'],
  order: 1 | 2,
  charge: number,
  accepted: number,
  previous: number,
  older: number,
  current: number,
  acceptedCurrent: number,
  { deltas, reltol, abstol, chgtol, trtol }: ChargeTruncation,
): number {
  const currentTolerance = abstol + reltol * Math.max(Math.abs(current), Math.abs(acceptedCurrent));
  const chargeTolerance = reltol * Math.max(Math.abs(charge), Math.abs(accepted), chgtol) / deltas[0];
  const tolerance = Math.max(currentTolerance, chargeTolerance);
  // Divided differences of q over t(n+1), t(n), ..., t(n-order).
  const diff = [charge, accepted, previous, older];
  const span = [deltas[0], deltas[1], deltas[2]];
  for (let j: number = order; ; j--) {
    for (let i = 0; i <= j; i++) diff[i] = (diff[i] - diff[i + 1]) / span[i];
    if (j === 0) break;
    for (let i = 0; i < j; i++) span[i] = span[i + 1] + deltas[i];
  }
  const factor = (method === 'gear2' ? FROZEN_GEAR_COEFFICIENTS : FROZEN_TRAP_COEFFICIENTS)[order - 1];
  const bound = trtol * tolerance / Math.max(abstol, factor * Math.abs(diff[0]));
  return order === 2 ? Math.sqrt(bound) : bound;
}

/** Pre-#702 LinearReactiveTruncation: per-charge accept() through a closure. */
class FrozenLinearReactiveTruncation {
  private readonly capacitors: readonly Capacitor[];
  private readonly inductors: readonly Inductor[];
  private readonly couplings: readonly { mutual: MutualInductor; a: number; b: number }[];
  readonly state: TransientChargeState;
  private readonly flux: Float64Array;

  constructor(devices: readonly DeviceModel[], private readonly nodeCount: number) {
    this.capacitors = devices.filter((device): device is Capacitor => device instanceof Capacitor);
    const inductors = devices.filter((device): device is Inductor => device instanceof Inductor);
    this.inductors = inductors;
    this.couplings = devices
      .filter((device): device is MutualInductor => device instanceof MutualInductor)
      .map(mutual => ({ mutual, a: inductors.indexOf(mutual.indA), b: inductors.indexOf(mutual.indB) }))
      .filter(({ a, b }) => a >= 0 && b >= 0);
    this.state = new TransientChargeState(this.capacitors.length + this.inductors.length);
    this.flux = new Float64Array(this.inductors.length);
  }

  get isEmpty(): boolean {
    return this.state.size === 0;
  }

  accept(solution: Float64Array, integration: ChargeIntegration | undefined): void {
    if (this.isEmpty) return;
    if (integration !== undefined) this.state.begin(integration);
    this.record(solution);
  }

  timestep(solution: Float64Array, integration: ChargeIntegration, truncation: ChargeTruncation): number {
    if (this.isEmpty) return Infinity;
    this.state.begin(integration);
    return this.state.truncationTimestep(truncation, () => this.record(solution));
  }

  reset(): void {
    this.state.reset();
  }

  private record(solution: Float64Array): void {
    const voltage = (node: number): number => (node >= 0 ? solution[node] : 0);
    const current = (inductor: Inductor): number => solution[this.nodeCount + inductor.branchIndex];
    const capacitors = this.capacitors;
    for (let index = 0; index < capacitors.length; index++) {
      const [positive, negative] = capacitors[index].nodes;
      this.state.accept(index, capacitors[index].capacitance * (voltage(positive) - voltage(negative)));
    }
    const inductors = this.inductors;
    const flux = this.flux;
    for (let index = 0; index < inductors.length; index++) {
      flux[index] = inductors[index].inductance * current(inductors[index]);
    }
    for (const { mutual, a, b } of this.couplings) {
      const m = mutual.coupling * Math.sqrt(mutual.indA.inductance * mutual.indB.inductance);
      flux[a] += m * current(mutual.indB);
      flux[b] += m * current(mutual.indA);
    }
    for (let index = 0; index < inductors.length; index++) {
      this.state.accept(capacitors.length + index, flux[index]);
    }
    this.state.commit();
  }
}

// ---- Helpers. ----

/** Deterministic xorshift32 in [0, 1). */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

const METHODS: readonly ChargeIntegration['method'][] = ['euler', 'trapezoidal', 'gear2'];

/** Values that stress the arithmetic: zeros of both signs, ties, tiny and huge magnitudes. */
function value(random: () => number): number {
  const r = random();
  if (r < 0.05) return 0;
  if (r < 0.08) return -0;
  if (r < 0.12) return 1e-15;
  const magnitude = 10 ** (Math.floor(random() * 30) - 18);
  return (random() < 0.5 ? -1 : 1) * magnitude * random();
}

function step(random: () => number): number {
  const r = random();
  if (r < 0.1) return 1e-12;
  return 10 ** (-(3 + Math.floor(random() * 9))) * (0.1 + random());
}

function truncationOf(random: () => number): ChargeTruncation {
  return {
    deltas: [step(random), step(random), step(random)],
    reltol: random() < 0.5 ? 1e-3 : 10 ** -(2 + Math.floor(random() * 5)),
    abstol: random() < 0.5 ? 1e-12 : 1e-15,
    chgtol: random() < 0.5 ? 1e-14 : 1e-16,
    trtol: random() < 0.5 ? 7 : 1,
  };
}

function integrationOf(random: () => number): ChargeIntegration {
  const method = METHODS[Math.floor(random() * METHODS.length)];
  return { method, dt: step(random), prevDt: random() < 0.8 ? step(random) : undefined };
}

describe('chargeTruncationTimestep scalar divided differences (#702)', () => {
  it('matches the pre-#702 array recurrence bit for bit', () => {
    const random = rng(702);
    let compared = 0;
    for (let trial = 0; trial < 20000; trial++) {
      const method = METHODS[trial % 3];
      const order = (trial % 2 === 0 ? 1 : 2) as 1 | 2;
      const args = [
        value(random), value(random), value(random), value(random), value(random), value(random),
      ] as const;
      const truncation = truncationOf(random);
      const expected = frozenChargeTruncationTimestep(method, order, ...args, truncation);
      const actual = chargeTruncationTimestep(method, order, ...args, truncation);
      if (!Object.is(actual, expected)) {
        expect({ trial, method, order, args, truncation, actual }).toEqual({
          trial, method, order, args, truncation, actual: expected,
        });
      }
      compared++;
    }
    expect(compared).toBe(20000);
  });

  it('matches on exact charge histories and degenerate steps', () => {
    const histories = [
      [0, 0, 0, 0], [1, 1, 1, 1], [27, 8, 1, 0], [-0, 0, -0, 0], [1e-30, -1e-30, 1e-30, -1e-30],
    ];
    const deltas: [number, number, number][] = [
      [1, 1, 1], [1e-12, 1e-9, 1e-6], [0, 1, 1], [1, 0, 1], [1, 1, 0], [Infinity, 1, 1],
    ];
    for (const method of METHODS) {
      for (const order of [1, 2] as const) {
        for (const [q0, q1, q2, q3] of histories) {
          for (const d of deltas) {
            const truncation = { deltas: d, reltol: 1e-3, abstol: 1e-12, chgtol: 1e-14, trtol: 7 };
            expect(Object.is(
              chargeTruncationTimestep(method, order, q0, q1, q2, q3, q0 - q1, q1 - q2, truncation),
              frozenChargeTruncationTimestep(method, order, q0, q1, q2, q3, q0 - q1, q1 - q2, truncation),
            )).toBe(true);
          }
        }
      }
    }
  });
});

describe('TransientChargeState batched accept/truncation (#702)', () => {
  it('acceptAll and truncationTimestepAll equal per-charge accept and truncationTimestep', () => {
    const random = rng(1702);
    for (let run = 0; run < 60; run++) {
      const size = 1 + Math.floor(random() * 12);
      const perCharge = new TransientChargeState(size);
      const batched = new TransientChargeState(size);
      const charges = new Float64Array(size);
      for (let point = 0; point < 40; point++) {
        if (random() < 0.03) {
          perCharge.reset();
          batched.reset();
        }
        // An absent rule is the initial point (and a restart): charges at rest.
        const integration = point === 0 || random() < 0.05 ? undefined : integrationOf(random);
        for (let i = 0; i < size; i++) charges[i] = value(random);
        if (integration !== undefined && random() < 0.7) {
          const truncation = truncationOf(random);
          perCharge.begin(integration);
          batched.begin(integration);
          const expected = perCharge.truncationTimestep(truncation, () => {
            for (let i = 0; i < size; i++) perCharge.accept(i, charges[i]);
            perCharge.commit();
          });
          const actual = batched.truncationTimestepAll(truncation, charges);
          expect(Object.is(actual, expected)).toBe(true);
        }
        if (random() < 0.2) continue; // rejected trial point: nothing is accepted
        if (integration !== undefined) {
          perCharge.begin(integration);
          batched.begin(integration);
        }
        for (let i = 0; i < size; i++) perCharge.accept(i, charges[i]);
        perCharge.commit();
        batched.acceptAll(charges);
        for (let i = 0; i < size; i++) {
          expect(Object.is(batched.acceptedChargeCurrent(i), perCharge.acceptedChargeCurrent(i))).toBe(true);
        }
      }
    }
  });
});

describe('LinearReactiveTruncation (#702)', () => {
  function circuit(): { devices: DeviceModel[]; nodeCount: number; size: number } {
    const nodeCount = 6;
    const l1 = new Inductor('L1', [0, 1], 0, 1e-6);
    const l2 = new Inductor('L2', [2, -1], 1, 3e-6);
    const l3 = new Inductor('L3', [3, 4], 2, 2e-9);
    const devices: DeviceModel[] = [
      new Capacitor('C1', [0, -1], 1e-12),
      new Resistor('R1', [0, 1], 1e3),
      l1,
      new Capacitor('C2', [1, 2], 4.7e-9),
      new Capacitor('C3', [-1, 3], 1e-15),
      l2,
      new MutualInductor('K1', l1, l2, 0.95),
      new Capacitor('C4', [4, 5], 2.2e-6),
      l3,
      new MutualInductor('K2', l2, l3, -0.3),
      new Capacitor('C5', [5, 5], 1e-9),
      // A malformed one-terminal capacitor reads 0 V on the missing terminal.
      new Capacitor('C6', [2], 3.3e-9),
    ];
    return { devices, nodeCount, size: nodeCount + 3 };
  }

  it('returns the pre-#702 bounds and keeps the same accepted history', () => {
    const random = rng(2702);
    for (let run = 0; run < 25; run++) {
      const { devices, nodeCount, size } = circuit();
      const current = new LinearReactiveTruncation(devices, nodeCount);
      const frozen = new FrozenLinearReactiveTruncation(devices, nodeCount);
      const solution = new Float64Array(size);
      const fill = (): void => {
        for (let i = 0; i < size; i++) solution[i] = value(random) * 1e6;
      };
      fill();
      current.accept(solution, undefined);
      frozen.accept(solution, undefined);
      for (let point = 0; point < 60; point++) {
        if (random() < 0.03) {
          current.reset();
          frozen.reset();
        }
        if (random() < 0.05) (devices[3] as Capacitor).capacitance *= 1 + random();
        const integration = integrationOf(random);
        fill();
        const truncation = truncationOf(random);
        const expected = frozen.timestep(solution, integration, truncation);
        const actual = current.timestep(solution, integration, truncation);
        expect(Object.is(actual, expected)).toBe(true);
        if (random() < 0.25) continue;
        const acceptRule = random() < 0.05 ? undefined : integration;
        current.accept(solution, acceptRule);
        frozen.accept(solution, acceptRule);
        const state = (current as unknown as { state: TransientChargeState }).state;
        for (let i = 0; i < frozen.state.size; i++) {
          expect(Object.is(state.acceptedChargeCurrent(i), frozen.state.acceptedChargeCurrent(i))).toBe(true);
        }
      }
    }
  });

  it('is empty without capacitors or inductors', () => {
    const empty = new LinearReactiveTruncation([new Resistor('R1', [0, -1], 1)], 1);
    expect(empty.isEmpty).toBe(true);
    expect(empty.timestep(new Float64Array(1), { method: 'euler', dt: 1 }, truncationOf(rng(1)))).toBe(Infinity);
  });
});
