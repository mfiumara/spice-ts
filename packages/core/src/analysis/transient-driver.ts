import type { Circuit, CompiledCircuit } from '../circuit.js';
import type {
  ConvergenceTelemetry, IntegrationMethod, SimulationOptions, ResolvedOptions, TransientStep,
} from '../types.js';
import { resolveOptions, withNetlistOptions } from '../types.js';
import { parse, parseAsync } from '../parser/index.js';
import { createMatrixVariableIdentities, MNAAssembler } from '../mna/assembler.js';
import { solveDCOperatingPoint } from './dc.js';
import { attemptStep } from './transient-step.js';
import { ConvergenceError, TimestepTooSmallError, InvalidCircuitError } from '../errors.js';
import { BreakpointQueue } from './breakpoint-queue.js';
import { TransientProgressMonitor } from './transient-progress.js';
import { computeUICInitialSolution } from './uic.js';
import {
  createConvergenceTelemetry, resetConvergenceTelemetry, snapshotConvergenceTelemetry,
} from '../convergence-telemetry.js';
import type { ProtocolExecutionGuard } from '../protocol/execution-guard.js';
import { Inductor } from '../devices/inductor.js';
import { maxTimestepOption } from './max-timestep.js';
import type { DeviceModel } from '../devices/device.js';

/**
 * Smallest allowed timestep (femtosecond). Must be small enough that LTE can
 * shrink dt to satisfy accuracy at fast switching edges (rise/fall ~100 ns).
 * Raising this above ~1e-13 causes the LTE bypass to trigger pathologically
 * often on hard-switching circuits like the buck, inflating timepoint counts
 * by 10–15× — keep at 1e-15.
 */
const MIN_TIMESTEP = 1e-15;
/**
 * Below this floor, voltage-predictor LTE estimates are dominated by the
 * conditioning of reactive companion matrices rather than useful truncation
 * error information. Let converged steps grow out of that numerical regime.
 */
const MIN_LTE_TIMESTEP = 100 * MIN_TIMESTEP;
const NR_VOLTAGE_LIMIT = 3.5;
/**
 * After this many consecutive LTE rejections, stop LTE-checking to avoid
 * pathological shrink loops on stiff problems. SPICE-convention heuristic.
 */
const MAX_LTE_REJECTS_BEFORE_BYPASS = 10;

/**
 * On NR failure, divide dt by this factor and retry. ngspice `dctran.c` uses 8.
 * GMIN stepping is NOT applied per-step here — it's a DC-OP technique and
 * committing GMIN-distorted solutions as real output samples breaks LC tanks,
 * boost converters, and other reactive circuits (see issues #42, #43, #45).
 */
const DT_CUT_FACTOR = 8;

/**
 * "Indistinguishably close" threshold for a step landing on a breakpoint.
 * ngspice calls this CKTminBreak; we use 10× MIN_TIMESTEP so the snap is
 * always well above floating-point noise but far below any real timestep.
 */
const MIN_BREAK = 1e-14;

/** dt is divided by this on the first step after a breakpoint (ngspice dctran.c). */
const POST_BREAK_DT_CUT = 10;

/** First step after a t=0 breakpoint spans at most this fraction of the next gap (ngspice). */
const START_BREAK_GAP_FRACTION = 0.1;

/** ngspice dctran.c initial delta: MIN(TSTOP / 100, TSTEP) / 10. */
const INITIAL_STEP_STOP_DIVISOR = 100;
const INITIAL_STEP_DIVISOR = 10;

/** ngspice dctran.c initial CKTsaveDelta: TSTOP / 50. */
const SAVE_DELTA_STOP_DIVISOR = 50;

/** ngspice dctran.c CKTdelmin = 1e-11 x CKTmaxStep; a breakpoint step stays above 2 x delmin. */
const DELMIN_FRACTION = 1e-11;

/** Keep implicit-breakpoint recovery local while still crossing a vanished branch. */
const IMPLICIT_BREAK_DT_CUT = 5;

/**
 * A trial step whose charge truncation bound falls below this fraction of the
 * step is rejected (ngspice dctran.c: `newdelta > .9 * CKTdelta` accepts).
 */
const CHARGE_LTE_ACCEPT_FRACTION = 0.9;

