import type { DeviceModel } from '../devices/device.js';

/**
 * Nodes the transient node-voltage LTE skips because device charge
 * truncation already bounds every charge on them (#638).
 *
 * ngspice-47 sizes transient steps with CKTtrunc alone: each device's
 * DEVtrunc runs CKTterr on its own charges, and there is no node-voltage
 * truncation (`.option newtrunc` is not compiled in). spice-ts keeps the
 * node-voltage LTE as the stand-in for devices that have no complete DEVtrunc
 * port yet (linear C and L, partial ports, stateful elements), so a node is
 * exempt only when at least one device with {@link
 * DeviceModel.truncationCoversCharges} touches it and every other device on it
 * stores no charge or state.
 */
export function chargeTruncatedNodes(nodeCount: number, devices: readonly DeviceModel[]): Uint8Array {
  const covered = new Uint8Array(nodeCount);
  const uncovered = new Uint8Array(nodeCount);
  for (const device of devices) {
    const mark = device.truncationCoversCharges === true && device.truncateTransientStep !== undefined
      ? covered
      : storesState(device) ? uncovered : undefined;
    if (mark === undefined) continue;
    for (const node of device.nodes) if (node >= 0 && node < nodeCount) mark[node] = 1;
  }
  const exempt = new Uint8Array(nodeCount);
  for (let node = 0; node < nodeCount; node++) exempt[node] = covered[node] & (uncovered[node] ^ 1);
  return exempt;
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
