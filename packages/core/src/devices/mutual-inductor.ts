import type { DeviceModel, StampContext } from './device.js';
import type { Inductor } from './inductor.js';

/**
 * Mutual inductance (K-element) — couples two inductors with a coefficient k.
 *
 * The mutual inductance is M = k * sqrt(L_a * L_b), where |k| ≤ 1 for
 * physically realizable couplings. The branch equations of the two
 * coupled inductors become:
 *   V_a = L_a * dI_a/dt + M * dI_b/dt
 *   V_b = M  * dI_a/dt + L_b * dI_b/dt
 *
 * In MNA terms this adds two off-diagonal entries to the C matrix at
 * (branch_a, branch_b) and (branch_b, branch_a), each equal to -M
 * (matching the existing -L sign convention used by {@link Inductor}).
 *
 * The device contributes nothing at DC and nothing to the conductance
 * matrix — only to the dynamic (C) matrix used by the companion model.
 */
export class MutualInductor implements DeviceModel {
  readonly nodes: number[] = [];
  readonly branches: number[] = [];
  readonly isNonlinear = false;

  constructor(
    readonly name: string,
    readonly indA: Inductor,
    readonly indB: Inductor,
    public k: number,
  ) {}

  stamp(_ctx: StampContext): void {
    // No DC contribution; mutual coupling is purely a dynamic (dI/dt) effect.
  }

  stampDynamic(ctx: StampContext): void {
    const M = this.k * Math.sqrt(this.indA.inductance * this.indB.inductance);
    const ba = ctx.numNodes + this.indA.branchIndex;
    const bb = ctx.numNodes + this.indB.branchIndex;
    ctx.stampC(ba, bb, -M);
    ctx.stampC(bb, ba, -M);
  }
}
