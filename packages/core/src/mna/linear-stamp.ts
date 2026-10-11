import type { MNAAssembler } from './assembler.js';
import type { DeviceModel, StampContext } from '../devices/device.js';
import { Resistor } from '../devices/resistor.js';
import { Capacitor } from '../devices/capacitor.js';

/**
 * Stamp programs for the plain two-terminal linear devices (issue #570).
 *
 * Every Newton iteration restamps every device. For a plain conductance-form
 * {@link Resistor} or a {@link Capacitor} that is a megamorphic `stamp` call,
 * an array destructure and up to four `ctx.stampG`/`ctx.stampC` calls, each
 * looking up its value slot. On large linear decks (the M2 RC ladder) that
 * dispatch dominated self time.
 *
 * A program walks the same device list in the same order. Each maximal run of
 * consecutive plain resistors (or capacitors) is stamped by one tight loop
 * from value slots resolved once per locked topology; every other device is
 * still stamped through its own method. Values are read from the device at
 * stamp time (`1 / resistance`, `capacitance`), so parameter changes apply as
 * before. Each slot receives exactly the additions the devices would make, in
 * the same order, so matrices are bit-identical to per-device stamping.
 */

/** One run of kernel devices, or a single device stamped through its own method. */
interface Step {
  /** Device stamped through its own method; null for a kernel run. */
  readonly device: DeviceModel | null;
  /** Kernel-run devices (resistors in a static program, capacitors in a dynamic one). */
  readonly run: readonly (Resistor | Capacitor)[];
  /** Four value slots per run device: (n1,n1), (n2,n2), (n1,n2), (n2,n1); -1 = not stamped. */
  readonly slots: Int32Array;
}

interface Program {
  /** Value storage the slots index; a relock allocates new storage. */
  readonly values: Float64Array;
  readonly length: number;
  readonly steps: readonly Step[];
}

type Kind = 'static' | 'dynamic';

/** Program caches per assembler and device list: [static, dynamic]. */
const programs: WeakMap<MNAAssembler, Map<readonly DeviceModel[], Program>>[] = [
  new WeakMap(), new WeakMap(),
];

/** Exactly a Resistor (no subclass, no own override) in conductance form. */
function isPlainResistor(device: DeviceModel): device is Resistor {
  return Object.getPrototypeOf(device) === Resistor.prototype
    && !Object.hasOwn(device, 'stamp')
    && (device as Resistor).branchIndex === undefined;
}

/** Exactly a Capacitor (no subclass, no own override). */
function isPlainCapacitor(device: DeviceModel): device is Capacitor {
  return Object.getPrototypeOf(device) === Capacitor.prototype
    && !Object.hasOwn(device, 'stamp')
    && !Object.hasOwn(device, 'stampDynamic');
}

/** The four slots a plain two-terminal stamp writes, or undefined if any is outside the topology. */
function twoTerminalSlots(assembler: MNAAssembler, device: DeviceModel): number[] | undefined {
  const n1 = device.nodes[0];
  const n2 = device.nodes[1];
  const index = assembler.stampIndex;
  try {
    return [
      n1 >= 0 ? index(n1, n1) : -1,
      n2 >= 0 ? index(n2, n2) : -1,
      n1 >= 0 && n2 >= 0 ? index(n1, n2) : -1,
      n1 >= 0 && n2 >= 0 ? index(n2, n1) : -1,
    ];
  } catch {
    // Not in the locked pattern: the device's own stamp reports it.
    return undefined;
  }
}

function buildProgram(assembler: MNAAssembler, devices: readonly DeviceModel[], kind: Kind): Program {
  const steps: Step[] = [];
  let run: (Resistor | Capacitor)[] = [];
  let slots: number[] = [];
  const flush = (): void => {
    if (run.length === 0) return;
    steps.push({ device: null, run, slots: Int32Array.from(slots) });
    run = [];
    slots = [];
  };
  for (const device of devices) {
    // A plain capacitor's static stamp is empty: skipping it adds nothing.
    if (kind === 'static' && isPlainCapacitor(device)) continue;
    const kernel = kind === 'static' ? isPlainResistor(device) : isPlainCapacitor(device);
    const deviceSlots = kernel ? twoTerminalSlots(assembler, device) : undefined;
    if (deviceSlots === undefined) {
      flush();
      steps.push({ device, run: [], slots: new Int32Array(0) });
      continue;
    }
    run.push(device as Resistor | Capacitor);
    slots.push(...deviceSlots);
  }
  flush();
  const values = kind === 'static' ? assembler.gValues : assembler.cValues;
  return { values, length: devices.length, steps };
}

function programFor(assembler: MNAAssembler, devices: readonly DeviceModel[], kind: Kind): Program {
  const cache = programs[kind === 'static' ? 0 : 1];
  let byList = cache.get(assembler);
  if (byList === undefined) {
    byList = new Map();
    cache.set(assembler, byList);
  }
  const values = kind === 'static' ? assembler.gValues : assembler.cValues;
  let program = byList.get(devices);
  if (program === undefined || program.values !== values || program.length !== devices.length) {
    program = buildProgram(assembler, devices, kind);
    byList.set(devices, program);
  }
  return program;
}

/**
 * Equivalent to `for (const d of devices) d.stamp(ctx)`, with `ctx` the
 * assembler's current stamp context.
 */
export function stampStaticDevices(
  assembler: MNAAssembler, devices: readonly DeviceModel[], ctx: StampContext,
): void {
  if (!assembler.isFastPath) {
    for (const device of devices) device.stamp(ctx);
    return;
  }
  const { steps } = programFor(assembler, devices, 'static');
  const gv = assembler.gValues;
  for (let s = 0; s < steps.length; s++) {
    const step = steps[s];
    if (step.device !== null) {
      step.device.stamp(ctx);
      continue;
    }
    const run = step.run as readonly Resistor[];
    const slots = step.slots;
    for (let i = 0, k = 0; i < run.length; i++, k += 4) {
      const g = 1 / run[i].resistance;
      const s11 = slots[k];
      const s22 = slots[k + 1];
      const s12 = slots[k + 2];
      if (s11 >= 0) gv[s11] += g;
      if (s22 >= 0) gv[s22] += g;
      if (s12 >= 0) {
        gv[s12] += -g;
        gv[slots[k + 3]] += -g;
      }
    }
  }
}

/**
 * Equivalent to `for (const d of devices) d.stampDynamic!(ctx)`. Every device
 * in `devices` must implement `stampDynamic`.
 */
export function stampDynamicDevices(
  assembler: MNAAssembler, devices: readonly DeviceModel[], ctx: StampContext,
): void {
  if (!assembler.isFastPath) {
    for (const device of devices) device.stampDynamic!(ctx);
    return;
  }
  const { steps } = programFor(assembler, devices, 'dynamic');
  const cv = assembler.cValues;
  for (let s = 0; s < steps.length; s++) {
    const step = steps[s];
    if (step.device !== null) {
      step.device.stampDynamic!(ctx);
      continue;
    }
    const run = step.run as readonly Capacitor[];
    const slots = step.slots;
    for (let i = 0, k = 0; i < run.length; i++, k += 4) {
      const c = run[i].capacitance;
      const s11 = slots[k];
      const s22 = slots[k + 1];
      const s12 = slots[k + 2];
      if (s11 >= 0) cv[s11] += c;
      if (s22 >= 0) cv[s22] += c;
      if (s12 >= 0) {
        cv[s12] += -c;
        cv[slots[k + 3]] += -c;
      }
    }
  }
}
