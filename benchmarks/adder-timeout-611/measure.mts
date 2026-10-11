/**
 * Issue #611 / #604 measurement: run one corpus-f fixture through spice-ts's
 * resumable transient driver under a wall-clock budget and report how far it
 * gets (time-to-bound), accepted/rejected steps, Newton iterations per step and
 * the smallest accepted timestep.
 *
 * Usage:
 *   pnpm exec tsx benchmarks/adder-timeout-611/measure.mts <fixture.cir> \
 *     [--core <path to packages/core/dist/index.js>] [--budget-ms 120000] [--out <json>]
 *
 * The fixture bytes are read unchanged; the budget equals the aggregate/corpus-f
 * 120 s bound and is not a tolerance: it only stops the measurement.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

interface Snapshot {
  wallMs: number;
  simTime: number;
  acceptedSteps: number;
  rejectedSteps: number;
  nrRetries: number;
  lteRetries: number;
  newtonIterations: number;
}

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const fixture = process.argv[2];
if (!fixture || fixture.startsWith('--')) {
  console.error('usage: measure.mts <fixture.cir> [--core dist/index.js] [--budget-ms N] [--out file.json]');
  process.exit(2);
}
const corePath = resolve(arg('--core', 'packages/core/dist/index.js')!);
const budgetMs = Number(arg('--budget-ms', '120000'));
const outPath = arg('--out');
const snapshotEveryMs = Number(arg('--snapshot-ms', '10000'));

const core = await import(pathToFileURL(corePath).href) as typeof import('../../packages/core/src/index.js');
const bytes = await readFile(fixture);
const text = bytes.toString('utf8');

const started = performance.now();
const sim = await core.createTransientSim(text);
const setupMs = performance.now() - started;

/**
 * --diagnose: wrap the driver's two truncation checks (node-voltage LTE ratio
 * and device charge bound, see transient-driver.ts advanceSolution) on the
 * instance to count which one rejects a trial step and which one caps the next
 * dt. Read-only: the wrappers return the original values.
 * --experiment no-node-lte: DIAGNOSTIC ONLY, never a fix. Makes the node-voltage
 * LTE ratio 0 (ngspice-47 default, i.e. without `.option newtrunc`, truncates on
 * device charges only) to measure how many steps that check alone costs.
 */
const diagnose = process.argv.includes('--diagnose');
const experiment = arg('--experiment');
const limiter = {
  attempts: 0, nodeLteRejects: 0, chargeRejects: 0, bothReject: 0,
  acceptedNodeLteLimited: 0, acceptedChargeLimited: 0, acceptedOther: 0,
};
if (diagnose || experiment) {
  type Driver = {
    checkLTE(current: Float64Array, previous: Float64Array, dt: number): number;
    chargeTruncationTimestep(dt: number): number;
  };
  const driver = sim as unknown as Driver;
  const proto = Object.getPrototypeOf(sim) as Driver;
  let lastRatio = 0;
  driver.checkLTE = function checkLTE(current, previous, dt) {
    const ratio = proto.checkLTE.call(this, current, previous, dt);
    lastRatio = ratio;
    return experiment === 'no-node-lte' ? 0 : ratio;
  };
  driver.chargeTruncationTimestep = function chargeTruncationTimestep(dt) {
    const bound = proto.chargeTruncationTimestep.call(this, dt);
    limiter.attempts++;
    const ratio = experiment === 'no-node-lte' ? 0 : lastRatio;
    const nodeRejects = ratio > 1;
    const chargeRejects = bound < 0.9 * dt;
    if (nodeRejects && chargeRejects) limiter.bothReject++;
    else if (nodeRejects) limiter.nodeLteRejects++;
    else if (chargeRejects) limiter.chargeRejects++;
    else {
      // Accepted: which term sets min(dt * grow, chargeBound)?
      const grow = ratio > 0.001 ? Math.min(2, 0.9 / Math.sqrt(ratio)) : 2;
      if (grow < 2 && dt * grow <= bound) limiter.acceptedNodeLteLimited++;
      else if (bound < dt * grow) limiter.acceptedChargeLimited++;
      else limiter.acceptedOther++;
    }
    return bound;
  };
}

const snapshots: Snapshot[] = [];
const dtHistogram: Record<string, number> = {};
const recordPath = arg('--record');
const recordNodes = (arg('--nodes') ?? '').split(',').filter(Boolean);
const recorded = { grid: [] as number[], signals: Object.fromEntries(recordNodes.map(n => [`v(${n})`, [] as number[]])) };
const record = (time: number, voltages: Map<string, number>): void => {
  if (!recordPath) return;
  recorded.grid.push(time);
  for (const node of recordNodes) recorded.signals[`v(${node})`].push(voltages.get(node) ?? Number.NaN);
};
if (recordPath) {
  // t = 0 point, as solveTransient saves it before the first advance().
  const initial = (sim as unknown as { peekInitialStep(): { voltages: Map<string, number> } }).peekInitialStep();
  record(0, initial.voltages);
}
let lastTime = sim.simTime;
let error: string | undefined;
let nextSnapshot = snapshotEveryMs;
const take = (): Snapshot => {
  const t = sim.convergence.transient;
  return {
    wallMs: Math.round(performance.now() - started),
    simTime: sim.simTime,
    acceptedSteps: t.acceptedSteps,
    rejectedSteps: t.rejectedSteps,
    nrRetries: t.nrRetries,
    lteRetries: t.lteRetries,
    newtonIterations: t.newtonIterations,
  };
};

try {
  while (!sim.isDone) {
    const step = sim.advance();
    record(step.time, step.voltages);
    const dt = sim.simTime - lastTime;
    lastTime = sim.simTime;
    const decade = dt > 0 ? `1e${Math.floor(Math.log10(dt))}` : '0';
    dtHistogram[decade] = (dtHistogram[decade] ?? 0) + 1;
    const elapsed = performance.now() - started;
    if (elapsed >= nextSnapshot) {
      snapshots.push(take());
      nextSnapshot += snapshotEveryMs;
    }
    if (elapsed >= budgetMs) break;
  }
} catch (caught) {
  error = caught instanceof Error ? `${caught.name}: ${caught.message}` : String(caught);
}

const final = take();
const transient = sim.convergence.transient;
const dc = sim.convergence.dc;
const report = {
  fixture,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  core: corePath,
  budgetMs,
  experiment: experiment ?? null,
  limiter: diagnose || experiment ? limiter : null,
  completed: sim.isDone && error === undefined,
  error: error ?? null,
  stopTime: sim.stopTime,
  setupMs: Math.round(setupMs),
  final,
  fractionOfStopTime: sim.stopTime ? final.simTime / sim.stopTime : null,
  newtonIterationsPerAttempt: final.newtonIterations / Math.max(1, final.acceptedSteps + final.rejectedSteps),
  newtonIterationsPerAcceptedStep: final.newtonIterations / Math.max(1, final.acceptedSteps),
  minimumAcceptedTimestep: transient.minimumAcceptedTimestep,
  dcNewtonIterations: dc.newtonIterations,
  dtHistogram: Object.fromEntries(Object.entries(dtHistogram).sort((a, b) => Number(a[0]) - Number(b[0]))),
  snapshots,
};
const json = JSON.stringify(report, null, 2);
if (outPath) await writeFile(outPath, `${json}\n`);
if (recordPath) await writeFile(recordPath, JSON.stringify(recorded));
console.log(json);
