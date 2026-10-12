import type { DeviceModel } from '../devices/device.js';
import { Capacitor } from '../devices/capacitor.js';
import { Inductor } from '../devices/inductor.js';
import { MutualInductor } from '../devices/mutual-inductor.js';

/**
 * Nodes the transient node-voltage LTE skips because they carry no state
 * that ngspice-47 would leave untruncated (#638, #621).
 *
 * ngspice-47 sizes transient steps with CKTtrunc alone: each device's
 * DEVtrunc runs CKTterr on its own charges (CAPtrunc, INDtrunc, DIOtrunc,
 * MOS1trunc, ...) or bounds the step itself (LTRAtrunc, SWtrunc), and there is
 * no node-voltage truncation (`.option newtrunc` is not compiled in). spice-ts
 * keeps the node-voltage LTE only as the stand-in for stateful devices that
 * have no complete DEVtrunc port yet, so a node is checked only when such a
 * device touches it. Linear capacitors and inductors (with their K couplings)
 * are truncated by the driver ({@link LinearReactiveTruncation}); every other
 * port sets {@link DeviceModel.truncationCoversCharges}. A node no device lists
 * (state hidden inside a device) keeps the check.
 */
export function chargeTruncatedNodes(nodeCount: number, devices: readonly DeviceModel[]): Uint8Array {
  const listed = new Uint8Array(nodeCount);
  const uncovered = new Uint8Array(nodeCount);
  for (const device of devices) {
    const untruncated = !truncatedLikeNgspice(device) && storesState(device);
    for (const node of device.nodes) {
      if (node < 0 || node >= nodeCount) continue;
      listed[node] = 1;
      if (untruncated) uncovered[node] = 1;
    }
  }
  const exempt = new Uint8Array(nodeCount);
  for (let node = 0; node < nodeCount; node++) exempt[node] = listed[node] & (uncovered[node] ^ 1);
  return exempt;
}

/** Whether ngspice-47's DEVtrunc for this device is fully ported. */
function truncatedLikeNgspice(device: DeviceModel): boolean {
  return isLinearReactive(device)
    || (device.truncationCoversCharges === true && device.truncateTransientStep !== undefined);
}

/** Linear C, L and K: truncated by {@link LinearReactiveTruncation} (CAPtrunc, INDtrunc). */
export function isLinearReactive(device: DeviceModel): device is Capacitor | Inductor | MutualInductor {
  return device instanceof Capacitor || device instanceof Inductor || device instanceof MutualInductor;
}

/** Whether a device keeps charge or other transient state between timepoints. */
function storesState(device: DeviceModel): boolean {
  if (device.storesCharge === false) return false;
  return device.stampDynamic !== undefined
    || device.integratesTransientCharge === true
    || device.stampTransientCharge !== undefined
    || device.truncateTransientStep !== undefined
    || device.acceptTransientStep !== undefined;
}