/** Assembler stamp-pass kind of the trapezoidal history restamp (stampPrevB). */
const HISTORY_STAMP_PASS = 1;

/** Switch away from trapezoidal integration after a sustained NR retry cycle. */
const MAX_TRAP_NR_RETRIES = 1_024;

/**
 * Resumable transient simulation driver.
 *
 * Call {@link createTransientSim} to obtain one. Use {@link advance} or
 * {@link advanceUntil} to step the simulation forward, {@link reset} to
 * restart at t=0, and {@link dispose} when done.
 */
export interface TransientSim {
  readonly simTime: number;
  readonly stopTime: number | undefined;
  readonly isDone: boolean;
  /** Immutable snapshot of convergence counters accumulated so far. */
  readonly convergence: ConvergenceTelemetry;

  /** Advance one converged timestep. Throws {@link ConvergenceError} on failure. */
  advance(): TransientStep;
  /** Convenience: loop {@link advance} until `simTime >= targetTime`. */
  advanceUntil(targetTime: number): TransientStep[];
  /** Re-run DC operating point, clear history, reset simTime to 0. */
  reset(): void;
  /** Release solver memory. Subsequent calls throw. */
  dispose(): void;
}

export interface TransientSimOptions extends SimulationOptions {
  stopTime?: number;
  timestep?: number;
  maxTimestep?: number;
}

export async function createTransientSim(
  input: string | Circuit,
  options?: TransientSimOptions,
): Promise<TransientSim> {
  let circuit: Circuit;
  if (typeof input === 'string') {
    circuit = options?.resolveInclude
      ? await parseAsync(input, options.resolveInclude)
      : parse(input);
  } else {
    circuit = input;
  }
  const compiled = circuit.compile();
  const effectiveOptions = withNetlistOptions<TransientSimOptions>(compiled.simulationOptions, options);
  validateCircuit(compiled);

  const tranAnalysis = compiled.analyses.find(a => a.type === 'tran');
  const stopTime = effectiveOptions.stopTime ?? (tranAnalysis?.type === 'tran' ? tranAnalysis.stopTime : undefined);
  const timestep = effectiveOptions.timestep ?? (tranAnalysis?.type === 'tran' ? tranAnalysis.timestep : undefined) ?? (stopTime ? stopTime / 50 : 1e-6);
  const maxTimestep = maxTimestepOption(effectiveOptions.maxTimestep)
    ?? (stopTime ? Math.min(timestep, stopTime / 50) : timestep * 10);

  const resolved = resolveOptions(effectiveOptions, stopTime);

  return new TransientSimImpl(compiled, resolved, {
    stopTime, timestep, maxTimestep,
    initialSolution: tranAnalysis?.type === 'tran' && tranAnalysis.useInitialConditions
      ? computeUICInitialSolution(compiled)
      : undefined,
  });
}

interface InternalTransientConfig {
  stopTime: number | undefined;
  timestep: number;
  maxTimestep: number;
  /** Optional pre-computed DC solution. When provided, skips internal DC op point. */
  initialSolution?: Float64Array;
  /** Shared aggregate used by one-shot simulations. */
  convergence?: ConvergenceTelemetry;
  /** Cooperative guard used by bounded protocol executions. */
  guard?: ProtocolExecutionGuard;
}

class TransientSimImpl implements TransientSim {
  private assembler: MNAAssembler;
  private options: ResolvedOptions;
  private config: InternalTransientConfig;
  private compiled: CompiledCircuit;
  private convergenceTelemetry: ConvergenceTelemetry;
  private readonly useStaticCurrentHistory: boolean;
  private readonly useDampedInductiveRecovery: boolean;
  /** Devices with an ngspice DEVtrunc charge truncation-error hook. */
  private readonly truncatingDevices: readonly DeviceModel[];

