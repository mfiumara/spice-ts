import type { DeviceModel, StampContext } from './device.js';

/**
 * ngspice `.options rshunt=R`: a conductance 1/R from every voltage node,
 * device-internal nodes included, to ground.
 *
 * ngspice-47 (XSPICE build) cktsetup.c makes the diagonal element of every
 * non-ground `SP_VOLTAGE` node after the device setups, and cktload.c (DC,
 * transient) and acan.c CKTacLoad (AC, noise) add `gshunt` to each of them
 * after the device loads. The shunts are not devices: they have no current
 * output and no noise, so this pseudo-device lists no nodes and stamps the
 * diagonal of all `ctx.numNodes` node rows, never the branch-current rows.
 */
export class NodeShunt implements DeviceModel {
  readonly name = '.options rshunt';
  readonly nodes: number[] = [];
  readonly branches: number[] = [];
  readonly isNonlinear = false;
  readonly storesCharge = false;
  /** Shunt conductance in siemens (ngspice rshunt_data.gshunt = 1 / RSHUNT). */
  readonly conductance: number;

  constructor(resistance: number) {
    this.conductance = 1 / resistance;
  }

  stamp(ctx: StampContext): void {
    for (let node = 0; node < ctx.numNodes; node++) ctx.stampG(node, node, this.conductance);
  }
}
