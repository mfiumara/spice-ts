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
  readonly steps: readonly Step[];
}

/** Per (assembler, device list) cache entry. */
interface Entry {
  /** Value storage the slots index; a relock allocates new storage. */
  readonly values: Float64Array;
  readonly length: number;
  /** Fast-path passes stamped per device before the program was built. */
  passes: number;
  program: Program | undefined;
}

/**
 * Fast-path passes stamped device by device before a program is built.
 * Building resolves every slot once, which only pays off when the list is
 * stamped repeatedly (transient Newton) rather than a few times (a linear
 * operating point converges in a couple of iterations).
 */
const PASSES_BEFORE_PROGRAM = 2;

type Kind = 'static' | 'dynamic';

/** Program caches per assembler and device list: [static, dynamic]. */
const programs: WeakMap<MNAAssembler, Map<readonly DeviceModel[], Entry>>[] = [
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

/**
 * Write the four slots a plain two-terminal stamp touches at `slots[k..k+3]`.
 * False if any lies outside the locked topology.
 */
function writeTwoTerminalSlots(
  index: (row: number, col: number) => number, device: DeviceModel, slots: Int32Array, k: number,
): boolean {
  const n1 = device.nodes[0];
  const n2 = device.nodes[1];
  try {
    slots[k] = n1 >= 0 ? index(n1, n1) : -1;
    slots[k + 1] = n2 >= 0 ? index(n2, n2) : -1;
    slots[k + 2] = n1 >= 0 && n2 >= 0 ? index(n1, n2) : -1;
    slots[k + 3] = n1 >= 0 && n2 >= 0 ? index(n2, n1) : -1;
    return true;
  } catch {
    // Not in the locked pattern: the device's own stamp reports it.
    return false;
  }
}

function buildProgram(assembler: MNAAssembler, devices: readonly DeviceModel[], kind: Kind): Program {
  const index = assembler.stampIndex;
  const steps: Step[] = [];
  const scratch = new Int32Array(4 * devices.length);
  let run: (Resistor | Capacitor)[] = [];
  const flush = (): void => {
    if (run.length === 0) return;
    steps.push({ device: null, run, slots: scratch.slice(0, 4 * run.length) });
    run = [];
  };
  for (const device of devices) {
    // A plain capacitor's static stamp is empty: skipping it adds nothing.
    if (kind === 'static' && isPlainCapacitor(device)) continue;
    const kernel = kind === 'static' ? isPlainResistor(device) : isPlainCapacitor(device);
    if (kernel && writeTwoTerminalSlots(index, device, scratch, 4 * run.length)) {
      run.push(device as Resistor | Capacitor);
      continue;
    }
    flush();
    steps.push({ device, run: [], slots: new Int32Array(0) });
  }
  flush();
  return { steps };
}

/** The list's program, or undefined while it should still be stamped device by device. */
function programFor(
  assembler: MNAAssembler, devices: readonly DeviceModel[], kind: Kind,
): Program | undefined {
  const cache = programs[kind === 'static' ? 0 : 1];
  let byList = cache.get(assembler);
  if (byList === undefined) {
    byList = new Map();
    cache.set(assembler, byList);
  }
  const values = kind === 'static' ? assembler.gValues : assembler.cValues;
  let entry = byList.get(devices);
  if (entry === undefined || entry.values !== values || entry.length !== devices.length) {
    entry = { values, length: devices.length, passes: 0, program: undefined };
    byList.set(devices, entry);
  }
  if (entry.program === undefined) {
    if (entry.passes < PASSES_BEFORE_PROGRAM) {
      entry.passes++;
      return undefined;
    }
    entry.program = buildProgram(assembler, devices, kind);
  }
  return entry.program;
}

/**
 * Equivalent to `for (const d of devices) d.stamp(ctx)`, with `ctx` the
 * assembler's current stamp context.
 */
export function stampStaticDevices(
  assembler: MNAAssembler, devices: readonly DeviceModel[], ctx: StampContext,
): void {
  const program = assembler.isFastPath ? programFor(assembler, devices, 'static') : undefined;
  if (program === undefined) {
    for (const device of devices) device.stamp(ctx);
    return;
  }
  const { steps } = program;
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
  const program = assembler.isFastPath ? programFor(assembler, devices, 'dynamic') : undefined;
  if (program === undefined) {
    for (const device of devices) device.stampDynamic!(ctx);
    return;
  }
  const { steps } = program;
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