  private time = 0;
  private dt: number;
  private prevB: Float64Array | undefined;
  private historyWorkspace: Float64Array | undefined;
  private secondPrevSol: Float64Array | undefined;
  private prevDt: number;
  /** Accepted step before {@link prevDt} (ngspice CKTdeltaOld[2]). */
  private prevPrevDt: number;
  private integrationMethod: IntegrationMethod;
  private trapNrRetries = 0;
  private lteRejectCount = 0;
  private disposed = false;
  private breakpoints: BreakpointQueue;
  private justCrossedBreakpoint = false;
  /**
   * Take the next step at order 1 (Backward Euler) without higher-order
   * history. Set when a device reports a breakpoint at t=0: the DC operating
   * point carries no derivative information, so a trapezoidal first step
   * across that kink treats the new source slope as if it had always existed
   * and leaves an undamped +/- ringing in algebraic reactive voltages
   * (ngspice dctran.c integrates the first step at order 1). The progress
   * monitor requests the same restart when that ringing appears behind a
   * slope discontinuity no device reports as a breakpoint.
   */
  private orderOnePending = false;
  private progress: TransientProgressMonitor;

  constructor(compiled: CompiledCircuit, options: ResolvedOptions, config: InternalTransientConfig) {
    this.compiled = compiled;
    this.options = options;
    this.config = config;
    this.convergenceTelemetry = config.convergence ?? createConvergenceTelemetry();
    for (const device of compiled.devices) device.setTransientTimestep?.(config.timestep);
    // Voltage-dependent capacitances stamped as C(v) need charge state, which
    // the C-matrix companion does not keep. Preserve their established
    // companion history while using the exact static residual for constant-C
    // circuits. Devices that integrate their own charge keep that state.
    // A nonlinear device that stores no charge (e.g. a diode without CJO, CJSW
    // or TT) is static: the raw-RHS history would pair the new Newton
    // conductance with the old operating point and misintegrate its current.
    // Source breakpoints do not change this (#482): ngspice NIintegrate keeps
    // the accepted capacitor current across PULSE/PWL corners too, and the
    // first step after a breakpoint drops the history (Backward Euler) anyway.
    this.useStaticCurrentHistory = !compiled.devices.some(device => (
      (device.isNonlinear && device.stampDynamic !== undefined
        && device.storesCharge !== false && !device.integratesTransientCharge)
    ));
    this.useDampedInductiveRecovery = compiled.devices.some(device => device instanceof Inductor)
      && compiled.devices.some(device => device.isNonlinear);
    this.truncatingDevices = compiled.devices.filter(device => device.truncateTransientStep !== undefined);
    this.dt = Math.min(config.timestep, config.maxTimestep);
    this.prevDt = this.dt;
    this.prevPrevDt = this.dt;
    this.integrationMethod = options.integrationMethod;

    this.assembler = this.createAssembler();

    if (config.initialSolution) {
      // Caller already computed DC — skip internal DC and seed directly.
      this.assembler.solution.set(config.initialSolution);
    } else {
      this.initDC();
    }
    this.acceptTransientStep();
    this.stampPrevB();

    this.breakpoints = this.collectBreakpoints();
    this.progress = new TransientProgressMonitor(config.maxTimestep);
  }

  get simTime(): number { return this.time; }
  get stopTime(): number | undefined { return this.config.stopTime; }
  get isDone(): boolean {
    return this.config.stopTime !== undefined && this.time >= this.config.stopTime - MIN_TIMESTEP;
  }
  get convergence(): ConvergenceTelemetry {
    return snapshotConvergenceTelemetry(this.convergenceTelemetry);
  }

