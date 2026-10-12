import type { ChargeIntegration, ChargeTruncation, DeviceModel } from '../devices/device.js';
import { TransientChargeState } from '../devices/charge-state.js';
import { Capacitor } from '../devices/capacitor.js';
import { Inductor } from '../devices/inductor.js';
import { MutualInductor } from '../devices/mutual-inductor.js';

/**
 * ngspice-47 CAPtrunc and INDtrunc for the linear capacitors and inductors,
 * which spice-ts integrates through the C-matrix companion rather than as
 * device charges (#621).
 *
 * CAPtrunc runs CKTterr on the capacitor charge q = C * v; INDtrunc runs it on
 * the inductor flux, which MUTload extends by M * i of every coupled inductor
 * (ngspice INDflux). The charges are recorded at every accepted point with the
 * integration rule the companion used for that step, so their capacitor
 * currents (ngspice CKTstate[ccap]) follow the same rule.
 */
export class LinearReactiveTruncation {
  private readonly capacitors: readonly Capacitor[];
  private readonly inductors: readonly Inductor[];
  /** K couplings with the flux indices of their two inductors. */
  private readonly couplings: readonly { mutual: MutualInductor; a: number; b: number }[];
  private readonly state: TransientChargeState;
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

  /**
   * Record an accepted point. `integration` is the rule of the step that
   * reached it; absent for the initial point, whose charges are at rest.
   */
  accept(solution: Float64Array, integration: ChargeIntegration | undefined): void {
    if (this.isEmpty) return;
    if (integration !== undefined) this.state.begin(integration);
    this.record(solution);
  }

  /** Smallest next timestep CKTterr allows on these charges at the converged trial `solution`. */
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
