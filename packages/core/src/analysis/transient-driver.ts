import type { Circuit, CompiledCircuit } from '../circuit.js';
import type { SimulationOptions, ResolvedOptions, TransientStep } from '../types.js';
import { resolveOptions } from '../types.js';
import { parse, parseAsync } from '../parser/index.js';
import { MNAAssembler } from '../mna/assembler.js';
import { createSparseSolver, type SparseSolver } from '../solver/sparse-solver.js';
import { solveDCOperatingPoint } from './dc.js';
import { attemptStep } from './transient-step.js';
import { TimestepTooSmallError, InvalidCircuitError } from '../errors.js';

const MIN_TIMESTEP = 1e-15;
const NR_VOLTAGE_LIMIT = 3.5;
/**
 * After this many consecutive LTE rejections, stop LTE-checking to avoid
 * pathological shrink loops on stiff problems. SPICE-convention heuristic.
 */
const MAX_LTE_REJECTS_BEFORE_BYPASS = 10;

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
  validateCircuit(compiled);

  const tranAnalysis = compiled.analyses.find(a => a.type === 'tran');
  const stopTime = options?.stopTime ?? (tranAnalysis?.type === 'tran' ? tranAnalysis.stopTime : undefined);
  const timestep = options?.timestep ?? (tranAnalysis?.type === 'tran' ? tranAnalysis.timestep : undefined) ?? (stopTime ? stopTime / 50 : 1e-6);
  const maxTimestep = options?.maxTimestep
    ?? (stopTime ? Math.min(timestep, stopTime / 50) : timestep * 10);

  const resolved = resolveOptions(options, stopTime);

  return new TransientSimImpl(compiled, resolved, {
    stopTime, timestep, maxTimestep,
  });
}

interface InternalTransientConfig {
  stopTime: number | undefined;
  timestep: number;
  maxTimestep: number;
}

class TransientSimImpl implements TransientSim {
  private assembler: MNAAssembler;
  private solver: SparseSolver;
  private options: ResolvedOptions;
  private config: InternalTransientConfig;
  private compiled: CompiledCircuit;

  private time = 0;
  private dt: number;
  private prevB: Float64Array | undefined;
  private secondPrevSol: Float64Array | undefined;
  private prevDt: number;
  private lteRejectCount = 0;
  private disposed = false;

  constructor(compiled: CompiledCircuit, options: ResolvedOptions, config: InternalTransientConfig) {
    this.compiled = compiled;
    this.options = options;
    this.config = config;
    this.dt = Math.min(config.timestep, config.maxTimestep);
    this.prevDt = this.dt;

    this.assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
    this.solver = createSparseSolver();

    this.initDC();
  }

  get simTime(): number { return this.time; }
  get stopTime(): number | undefined { return this.config.stopTime; }
  get isDone(): boolean {
    return this.config.stopTime !== undefined && this.time >= this.config.stopTime - MIN_TIMESTEP;
  }

  advance(): TransientStep {
    if (this.disposed) throw new InvalidCircuitError('TransientSim has been disposed');

    const prevSol = new Float64Array(this.assembler.solution);

    // Retry loop: dt halving on NR failure (no GMIN stepping yet — added in Task 6)
    for (;;) {
      const nextTime = this.config.stopTime !== undefined
        ? Math.min(this.time + this.dt, this.config.stopTime)
        : this.time + this.dt;
      const actualDt = nextTime - this.time;

      const result = attemptStep(
        { compiled: this.compiled, assembler: this.assembler, solver: this.solver, options: this.options },
        {
          dt: actualDt,
          time: nextTime,
          prevSolution: prevSol,
          prevB: this.prevB,
          gmin: this.options.gmin,
          voltageLimit: NR_VOLTAGE_LIMIT,
        },
      );

      if (!result.ok) {
        this.dt = this.dt / 2;
        if (this.dt < MIN_TIMESTEP) {
          throw new TimestepTooSmallError(this.time, this.dt);
        }
        this.assembler.solution.set(prevSol);
        continue;
      }

      // LTE rejection
      const lteRatio = this.checkLTE(result.solution, prevSol, actualDt);
      if (lteRatio > 1) {
        const factor = Math.max(0.25, 0.9 / Math.sqrt(lteRatio));
        this.dt = Math.max(actualDt * factor, MIN_TIMESTEP);
        this.assembler.solution.set(prevSol);
        this.lteRejectCount++;
        continue;
      }
      this.lteRejectCount = 0;

      // Update trapezoidal history
      if (this.options.integrationMethod === 'trapezoidal') {
        this.assembler.clear();
        const ctx = this.assembler.getStampContext();
        for (const d of this.compiled.devices) d.stamp(ctx);
        this.prevB = new Float64Array(this.assembler.b);
      }

      // Commit
      this.secondPrevSol = prevSol;
      this.prevDt = actualDt;
      this.time = nextTime;

      // Grow dt
      const growFactor = lteRatio > 0.001 ? Math.min(2.0, 0.9 / Math.sqrt(lteRatio)) : 2.0;
      this.dt = Math.min(actualDt * growFactor, this.config.maxTimestep,
        this.config.stopTime !== undefined ? this.config.stopTime - this.time : Infinity);

      return this.buildStep(result.solution);
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
    this.assembler = new MNAAssembler(this.compiled.nodeCount, this.compiled.branchCount);
    this.solver = createSparseSolver();
    this.time = 0;
    this.dt = Math.min(this.config.timestep, this.config.maxTimestep);
    this.prevDt = this.dt;
    this.prevB = undefined;
    this.secondPrevSol = undefined;
    this.lteRejectCount = 0;
    this.initDC();
  }

  dispose(): void {
    this.disposed = true;
  }

  private initDC(): void {
    const { assembler: dcAsm } = solveDCOperatingPoint(this.compiled, this.options);
    this.assembler.solution.set(dcAsm.solution);

    if (this.options.integrationMethod === 'trapezoidal') {
      this.assembler.clear();
      this.assembler.setTime(0, 0);
      const ctx = this.assembler.getStampContext();
      for (const d of this.compiled.devices) d.stamp(ctx);
      this.prevB = new Float64Array(this.assembler.b);
    }
  }

  private checkLTE(current: Float64Array, previous: Float64Array, dt: number): number {
    if (!this.secondPrevSol || this.lteRejectCount >= MAX_LTE_REJECTS_BEFORE_BYPASS) return 0;
    let maxRatio = 0;
    const divider = this.options.integrationMethod === 'trapezoidal' ? 3 : 2;
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