  advance(): TransientStep {
    if (this.disposed) throw new InvalidCircuitError('TransientSim has been disposed');

    const prevSol = new Float64Array(this.assembler.solution);
    let discontinuityRecoveryAttempted = false;

    while (true) {
      if (this.justCrossedBreakpoint) {
        // ngspice dctran.c convention: drop 2nd-order history and take a
        // tiny Backward-Euler step to settle through the edge, then let LTE
        // grow dt back up. Both prevB (trap) and secondPrevSol (gear2) being
        // undefined makes the companion fall back to BE for one step.
        this.secondPrevSol = undefined;
        this.prevB = undefined;
        this.lteRejectCount = 0;
        this.dt = Math.max(this.dt / POST_BREAK_DT_CUT, MIN_TIMESTEP);
        this.justCrossedBreakpoint = false;
      }

      // Guard against dt=0 when caller advance()s past a done simulation.
      // stopTime clamping below can drive dt to 0 exactly at the boundary;
      // once past stopTime we just continue at the configured timestep.
      if (this.dt <= 0) {
        this.dt = Math.min(this.config.timestep, this.config.maxTimestep);
      }

      let nextTime = this.time + this.dt;
      if (this.config.stopTime !== undefined && this.time < this.config.stopTime) {
        nextTime = Math.min(nextTime, this.config.stopTime);
      }
      const nextBreak = this.breakpoints.peek();
      if (nextBreak !== undefined && nextTime >= nextBreak - MIN_BREAK) {
        // Snap to the breakpoint — either we'd cross it, or we're within
        // tolerance and would leave a microscopic leftover step on the
        // other side.
        nextTime = nextBreak;
      }
      const actualDt = nextTime - this.time;

      this.assembler.solution.set(prevSol);
      const result = attemptStep(
        {
          compiled: this.compiled, assembler: this.assembler, options: this.options,
          guard: this.config.guard,
        },
        {
          dt: actualDt,
          time: nextTime,
          prevSolution: prevSol,
          prevB: this.orderOnePending ? undefined : this.prevB,
          gmin: this.options.gmin,
          voltageLimit: NR_VOLTAGE_LIMIT,
          prevPrevSolution: this.secondPrevSol,
          prevDt: this.secondPrevSol ? this.prevDt : undefined,
          integrationMethod: this.integrationMethod,
          staticCurrentHistory: this.useStaticCurrentHistory,
        },
      );

      this.convergenceTelemetry.transient.newtonIterations += result.iterations;

      if (!result.ok) {
        // ngspice dctran.c convention: aggressive dt cut, no per-step GMIN
        // stepping. Committing GMIN-distorted solutions breaks reactive
        // circuits (LC tank, boost, rectifier — see issues #42, #43, #45).
        this.convergenceTelemetry.transient.rejectedSteps++;
        this.convergenceTelemetry.transient.nrRetries++;
        if (
          this.integrationMethod === 'trapezoidal'
          && ++this.trapNrRetries === (this.useDampedInductiveRecovery ? 1 : MAX_TRAP_NR_RETRIES)
        ) {
          // A trap/Newton grow-fail-cut cycle can hold dt near the numerical
          // floor indefinitely while one-shot result arrays keep growing.
          // Nonlinear inductive systems can enter that cycle on the first trap
          // failure, so move them immediately to damped Backward Euler. Other
          // systems retain the established sustained-retry Gear-2 fallback.
          // Drop history and retry this timepoint without a timestep cut.
          // This is a global convergence safeguard, not output decimation.
          this.integrationMethod = this.useDampedInductiveRecovery ? 'euler' : 'gear2';
          this.prevB = undefined;
          this.secondPrevSol = undefined;
          this.assembler.solution.set(prevSol);
          continue;
        }
        this.dt = this.dt / DT_CUT_FACTOR;
        if (this.dt < MIN_TIMESTEP) {
          if (result.oscillated && !discontinuityRecoveryAttempted) {
            // A regenerative transition can create an implicit breakpoint
            // that no independent source reports. Shrinking dt follows the
            // disappearing branch into the femtosecond floor. Drop higher-
            // order history as at an explicit breakpoint, but keep the first
            // Backward-Euler recovery step local to the last accepted point.
            // Subsequent steps retain history and resume LTE-controlled growth.
            this.prevB = undefined;
            this.secondPrevSol = undefined;
            const recoveryCeiling = Math.min(this.config.timestep, this.config.maxTimestep);
            this.dt = Math.max(recoveryCeiling / IMPLICIT_BREAK_DT_CUT, MIN_TIMESTEP);
            discontinuityRecoveryAttempted = true;
            continue;
          }
          this.convergenceTelemetry.transient.failure = 'dt-floor';
          throw new TimestepTooSmallError(
            this.time, this.dt, snapshotConvergenceTelemetry(this.convergenceTelemetry),
          );
        }
        this.assembler.solution.set(prevSol);
        continue;
      }

      const sol = result.solution;
      const lteVerified = this.lteChecked(actualDt);
      const lteRatio = this.checkLTE(sol, prevSol, actualDt);
      const chargeBound = this.chargeTruncationTimestep(actualDt);
      if (lteRatio > 1 || chargeBound < CHARGE_LTE_ACCEPT_FRACTION * actualDt) {
        const factor = lteRatio > 1 ? Math.max(0.25, 0.9 / Math.sqrt(lteRatio)) : 1;
        this.dt = Math.max(Math.min(actualDt * factor, chargeBound), MIN_TIMESTEP);
        this.assembler.solution.set(prevSol);
        this.lteRejectCount++;
        this.progress.lteRejected();
        this.convergenceTelemetry.transient.rejectedSteps++;
        this.convergenceTelemetry.transient.lteRetries++;
        continue;
      }
      this.lteRejectCount = 0;

      // Device-owned histories must observe only committed solutions. In
      // particular, NR/LTE retries and the stampPrevB restamp below are not
      // accepted timepoints and must remain side-effect free.
      this.acceptTransientStep();
      // Update trapezoidal history.
      if (this.integrationMethod === 'trapezoidal') {
        this.stampPrevB();
      }
      this.secondPrevSol = prevSol;
      this.prevPrevDt = this.prevDt;
      this.prevDt = actualDt;
      this.time = nextTime;
      this.orderOnePending = false;
      this.convergenceTelemetry.transient.acceptedSteps++;
      const minimum = this.convergenceTelemetry.transient.minimumAcceptedTimestep;
      this.convergenceTelemetry.transient.minimumAcceptedTimestep = minimum === null
        ? actualDt
        : Math.min(minimum, actualDt);

      if (this.breakpoints.isNear(this.time)) {
        this.breakpoints.pop();
        this.justCrossedBreakpoint = true;
      }

      const progress = this.progress.accept(this.time, actualDt, lteVerified);
      if (progress === 'stalled') {
        this.convergenceTelemetry.transient.failure = 'lte-cascade';
        const error = new ConvergenceError(
          `Transient step loop stopped advancing: dt=${actualDt}`
            + ' after a window of accepted steps without timestep growth',
          this.time, [], sol, prevSol, 'lte-cascade', actualDt, this.options.gmin,
        );
        error.convergence = snapshotConvergenceTelemetry(this.convergenceTelemetry);
        throw error;
      }
      if (progress === 'reduce-order') {
        // LTE could not be satisfied at any dt down to the floor. Restart
        // integration at order 1 from this accepted point, exactly as after
        // an explicit breakpoint but without cutting dt.
        this.orderOnePending = true;
        this.secondPrevSol = undefined;
      }

      const growFactor = lteRatio > 0.001 ? Math.min(2.0, 0.9 / Math.sqrt(lteRatio)) : 2.0;
      // Guard against `stopTime - this.time === 0` at the boundary: that would
      // set dt=0, which causes division-by-zero in companion stamps if the
      // caller keeps calling advance() past isDone=true.
      const remaining = this.config.stopTime !== undefined && this.config.stopTime > this.time
        ? this.config.stopTime - this.time
        : Infinity;
      // When a breakpoint was just crossed, suppress the LTE-based grow so that
      // the /POST_BREAK_DT_CUT at the top of the next iteration starts from the
      // raw step size, not an already-doubled value. The next advance() will cut
      // this.dt by POST_BREAK_DT_CUT and let LTE regrow from there.
      // ngspice CKTtrunc: the next step is at most the charge truncation bound.
      const dtBase = this.justCrossedBreakpoint ? actualDt : Math.min(actualDt * growFactor, chargeBound);
      this.dt = Math.min(dtBase, this.config.maxTimestep, remaining);

      return this.buildStep(sol);
    }
  }

