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
 *
 * Both run once per trial or accepted timepoint over every capacitor, so the
 * charges are computed into one reused buffer and handed to the charge state
 * in a single batched call, with no per-charge closure or dispatch (#702).
 */
export class LinearReactiveTruncation {
  private readonly capacitors: readonly Capacitor[];
  private readonly inductors: readonly Inductor[];
  /** K couplings with the flux indices of their two inductors. */
  private readonly couplings: readonly { mutual: MutualInductor; a: number; b: number }[];
  private readonly state: TransientChargeState;
  private readonly flux: Float64Array;
  /** Charges of the point being recorded or measured: capacitors, then inductor fluxes. */
  private readonly charges: Float64Array;

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
    this.charges = new Float64Array(this.capacitors.length + this.inductors.length);
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
    this.state.acceptAll(this.evaluate(solution));
  }

  /** Smallest next timestep CKTterr allows on these charges at the converged trial `solution`. */
  timestep(solution: Float64Array, integration: ChargeIntegration, truncation: ChargeTruncation): number {
    if (this.isEmpty) return Infinity;
    this.state.begin(integration);
    return this.state.truncationTimestepAll(truncation, this.evaluate(solution));
  }

  reset(): void {
    this.state.reset();
  }

  /**
   * Every capacitor charge, then every inductor flux, at `solution`, into the
   * reused {@link charges} buffer (the charge order of {@link state}).
   */
  private evaluate(solution: Float64Array): Float64Array {
    const charges = this.charges;
    const capacitors = this.capacitors;
    const capacitorCount = capacitors.length;
    for (let index = 0; index < capacitorCount; index++) {
      const capacitor = capacitors[index];
      const nodes = capacitor.nodes;
      const positive = nodes[0];
      const negative = nodes[1];
      const vPositive = positive >= 0 ? solution[positive] : 0;
      const vNegative = negative >= 0 ? solution[negative] : 0;
      charges[index] = capacitor.capacitance * (vPositive - vNegative);
    }
    const inductors = this.inductors;
    if (inductors.length === 0) return charges;
    const nodeCount = this.nodeCount;
    const flux = this.flux;
    for (let index = 0; index < inductors.length; index++) {
      flux[index] = inductors[index].inductance * solution[nodeCount + inductors[index].branchIndex];
    }
    for (const { mutual, a, b } of this.couplings) {
      const m = mutual.coupling * Math.sqrt(mutual.indA.inductance * mutual.indB.inductance);
      flux[a] += m * solution[nodeCount + mutual.indB.branchIndex];
      flux[b] += m * solution[nodeCount + mutual.indA.branchIndex];
    }
    for (let index = 0; index < inductors.length; index++) {
      charges[capacitorCount + index] = flux[index];
    }
    return charges;
  }
}
