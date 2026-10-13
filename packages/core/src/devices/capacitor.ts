import type { DeviceModel, StampContext } from './device.js';

/**
 * Bumped on every write of any {@link Capacitor.capacitance} (issue #890).
 * Stamp programs cache capacitances in typed arrays and refill them only when
 * this changes, so the per-iteration kernel never chases device objects.
 */
let capacitanceRevision = 0;

/** Current {@link capacitanceRevision}: unchanged means no capacitor capacitance was written. */
export function capacitorCapacitanceRevision(): number {
  return capacitanceRevision;
}

export class Capacitor implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = false;
  private capacitanceValue = 0;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    capacitance: number,
    readonly ic?: number,
    /** One element's capacitance before the instance m (ngspice CAPcapac). */
    readonly unitCapacitance: number = capacitance,
    /** Instance parallel multiplier `m` (ngspice CAPm), already folded into `capacitance`. */
    readonly multiplier: number = 1,
    /** Instance `SCALE` factor (ngspice CAPscale), already folded into both values. */
    readonly scale: number = 1,
  ) {
    this.capacitance = capacitance;
  }

  get capacitance(): number {
    return this.capacitanceValue;
  }

  set capacitance(value: number) {
    this.capacitanceValue = value;
    capacitanceRevision++;
  }

  setParameter(value: number): void {
    this.capacitance = value;
  }

  getParameter(): number {
    return this.capacitance;
  }

  stamp(_ctx: StampContext): void {
    // Capacitor has no DC conductance (open circuit at DC)
  }

  stampDynamic(ctx: StampContext): void {
    const [n1, n2] = this.nodes;
    const c = this.capacitance;

    if (n1 >= 0) ctx.stampC(n1, n1, c);
    if (n2 >= 0) ctx.stampC(n2, n2, c);
    if (n1 >= 0 && n2 >= 0) {
      ctx.stampC(n1, n2, -c);
      ctx.stampC(n2, n1, -c);
    }
  }

}