  advanceUntil(targetTime: number): TransientStep[] {
    const steps: TransientStep[] = [];
    while (this.time < targetTime) {
      steps.push(this.advance());
      if (this.isDone) break;
    }
    return steps;
  }

  reset(): void {
    if (this.disposed) throw new InvalidCircuitError('TransientSim has been disposed');
    for (const device of this.compiled.devices) device.resetTransient?.();
    this.assembler = this.createAssembler();
    this.time = 0;
    this.dt = Math.min(this.config.timestep, this.config.maxTimestep);
    this.prevDt = this.dt;
    this.prevPrevDt = this.dt;
    this.integrationMethod = this.options.integrationMethod;
    this.trapNrRetries = 0;
    this.prevB = undefined;
    this.secondPrevSol = undefined;
    this.lteRejectCount = 0;
    this.justCrossedBreakpoint = false;
    this.progress.reset();
    resetConvergenceTelemetry(this.convergenceTelemetry);
    if (this.config.initialSolution) {
      this.assembler.solution.set(this.config.initialSolution);
    } else {
      this.initDC();
    }
    this.acceptTransientStep();
    this.stampPrevB();
    this.breakpoints = this.collectBreakpoints();
  }

  dispose(): void {
    this.disposed = true;
  }

  /** Returns the current state at t=0 (or whatever the current simTime is) as a TransientStep. */
  peekInitialStep(): TransientStep {
    return this.buildStep(this.assembler.solution);
  }

