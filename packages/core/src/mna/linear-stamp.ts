import type { MNAAssembler } from './assembler.js';
import { DEVICE_GMIN, type DeviceModel, type StampContext } from '../devices/device.js';
import { Resistor, resistorConductanceRevision } from '../devices/resistor.js';
import { Capacitor, capacitorCapacitanceRevision } from '../devices/capacitor.js';
import { MOSFET } from '../devices/mosfet.js';

/**
 * Stamp programs for device lists stamped every Newton iteration (issues
 * #570, #625).
 *
 * Every Newton iteration restamps every device. For a plain conductance-form
 * {@link Resistor} or a {@link Capacitor} that is a megamorphic `stamp` call,
 * an array destructure and up to four `ctx.stampG`/`ctx.stampC` calls, each
 * looking up its value slot. On large linear decks (the M2 RC ladder) that
 * dispatch dominated self time. A level-1 {@link MOSFET} makes up to eleven
 * such `ctx.stampG` calls per stamp; lists that still reach `stamp` (the
 * trapezoidal history restamp, operating points on an already locked
 * assembler) spent more time there than the batch-stamped companion build.
 *
 * A program walks the same device list in the same order. Each maximal run of
 * consecutive plain resistors (or capacitors) is stamped by one tight loop
 * from value slots resolved once per locked topology, and each maximal run of
 * consecutive plain MOSFETs by {@link MOSFET.batchStamp}, which performs the
 * same additions as {@link MOSFET.stamp} from cached slots. Every other device
 * is still stamped through its own method. Resistor conductances and
 * capacitor capacitances are copied into a typed array per run and recopied
 * whenever any of them is written (a class-wide revision the property setters
 * bump, #890), so parameter changes apply as before without the kernel
 * reading one device object per entry; MOSFETs read the solution vector at
 * stamp time. Each slot receives exactly the additions the
 * devices would make, in the same order, so matrices are bit-identical to
 * per-device stamping.
 */

/** Step kernel: a single device stamped through its own method. */
const KERNEL_DEVICE = 0;
/** Step kernel: a run of plain resistors (static) or capacitors (dynamic). */
const KERNEL_TWO_TERMINAL = 1;
/** Step kernel: a run of plain level-1 MOSFETs (static programs only). */
const KERNEL_MOSFET = 2;

/** One run of kernel devices, or a single device stamped through its own method. */
interface Step {
  readonly kernel: typeof KERNEL_DEVICE | typeof KERNEL_TWO_TERMINAL | typeof KERNEL_MOSFET;
  /** Device stamped through its own method; null for a kernel run. */
  readonly device: DeviceModel | null;
  /** Two-terminal run devices (resistors in a static program, capacitors in a dynamic one). */
  readonly run: readonly (Resistor | Capacitor)[];
  /** Four value slots per two-terminal run device: (n1,n1), (n2,n2), (n1,n2), (n2,n1); -1 = not stamped. */
  readonly slots: Int32Array;
  /**
   * Conductance (static) or capacitance (dynamic) of each run device, copied
   * when {@link revision} last changed (issue #890). Reading a typed array
   * instead of one object per device is what makes the kernel fast.
   */
  readonly values: Float64Array;
  /** Resistor/capacitor value revision {@link values} was filled at; -1 = never. */
  revision: number;
  /** MOSFET run devices, in netlist order. */
  readonly mosfets: MOSFET[];
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

const NO_SLOTS = new Int32Array(0);
const NO_VALUES = new Float64Array(0);

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

/** Exactly a MOSFET (no subclass, no own override). */
function isPlainMosfet(device: DeviceModel): device is MOSFET {
  return Object.getPrototypeOf(device) === MOSFET.prototype
    && !Object.hasOwn(device, 'stamp');
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
  // At most one of the two runs is open at a time, so runs never mix and
  // netlist order is kept.
  let run: (Resistor | Capacitor)[] = [];
  let mosfets: MOSFET[] = [];
  const flush = (): void => {
    if (run.length > 0) {
      steps.push({
        kernel: KERNEL_TWO_TERMINAL, device: null, run, slots: scratch.slice(0, 4 * run.length),
        values: new Float64Array(run.length), revision: -1, mosfets: [],
      });
      run = [];
    }
    if (mosfets.length > 0) {
      steps.push({
        kernel: KERNEL_MOSFET, device: null, run: [], slots: NO_SLOTS, values: NO_VALUES, revision: -1, mosfets,
      });
      mosfets = [];
    }
  };
  for (const device of devices) {
    // A plain capacitor's static stamp is empty: skipping it adds nothing.
    if (kind === 'static' && isPlainCapacitor(device)) continue;
    if (kind === 'static' ? isPlainResistor(device) : isPlainCapacitor(device)) {
      if (mosfets.length > 0) flush();
      if (writeTwoTerminalSlots(index, device, scratch, 4 * run.length)) {
        run.push(device as Resistor | Capacitor);
        continue;
      }
    } else if (kind === 'static' && isPlainMosfet(device)) {
      if (run.length > 0) flush();
      if (device.canBatchStamp(index)) {
        mosfets.push(device);
        continue;
      }
    }
    // Not a kernel device, or not in the locked pattern: its own stamp
    // handles (or reports) it.
    flush();
    steps.push({
      kernel: KERNEL_DEVICE, device, run: [], slots: NO_SLOTS, values: NO_VALUES, revision: -1, mosfets: [],
    });
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
 * Copy the run's current conductances (resistor run) or capacitances
 * (capacitor run) into `step.values` and record `revision`. Every write of a
 * resistor conductance or capacitor capacitance bumps its class revision, so
 * values copied at an unchanged revision equal the device fields exactly.
 */
function refillValues(step: Step, revision: number): Float64Array {
  const { run, values } = step;
  for (let i = 0; i < run.length; i++) {
    const device = run[i];
    values[i] = device instanceof Resistor ? device.conductance : device.capacitance;
  }
  step.revision = revision;
  return values;
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
  const revision = resistorConductanceRevision();
  for (let s = 0; s < steps.length; s++) {
    const step = steps[s];
    if (step.kernel === KERNEL_DEVICE) {
      step.device!.stamp(ctx);
      continue;
    }
    if (step.kernel === KERNEL_MOSFET) {
      // MOSFET.stamp reads ctx.getVoltage (the assembler solution) and adds
      // through ctx.stampG/stampB into gValues and b; batchStamp performs the
      // same additions in the same order from cached slots.
      MOSFET.batchStamp(
        step.mosfets, gv, assembler.b, assembler.solution, assembler.stampIndex,
        ctx.gmin ?? DEVICE_GMIN,
      );
      continue;
    }
    const conductances = step.revision === revision ? step.values : refillValues(step, revision);
    const slots = step.slots;
    for (let i = 0, k = 0; i < conductances.length; i++, k += 4) {
      const g = conductances[i];
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
  const revision = capacitorCapacitanceRevision();
  for (let s = 0; s < steps.length; s++) {
    const step = steps[s];
    if (step.kernel === KERNEL_DEVICE) {
      step.device!.stampDynamic!(ctx);
      continue;
    }
    const capacitances = step.revision === revision ? step.values : refillValues(step, revision);
    const slots = step.slots;
    for (let i = 0, k = 0; i < capacitances.length; i++, k += 4) {
      const c = capacitances[i];
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