  /** Test-only accessor; returns the remaining breakpoints in order. */
  breakpointTimes(): readonly number[] {
    return this.breakpoints.remaining();
  }

  /**
   * Collect breakpoints after t=0 and size the first step. As in ngspice
   * dctran.c, t=0 is always a breakpoint (#532): the first step starts at
   * MIN(TSTOP/100, TSTEP)/10 capped by TMAX, is limited to 0.1 x MIN(TSTOP/50,
   * gap to the next breakpoint), is cut by POST_BREAK_DT_CUT for the initial
   * timepoint and integrates at order 1, so it cannot skip a large part of a
   * source period and its first-order error stays local.
   */
  private collectBreakpoints(): BreakpointQueue {
    const stop = this.config.stopTime;
    this.orderOnePending = false;
    if (stop === undefined) return new BreakpointQueue([], MIN_BREAK);
    const times: number[] = [];
    for (const d of this.compiled.devices) {
      if (d.getBreakpoints) times.push(...d.getBreakpoints(stop));
    }
    const queue = new BreakpointQueue(times, MIN_BREAK);
    this.orderOnePending = true;
    const { timestep, maxTimestep } = this.config;
    const firstGap = queue.peek() ?? stop;
    const initial = Math.min(Math.min(stop / INITIAL_STEP_STOP_DIVISOR, timestep) / INITIAL_STEP_DIVISOR, maxTimestep);
    const limited = Math.min(initial, START_BREAK_GAP_FRACTION * Math.min(stop / SAVE_DELTA_STOP_DIVISOR, firstGap));
    this.dt = Math.max(limited / POST_BREAK_DT_CUT, 2 * DELMIN_FRACTION * maxTimestep, MIN_TIMESTEP);
    return queue;
  }

  private createAssembler(): MNAAssembler {
    return new MNAAssembler(this.compiled.nodeCount, this.compiled.branchCount, {
      variables: createMatrixVariableIdentities(
        this.compiled.nodeNames,
        this.compiled.branchNames,
      ),
    });
  }

  private stampPrevB(): void {
    if (this.integrationMethod !== 'trapezoidal') return;
    this.assembler.clear();
    // A separate stamp-pass kind: this restamp's device sequence differs from
    // the companion build's, so they keep separate slot caches.
    const ctx = this.assembler.getStampContext(HISTORY_STAMP_PASS);
    for (const d of this.compiled.devices) d.stamp(ctx);
    // Charge currents accepted at x(n) belong to the static side of the KCL
    // that defines the trapezoidal history of the linear reactive elements.
    for (const d of this.compiled.devices) {
      if (d.integratesTransientCharge) d.stampAcceptedChargeCurrent?.(ctx);
    }
    const current = this.historyWorkspace ??= new Float64Array(this.assembler.systemSize);
    if (!this.useStaticCurrentHistory) {
      current.set(this.assembler.b);
      this.prevB = current;
      return;
    }
    current.fill(0);
    if (this.assembler.isFastPath) {
      const { colPtr, rowIdx, gValues } = this.assembler;
      for (let column = 0; column < this.assembler.systemSize; column++) {
        const voltage = this.assembler.solution[column];
        if (voltage === 0) continue;
        for (let position = colPtr[column]; position < colPtr[column + 1]; position++) {
          current[rowIdx[position]] += gValues[position] * voltage;
        }
      }
    } else {
      for (let row = 0; row < this.assembler.systemSize; row++) {
        for (const [column, value] of this.assembler.G.getRow(row)) {
          current[row] += value * this.assembler.solution[column];
        }
      }
    }
    for (let row = 0; row < current.length; row++) current[row] -= this.assembler.b[row];
    for (let node = 0; node < this.compiled.nodeCount; node++) {
      current[node] += this.options.gmin * this.assembler.solution[node];
    }
    this.prevB = current;
  }

  private acceptTransientStep(): void {
    const ctx = this.assembler.getStampContext();
    for (const device of this.compiled.devices) device.acceptTransientStep?.(ctx);
  }

  private initDC(): void {
    const { assembler: dcAsm } = solveDCOperatingPoint(
      this.compiled, this.options, undefined, this.convergenceTelemetry, 'transient',
      this.config.guard,
    );
    this.assembler.solution.set(dcAsm.solution);
  }

  /** Whether {@link checkLTE} will evaluate truncation error for this step. */
  private lteChecked(dt: number): boolean {
    return this.secondPrevSol !== undefined
      && dt > MIN_LTE_TIMESTEP
      && this.lteRejectCount < MAX_LTE_REJECTS_BEFORE_BYPASS;
  }

  private checkLTE(current: Float64Array, previous: Float64Array, dt: number): number {
    if (!this.lteChecked(dt) || !this.secondPrevSol) return 0;
    let maxRatio = 0;
    // 2nd-order methods (trap, gear2) have O(dt³) LTE → larger divider; BE is O(dt²).
    const method = this.integrationMethod;
    const divider = method === 'trapezoidal' || method === 'gear2' ? 3 : 2;
    const { nodeCount } = this.compiled;
    for (let i = 0; i < nodeCount; i++) {
      const slope = (previous[i] - this.secondPrevSol[i]) / this.prevDt;
      const predicted = previous[i] + dt * slope;
      const error = Math.abs(current[i] - predicted) / divider;
      const tol = this.options.trtol * (this.options.vntol + this.options.reltol * Math.abs(current[i]));
      if (tol > 0) {
        const ratio = error / tol;
        if (ratio > maxRatio) maxRatio = ratio;
      }
    }
    return maxRatio;
  }

  /**
   * ngspice CKTtrunc over the devices that integrate their own charges: the
   * smallest next timestep CKTterr allows on any device charge at the
   * converged trial solution held by the assembler. Infinity when no device
   * bounds the step. Gated like the voltage LTE so the reject-bypass and the
   * femtosecond floor still terminate stiff shrink loops.
   */
  private chargeTruncationTimestep(dt: number): number {
    if (
      this.truncatingDevices.length === 0
      || dt <= MIN_LTE_TIMESTEP
      || this.lteRejectCount >= MAX_LTE_REJECTS_BEFORE_BYPASS
    ) {
      return Infinity;
    }
    const ctx = this.assembler.getStampContext();
    const { reltol, abstol, chgtol, trtol } = this.options;
    const truncation = {
      deltas: [dt, this.prevDt, this.prevPrevDt] as const, reltol, abstol, chgtol, trtol,
    };
    let bound = Infinity;
    for (const device of this.truncatingDevices) {
      bound = Math.min(bound, device.truncateTransientStep!(ctx, truncation));
    }
    return bound;
  }

  private buildStep(solution: Float64Array): TransientStep {
    const { nodeNames, branchNames, nodeCount, nodeIndexMap } = this.compiled;
    const voltages = new Map<string, number>();
    for (const name of nodeNames) voltages.set(name, solution[nodeIndexMap.get(name)!]);
    const currents = new Map<string, number>();
    for (let i = 0; i < branchNames.length; i++) currents.set(branchNames[i], solution[nodeCount + i]);
    return { time: this.time, voltages, currents };
  }
}

function validateCircuit(compiled: CompiledCircuit): void {
  if (compiled.nodeCount === 0) throw new InvalidCircuitError('Circuit has no nodes');
}

/**
 * Internal constructor used by `solveTransient` / `streamTransient` to avoid
 * re-parsing circuits. Exposes `peekInitialStep()` for t=0 inspection.
 */
export function createDriverFromCompiled(
  compiled: CompiledCircuit,
  options: ResolvedOptions,
  config: {
    stopTime: number | undefined;
    timestep: number;
    maxTimestep: number;
    initialSolution?: Float64Array;
    convergence?: ConvergenceTelemetry;
    guard?: ProtocolExecutionGuard;
  },
): TransientSim & { peekInitialStep(): TransientStep } {
  const impl = new TransientSimImpl(compiled, options, {
    stopTime: config.stopTime,
    timestep: config.timestep,
    maxTimestep: config.maxTimestep,
    initialSolution: config.initialSolution,
    convergence: config.convergence,
    guard: config.guard,
  });
  return impl;
}
