#!/usr/bin/env tsx
/**
 * Aggregate, identical-input parity report for the five public 20-circuit corpora.
 *
 * Usage:
 *   pnpm exec tsx benchmarks/aggregate-report.ts
 *   pnpm exec tsx benchmarks/aggregate-report.ts --check
 *
 * Both modes validate fixture hashes and pinned provenance before running any engine, so a stale
 * benchmarks/SOURCES.md or fixture tree fails in seconds. Runs are concurrency-safe: --check never
 * writes, each engine execution uses its own temporary directory, and generation publishes via
 * per-run temporary files plus atomic rename. Stop a run with `kill <pid>` (the PID is printed at
 * start); never pattern-kill other lanes' runs.
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release, tmpdir } from 'node:os';
import { basename, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deserialize, serialize } from 'node:v8';
import {
  alignAndMeasure,
  sharedGridPoints,
  type AlignmentOptions,
  type ComparisonMetrics,
  type SampleSeries,
} from './comparison-harness.js';
import {
  findMatchingAnalysis,
  runNativeNgspice,
  runNativeSpiceTs,
  type ClassicAnalysisType,
  type ClassicCircuit,
  type EngineExecution,
} from './corpus/classic/report.js';

const SCHEMA = 'spice-ts-aggregate-parity/v1' as const;
const CORPORA = ['ngspice', 'classic', 'xyce', 'corpus-d', 'corpus-e'] as const;
const FIXTURES_PER_CORPUS = 20;
const TOTAL_FIXTURES = CORPORA.length * FIXTURES_PER_CORPUS;
const JSON_PATH = resolve('benchmarks/aggregate-report.json');
const MARKDOWN_PATH = resolve('benchmarks/AGGREGATE_PARITY.md');
const FIXTURE_TREE_SHA256 = '13b4675cfb97766fc7caed79d023ca514840880d17cb924c0e70561ff8b82e00';
const SOURCES_SHA256 = 'cdd28c9802f1e7706a7a19dc02caa2f2622672dd518aa158b8a367a092ad873d';

type CorpusId = typeof CORPORA[number];
type Status = 'success' | 'failed' | 'unsupported';

interface ExpectedStatus {
  expectedStatus?: 'pass' | 'fail';
  failureKind?: string;
  reason?: string;
  status?: string;
}

interface CorpusCircuit extends Omit<ClassicCircuit, 'ngspice' | 'spiceTs'> {
  ngspice?: ExpectedStatus;
  spiceTs: ExpectedStatus;
}

interface CorpusManifest {
  source: { name: string; revision: string; license: string };
  circuits: CorpusCircuit[];
}

interface EngineReceipt {
  status: Status;
  convergence: EngineExecution['convergence'];
  runtimeMs: number;
  command: string[];
  inputSha256: string;
  analyses: Array<{ type: ClassicAnalysisType; points: number; signals: string[] }>;
  error?: string;
}

interface FixtureReceipt {
  key: string;
  corpus: CorpusId;
  id: string;
  category: string;
  declaredAnalyses: ClassicAnalysisType[];
  localPath: string;
  input: { bytes: number; sha256: string; identicalForBothEngines: true };
  ngspice: EngineReceipt;
  spiceTs: EngineReceipt;
  /** Reports generated before #445 carry no `linearMetrics`. */
  comparisons: Array<Omit<ComparisonReceipt, 'linearMetrics'> & { linearMetrics?: ComparisonMetrics }>;
  gapIssues: string[];
}

export interface ComparisonReceipt {
  analysis: ClassicAnalysisType;
  signals: string[];
  /** Primary metric (`policy.breakpointAlignment`): one-sided at shared transient breakpoints. */
  metrics: ComparisonMetrics;
  /**
   * Secondary, pre-#445 metric: plain linear interpolation of ngspice everywhere. Published so
   * that the breakpoint-aware primary metric hides no error. Identical to `metrics` for every
   * non-transient analysis.
   */
  linearMetrics: ComparisonMetrics;
}

interface MatchedPointEnvelope {
  comparedSignals: number;
  relativeComparedSignals: number;
  absoluteSamples: number;
  relativeSamples: number;
  excludedZeroReferences: number;
  maximumAbsoluteError: number;
  maximumAbsoluteRms: number;
  maximumRelativeError: number | null;
  maximumRelativeRms: number | null;
}

interface StatusTransition {
  engine: 'ngspice' | 'spiceTs';
  fixture: string;
  from: Status;
  to: Status;
  explanation: string;
  gapIssues: string[];
}

export interface AggregateReport {
  schemaVersion: typeof SCHEMA;
  outcomeSha256: string;
  provenance: { fixtureTreeSha256: string; sourcesSha256: string };
  corpusSources: Array<{ id: CorpusId; name: string; revision: string; license: string; fixtureCount: number }>;
  environment: { platform: string; release: string; arch: string; cpu: string; node: string };
  tools: { spiceTs: string; ngspice: string; pnpm: string };
  commands: { generate: string; verify: string; ngspice: string; spiceTs: string };
  policy: {
    input: 'byte-identical fixture for both engines';
    fixtureAdaptation: 'none';
    perCircuitToleranceTuning: false;
    comparisonGrid: 'spice-ts';
    interpolation: 'linear';
    /** Absent before #445. See `AlignmentOptions.breakpoints` in comparison-harness.ts. */
    breakpointAlignment?: 'one-sided at time points shared by both transient grids; linear metric retained';
    timing: 'single wall-clock execution per engine and fixture; descriptive, not a speed claim';
    deterministicHashExcludes: ['environment', 'runtimeMs', 'error'];
  };
  totals: {
    fixtures: number;
    corpusFixtures: Record<CorpusId, number>;
    ngspice: Record<Status, number>;
    spiceTs: Record<Status, number>;
    comparedFixtures: number;
    comparedAnalyses: number;
    runtimeMs: Record<'ngspice' | 'spiceTs', number>;
  };
  matchedPointEnvelope: MatchedPointEnvelope;
  comparisonToPrevious: {
    issueUrl: string;
    pullRequestUrl: string;
    headSha: string;
    outcomeSha256: string;
    totals: AggregateReport['totals'];
    matchedPointEnvelope: MatchedPointEnvelope;
    statusTransitions: StatusTransition[];
    metricTransitions: string[];
  };
  gapIssues: Array<{ url: string; scope: string }>;
  fixtures: FixtureReceipt[];
}

const PREVIOUS_REPORT: AggregateReport['comparisonToPrevious'] = {
  issueUrl: 'https://github.com/mfiumara/spice-ts/issues/321',
  pullRequestUrl: 'https://github.com/mfiumara/spice-ts/pull/325',
  headSha: 'ad7ba71b65848053afa7bc64ba22fd989ef89ca4',
  outcomeSha256: '68aa8e2e7b78b82f801da84cf5c88c489634d203f44bca5df9345a1946deddb9',
  totals: {
    fixtures: 100,
    corpusFixtures: { ngspice: 20, classic: 20, xyce: 20, 'corpus-d': 20, 'corpus-e': 20 },
    ngspice: { success: 52, failed: 9, unsupported: 39 },
    spiceTs: { success: 55, failed: 2, unsupported: 43 },
    comparedFixtures: 43,
    comparedAnalyses: 58,
    runtimeMs: { ngspice: 77_150.906, spiceTs: 270_491.926 },
  },
  matchedPointEnvelope: {
    comparedSignals: 878,
    relativeComparedSignals: 848,
    absoluteSamples: 9_182_709,
    relativeSamples: 9_147_783,
    excludedZeroReferences: 34_926,
    maximumAbsoluteError: 1169140310571.719,
    maximumAbsoluteRms: 1169140310571.719,
    maximumRelativeError: 45497356677842.63,
    maximumRelativeRms: 872317191517.6284,
  },
  statusTransitions: [
    {
      engine: 'spiceTs',
      fixture: 'classic/diode-distortion',
      from: 'failed',
      to: 'success',
      explanation: 'Accepted bounded nonlinear diode distortion (#363, PR #367) removed the ideal-RLC-only .disto rejection, after which the row was unsupported only because the corpus harness did not map .disto results (#391). The harness now maps result.distortion onto the three ngspice-47 two-tone plots (DISTORTION - IM: f1+f2, f1-f2 and 2f1-f2) with the same v(n)/i(vx) names on the swept F1 grid, adding three disto comparisons of 5 signals each. 100 of 101 points align: the last ngspice frequency is 99999999.99999923 Hz (multiplicative accumulation) against an exact 1e8 Hz in spice-ts, so that point is excluded out of range. Published errors: v(2) relative max 2.588e-4 on f1+f2 and f1-f2 (absolute max 1.77e-11 V) and 3.874e-4 on 2f1-f2 (absolute max 3.03e-14 V); i(vcc) and i(vcc2) have the same relative error as v(2); v(1) and v(3) are exactly zero in ngspice and within 4e-23 V in spice-ts. The change is in the harness, not the simulator.',
      gapIssues: ['https://github.com/mfiumara/spice-ts/issues/75', 'https://github.com/mfiumara/spice-ts/issues/391'],
    },
    {
      engine: 'spiceTs',
      fixture: 'ngspice/vbic-fo',
      from: 'unsupported',
      to: 'success',
      explanation: 'Accepted bounded VBIC FO DC support (#352, PR #361) lets the unchanged nested DC sweep complete with 707 points, adding one DC comparison of 6 signals. With per-segment nested-DC alignment (#384, PR #394) 700 points align and 7 are excluded out of range; worst absolute max is 6.71e-6 A on i(vc) and 3.77e-6 A on i(vb), matching the #352 point-by-point verifier. Before #394 the same run reported a 0.3 V harness artifact on source-forced nodes (#401).',
      gapIssues: ['https://github.com/mfiumara/spice-ts/issues/5', 'https://github.com/mfiumara/spice-ts/issues/352'],
    },
    {
      engine: 'spiceTs',
      fixture: 'ngspice/hfet-inverter',
      from: 'unsupported',
      to: 'success',
      explanation: 'Accepted bounded NHFET level-5 support (#339, PR #360) accepts the Z cards, so the unchanged transient completes and adds one comparison. Published losses: v(4) absolute max 2.272 V (RMS 1.611 V) and v(3) 2.231 V (RMS 1.239 V); i(vdd) absolute max 0.00372 A.',
      gapIssues: ['https://github.com/mfiumara/spice-ts/issues/76', 'https://github.com/mfiumara/spice-ts/issues/339'],
    },
    ...['classic/bjt-noise', 'classic/resistor-noise'].map(fixture => ({
      engine: 'spiceTs' as const,
      fixture,
      from: 'unsupported' as const,
      to: 'success' as const,
      explanation: 'Accepted classic-corpus .noise mapping (#380, PR #383) compares the noise spectra and integrated totals spice-ts already produced, adding two noise analyses. Worst relative max is 4.9e-4 (bjt-noise onoise) and 1.7e-7 (resistor-noise). The change is in the harness, not the simulator.',
      gapIssues: ['https://github.com/mfiumara/spice-ts/issues/75', 'https://github.com/mfiumara/spice-ts/issues/380'],
    })),
    {
      engine: 'spiceTs',
      fixture: 'xyce/inductor-transient',
      from: 'failed',
      to: 'success',
      explanation: 'Accepted inductor-ringing step-loop termination (#366, PR #377) lets the unchanged transient finish inside the 120000 ms bound and adds one comparison. Under plain linear interpolation v(1) and v(2) show absolute max 31.65 V (RMS 8.27 V, relative max about 1.0), while i(l1) agrees to 2.4e-14 A. That error was the #445 interpolation artifact: with breakpoint alignment (PR #458) the primary metric is 9.33e-10 V (RMS 1.05e-10 V) on v(1) and v(2), and the 31.65 V linear value stays published as linearMetrics.',
      gapIssues: ['https://github.com/mfiumara/spice-ts/issues/366'],
    },
    {
      engine: 'spiceTs',
      fixture: 'ngspice/probe-ac',
      from: 'unsupported',
      to: 'success',
      explanation: 'Accepted ngspice .control/.endc block contract (#381, PR #387) no longer rejects the control block, so the unchanged AC fixture completes and adds one comparison of 4 signals. 15 of 16 points align (1 excluded out of range), and the worst absolute max is 4.4e-16 V.',
      gapIssues: ['https://github.com/mfiumara/spice-ts/issues/76', 'https://github.com/mfiumara/spice-ts/issues/381'],
    },
    {
      engine: 'spiceTs',
      fixture: 'classic/bjt-mixer-distortion',
      from: 'unsupported',
      to: 'failed',
      explanation: 'Accepted BJT charge storage (#385, PR #400) now accepts the CJS model parameter that used to reject this netlist at parse time. Upstream comments out both .disto commands, so the fixture has no analysis at all: spice-ts now parses it fully and fails with "No analysis command specified", and the corpus harness classifies that as failed. ngspice also fails on the same bytes (exits 0 with no raw analysis data). This is a published status loss, not a simulator regression: neither engine produces a comparable result.',
      gapIssues: ['https://github.com/mfiumara/spice-ts/issues/75', 'https://github.com/mfiumara/spice-ts/issues/385'],
    },
    {
      engine: 'spiceTs',
      fixture: 'ngspice/mesa-oscillator',
      from: 'unsupported',
      to: 'success',
      explanation: 'Accepted B-source I= expressions and NMF level-2 MESFET (#340, PR #421) let the unchanged transient complete, adding one comparison of 37 signals. 2041 points align and 47 are excluded out of range. Before .tran TSTART output omission (#432, PR #440), spice-ts also emitted the 3219 points before TSTART = 1 ns that ngspice omits, and 3266 points were excluded. Published loss: worst absolute max 0.178 V on v(6) (RMS 0.0244 V), with relative max up to 0.86 on v(8).',
      gapIssues: ['https://github.com/mfiumara/spice-ts/issues/76', 'https://github.com/mfiumara/spice-ts/issues/340', 'https://github.com/mfiumara/spice-ts/issues/432'],
    },
  ],
  metricTransitions: [
    'Totals: ngspice unchanged at 52/9/39 success/failed/unsupported; spice-ts 55/2/43 to 63/1/36. Comparable coverage changes from 58 analyses across 43 fixtures to 70 across 51: classic/diode-distortion adds three disto analyses (#391), ngspice/vbic-fo, ngspice/hfet-inverter, xyce/inductor-transient, ngspice/probe-ac and ngspice/mesa-oscillator add one analysis each, classic/bjt-noise and classic/resistor-noise add two each, and ngspice/vbic-common-emitter-ac keeps its AC and PZ analyses (now a real VBIC simulation; see below). classic/bjt-mixer-distortion moves from unsupported to failed and adds no comparison. Signals change from 878 to 969 absolute and from 848 to 933 relative; nine of the new signals are the extra vbic-common-emitter-ac poles and zeros that the pencil-eigenvalue .pz (#451, PR #466) finds. Samples change from 9,182,709 to 9,271,920 absolute and from 9,147,783 to 9,234,466 relative; excluded zero references change from 34,926 to 37,454. Most of the sample growth comes from the denser transient grids after #400/#417 (see below) and the mesa-oscillator samples, partly offset by the much sparser BJT/MOS transient grids after #456 (PR #463).',
    'Nested DC sweeps are now aligned per segment (#384, PR #394). Worst per-signal absolute max: ngspice/jfet-vds-vgs 3 V v(1) to 3.10e-6 A i(vd); xyce/njfet-2109-dc 1.875 V v(2) to 1.47e-6 A; xyce/nmos-level1-dc 18 V v(4) to 0.000682 V v(2); xyce/pnp-dc 2 V v(4) to 0.00119 V v(3). The old values were harness artifacts, not simulator errors.',
    'Grounded-substrate BJT model resolution (#382, PR #392) changes three corpus-e fixtures. Gains: bjt-rtl-inverter-chain worst DC abs max 4.71 to 1.86 V and OP 0.194 to 0.119 V; bjt-diffpair-current-source worst AC abs max 90.1 to 83.9 V. Published losses: bjt-diffpair-transient and bjt-diffpair-current-source OP v(4)/v(5) abs 1.107 to 1.148 V and supply currents i(vcc)/i(vee) rel about 0.086 to 0.089 in OP and TRAN; bjt-diffpair-current-source AC v(3) abs max 0.0859 to 0.0997 V and TRAN v(4) rel max 68.1 to 348.7 (rel RMS 9.54 to 35.3) and v(5) rel max 43.8 to 97.5; bjt-rtl-inverter-chain DC i(vin) rel max 78.2 to 157.9 (rel RMS 17.9 to 35.1), TRAN i(vcc) abs max 0.00437 to 0.00457 A and v(2) rel max 1.13 to 1.21. Transient grids change from 198 to 191, 111 to 107 and 170 to 156 points.',
    'PULSE zero TR/TF now defaults to TSTEP like ngspice (#375, PR #379). xyce/rlc-transient worst absolute max falls from 10 V v(1) to 0.000752 V v(2) on 1018 instead of 1002 points; classic/mos-memory-cell from 22496.7 A i(vwb) to 9.91 V v(8) on 144 instead of 158 points (v(8) remains a 9.9 V loss); ngspice/ltra-line-transient from 2.499 V v(168) to 0.416 V v(3) on 665 instead of 685 points. Published losses: ltra-line-transient v(3) abs RMS +5.2% (0.04522 to 0.04755 V); mos-memory-cell i(vw) abs RMS +4.7%; classic/lossy-line-aluminium (3968 to 3969 points) raises abs RMS on 89 of 261 signals by at most 0.1% on non-negligible signals and v(x1.x1.x1.x1.x1.x1.x1.x1.4) rel max 2314.5 to 7220.6 at an unchanged 0.2614 V abs max. classic/lossy-line-24-inch and classic/coupled-lossy-lines change only at rounding level.',
    'Worst per-signal envelope: absolute max falls from 1169140310571.719 to 31.65338535154384 and absolute RMS from 1169140310571.719 to 8.272157976952819, now from xyce/inductor-transient TRAN v(1) (the #366 loss). Two things cause this. First, the ngspice/vbic-common-emitter-ac pole comparison is no longer made (#392), which is a coverage change, not an accuracy gain; it leaves classic/rca3040-wideband-amplifier AC v(15) at 154.02408984579006 (RMS 66.59015057379884). Second, BJT charge storage (#400) then lowers that rca3040 AC v(15) error to 1.0237. Relative max falls from 45497356677842.63 to 321200769453.2656 and relative RMS from 872317191517.6284 to 6432928954.616146, still from classic/coupled-lossy-lines v(5), whose absolute max falls from 1.42 to 0.431 V (the relative values were 318874896057.84845 and 6401850478.823812 before DC pnjlim diode limiting, PR #437, and 349781933131.4126 and 6858037632.217204 before transient pnjlim, PR #442; see below); the relative metric still divides by near-zero ngspice samples. No tolerance changed.',
    'Diode CJO aliasing (#365, PR #390) changed no aggregate outcome: the deterministic projection was identical before and after merging it.',
    'Transient step-control change from inductor-ringing termination (#366, PR #377), the only transient-engine change merged in the final window (none of these netlists has a diode, HFET or .noise card, so #405, #360 and #383 cannot affect them): xyce/rlc-transient worsens, with abs max 0.000752 to 0.00213 V on v(2) and 0.000251 to 0.000711 A on i(l1), abs RMS up on all 5 signals, 1018 to 1037 points. This is a published loss. ngspice/mos6-inverter-transient and classic/mos6-inverter-chain (3760 to 3777 points) lower abs RMS on 30 and raise it on 14 of 44 signals, with worst abs max 5.0044 V on v(43) essentially unchanged. ngspice/mos6-simple-inverter-transient (3438 to 3451 points) and corpus-e/mos1-inverter-sweep TRAN (111 to 113 points) change abs RMS by about 1% or less.',
    'Diode VJ/FC depletion-capacitance parity (#388, PR #405) changed no compared diode fixture metric in this run.',
    'BJT charge storage and Early gm (#385, PR #400) and MOS1 bulk-junction currents (#393, PR #417) were merged after the bc99922 refresh and change 26 compared fixtures. The item values above for #392, #379 and #377 were measured before these two merges. Below, A to B means the bc99922 aggregate value (outcome 44261d03) to the 60f49b2 run (outcome c06be5be). Attribution is by device class (BJT to #400, MOS to #417), not bisected. Gains, worst absolute max: classic/rca3040-wideband-amplifier AC v(15) 154.02 to 1.024 and TRAN v(17) 10.42 to 0.311 V (1494 to 3994 points); classic/bjt-differential-pair TRAN v(4) 7.27 to 0.076 V (190 to 3184 points); classic/rtl-inverter-chain TRAN v(5) 4.73 to 0.296 V and DC 1.87 to 1.80 V; corpus-e/bjt-rtl-inverter-chain TRAN v(5) 4.73 to 0.293 V and DC 1.857 to 1.801 V; corpus-e/bjt-diffpair-transient OP v(5) 1.148 to 0.0616 V and TRAN v(4) 7.01 to 0.111 V; corpus-e/bjt-diffpair-current-source AC v(5) 83.9 to 0.517 V, OP v(5) 1.148 to 0.0616 V and TRAN v(5) 4.78 to 0.129 V (TRAN v(4) rel max 348.7 to 286.9); classic/lossy-line-24-inch v(3) 3.65 to 1.125 V; classic/coupled-lossy-lines v(x1.6) 5.20 to 0.391 V with abs RMS down on 41 of 47 signals; classic/mos-memory-cell v(8) 9.91 to 1.91 V; corpus-e/mos1-inverter-sweep OP v(4) 4.58 to 0.214 V; ngspice/mos-amplifier-transient and classic/mos-amplifier abs RMS down on 18 of 24 signals and i(vb) rel max 9.5e6 to 1.6e5; ngspice/mos6-simple-inverter-transient v(11) 4.92 to 4.34 V; ngspice/schmitt-trigger and classic/ecl-schmitt-trigger v(6) 0.989 to 0.763 V. Published losses at the 60f49b2 run, superseded for corpus-e/mos1-inverter-sweep and ngspice/mos6-simple-inverter-transient by case-insensitive .model resolution (PR #436, see below): corpus-e/mos1-inverter-sweep TRAN i(vdd) 0.0036 to 1.234 A, a spike on a femtosecond step before the 3 ns PWL corner where ngspice peaks at 1.77e-3 A (#427), TRAN v(5) 2.50 to 3.74 V, DC i(vdd) 0.00364 to 0.00757 A, and worst DC/TRAN abs max then about 4.35 V; ngspice/mos6-simple-inverter-transient i(vdd) 0.000544 to 0.00191 A (rel max 8072 to 328348) and i(vin) 9.3e-6 to 2.1e-4 A on 3451 to 3229 points; ngspice/schmitt-trigger and classic/ecl-schmitt-trigger i(vin) 2.70e-4 to 5.35e-4 A and v(2) 0.0135 to 0.0268 V, v(6) rel max 36.1 to 148.3, with abs RMS up on 8 of 10 signals; classic/mos-memory-cell i(vs) 0.00367 to 0.0113 A and i(vwb) 0.00052 to 0.00104 A; ngspice/mos6-inverter-transient and classic/mos6-inverter-chain abs RMS up on 19 and down on 23 of 44 signals with v(xndinv2.22) 3.720 to 3.723 V; corpus-e/bjt-diffpair-transient TRAN v(1) rel max 0.039 to 1.0 at 0.0012 V abs; corpus-e/bjt-rtl-inverter-chain OP i(vin) rel 0.22 to 1.0 at 4.6e-12 A abs; classic/lossy-line-24-inch v(3) rel max 84.5 to 2533 and classic/rca3040-wideband-amplifier TRAN v(31) rel max 518 to 4387 at lower absolute error. ngspice/ltra-line-transient, classic/bsim1-device-sweep, classic/bsim2-device-sweep, xyce/nmos-level1-dc and xyce/pmos-level1-dc change only at rounding level.',
    'Merged after the 60f49b2 run: .ac sweep point counts (PR #397), transient Newton limiting only on nonlinear device nodes (#376, PR #425), and B-source I= expressions with NMF level-2 MESFET (#340, PR #421). Apart from the ngspice/mesa-oscillator transition above, no compared metric, grid or engine status changed for any fixture across these three merges.',
    'Diode VT = kT/q and ngspice-47 model aliases (#402/#404, PR #431) merged after the 26a163a run and change six compared analyses (26a163a run to this run). Gains: xyce/diode-sidewall-dc worst i(vin) abs max 5.20e-4 to 1.03e-4 A; corpus-e/diode-bias-sweep DC v(2) 5.86e-4 to 2.48e-4 V and OP v(2) 3.45e-4 to 2.88e-6 V; classic/coupled-lossy-lines worst abs max 0.936 V v(x3.3) to 0.868 V v(x3.1) on 3781 to 3776 points, with abs RMS down on 27 of 47 signals. Published losses: classic/coupled-lossy-lines abs RMS up on 14 of 47 signals, v(x3.2) abs max 0.443 to 0.449 V and v(2) 0.311 to 0.319 V; classic/lossy-line-24-inch abs RMS up on all 3 signals and v(2) abs max 1.1210 to 1.1235 V on 3162 to 3129 points (v(3) improves 1.1252 to 1.1211 V); classic/lossy-line-aluminium abs RMS up on 121 and down on 50 of 261 signals at an unchanged worst abs max of 1.3472 V v(3).',
    'Merged after the 3b2d9ac run. Each step below was bisected with a full 100-fixture run on that main commit using this branch\'s harness; a rerun on 3b2d9ac reproduced outcome 2a6f337a exactly. The numeric-wasm .ac frequency grid (#409, PR #434) is WASM-only and outside this harness. Case-insensitive .model resolution (#427, PR #436) changes the outcome from 2a6f337a to 5b5bbcdb. Three fixtures name models in a different case from their .model cards (NMOS for nmos, p12l5 for P12L5), so before #436 those devices silently ran a default model. Gains: corpus-e/mos1-inverter-sweep DC worst abs max 4.352 V v(6) to 0.00352 V v(3); OP 0.214 V v(4) to 4.5e-10 V; TRAN 4.352 V v(6) to 0.836 V v(3), with v(6) 4.352 to 0.0684 V, i(vdd) 1.234 to 5.81e-5 A (the #427 spike is gone), abs RMS down on 8 of 9 signals and 382 to 164 points against ngspice\'s 65. ngspice/mos6-simple-inverter-transient v(11) 4.336 to 2.956 V, i(vdd) 0.00191 to 0.000232 A and i(vin) 2.1e-4 to 1.5e-5 A on 3229 to 2767 points. Published losses: corpus-e/mos1-inverter-sweep TRAN still has v(3) abs max 0.836 V (RMS 0.278 V) and v(4) 0.176 V, with relative max 1.0 on v(3), v(4) and v(6); ngspice/mos6-simple-inverter-transient v(11) remains a 2.956 V loss (RMS 0.712 V), and its v(1) abs RMS rises at the 1e-15 V rounding level; classic/bsim2-device-sweep currents move by at most 2.4e-14 A, with abs RMS up on 5 of 24 signals and i(vbs1) rel max 0.466 to 0.505. SimulationOptions.maxTimestep in simulate() (#415, PR #433) leaves the outcome at 5b5bbcdb. ngspice pnjlim diode limiting (#430, PR #437) changes the outcome to 4a4fcc16, only on diode-bearing fixtures. Published losses: classic/coupled-lossy-lines worst abs max 0.868 V v(x3.1) to 0.929 V v(x3.3) on 3776 to 3810 points, v(x3.1) 0.868 to 0.882 V, v(x3.2) abs RMS 0.0832 to 0.0888 V, abs RMS up on 19 and down on 23 of 47 signals, and v(5) rel max 3.189e11 to 3.498e11, which sets the new relative envelope; classic/lossy-line-24-inch v(2) 1.1235 to 1.1255 V and v(3) 1.1211 to 1.1222 V on 3129 to 3123 points (abs RMS down on 2 of 3); classic/lossy-line-aluminium abs RMS up on 132 and down on 127 of 261 signals at an unchanged worst abs max of 1.3472 V v(3) (3969 to 3968 points); corpus-e/diode-bias-sweep DC i(v1) rel max 0.515 to 0.999 at an unchanged 2.48e-9 A abs max. xyce/diode-sidewall-dc changes only at rounding level. ngspice dynamic gmin stepping for DC OP (#428, PR #439) changes the outcome to f7955f05, only on classic/mos-memory-cell (148 to 142 points). Gains: i(vs) 0.0113 to 0.000776 A, i(vwb) 0.00104 to 0.000512 A, i(vdd) 1.51e-4 to 6.74e-5 A, abs RMS down on 9 of 13 signals. Published losses: i(vw) abs RMS 7.46e-4 to 8.14e-4 A (rel max 5304 to 9779), v(8) 1.9075 to 1.9092 V, abs RMS up on 4 of 13 signals. Forward .param references and typed .tran/.ac ParseErrors (#422/#423, PR #435) leave the outcome at f7955f05: they only replace the unsupported-row error text of corpus-e/opamp-open-loop-ac and corpus-e/vcvs-operating-point, a leaked TypeError, with a typed .ac ParseError. Engine totals stay at 52/9/39 (ngspice) and 61/1/38 (spice-ts) success/failed/unsupported, and coverage stays at 65 analyses across 49 fixtures, through all six merges.',
    'Merged after the 4fed83d run, bisected the same way: one full 100-fixture run per main commit with this branch\'s harness, and a rerun on 4fed83d reproduced outcome 9f6e3faa exactly. .tran TSTART output omission (#432, PR #440) changes the outcome to bf06ceb6, only on ngspice/mesa-oscillator: spice-ts emits 2088 instead of 5307 transient points, and points excluded out of range fall from 3266 to 47 against ngspice\'s 201. The same 2041 points align, so every metric of its 37 signals is unchanged and the 0.178 V v(6) loss stands. InvalidCircuitError for unresolved device .model references (#414, PR #443) leaves the outcome at bf06ceb6: no fixture references an undefined model, and no spice-ts status or error text changes. Exact pnjlim in the transient Newton loop (#441, PR #442) changes the outcome to 75345f18, only on the three diode-bearing lossy-line fixtures. Gains: classic/coupled-lossy-lines worst abs max 0.929 V v(x3.3) to 0.870 V v(x3.1) on 3810 to 3779 points, v(x3.3) 0.929 to 0.835 V (abs RMS 0.180 to 0.156 V), v(x3.1) 0.882 to 0.870 V, and v(5) rel max 3.498e11 to 3.212e11 (rel RMS 6.858e9 to 6.433e9), which lowers the relative envelope; classic/lossy-line-aluminium abs RMS down on 149 and up on 111 of 261 signals, by at most 0.23% on signals above 0.01 V RMS, at an unchanged worst abs max of 1.3472 V v(3) (3968 to 3970 points). Published losses: classic/coupled-lossy-lines abs RMS up on 27 and down on 15 of 47 signals, v(x3.2) abs max 0.450 to 0.476 V (RMS 0.0888 to 0.0912 V), v(4) abs max 0.4945 to 0.4964 V and v(5) abs RMS 0.1205 to 0.1211 V; classic/lossy-line-24-inch abs RMS up on all 3 signals, v(2) abs max 1.1255 to 1.1291 V (rel max 10.4 to 15.6) and v(3) rel max 170 to 450 at an unchanged 1.1222 V abs max, on 3123 to 3107 points. Matched samples change from 9,485,000 to 9,484,017 absolute and from 9,449,285 to 9,448,424 relative; excluded zero references change from 35,715 to 35,593. Engine totals stay at 52/9/39 (ngspice) and 61/1/38 (spice-ts) success/failed/unsupported, and coverage stays at 65 analyses across 49 fixtures and 935/906 signals, through all three merges.',
    'Merged after the 3f3e2ca run (#413 refresh at 417f435), bisected the same way: one full 100-fixture run per main commit with the 667a704 (PR #458) harness. A rerun on 417f435 reproduced every committed metric exactly as linearMetrics. Breakpoint alignment (#445, PR #458) is a harness change that lowers only the primary transient metric, on 17 fixtures; abs RMS falls on 233 transient signals and rises on none, and linearMetrics keeps every pre-#458 value. It moves the absolute envelope from 31.65338535154384 (xyce/inductor-transient v(1), now 9.33e-10 V) to 5.0044039999247225 (ngspice/mos6-inverter-transient v(43), unchanged, a published loss) and the absolute RMS envelope from 8.272157976952819 to 2.655527382661988 (ngspice/mos-amplifier-transient v(5)). This supersedes the envelope statement above. Diode junction charge q(v) in transient (#403/#389, PR #452) changes only classic/coupled-lossy-lines (3779 to 3813 points) and classic/lossy-line-24-inch (3107 to 3112 points); classic/lossy-line-aluminium is unchanged. Gains: coupled-lossy-lines abs RMS down on 24 of 47 signals, v(5) rel RMS 6.433e9 to 6.403e9; lossy-line-24-inch v(3) rel max 450 to 171 and v(2) rel max 15.6 to 9.96. Published losses: coupled-lossy-lines worst abs max 0.870 to 0.889 V v(x3.1), abs RMS up on 18 of 47 signals, v(4) rel max 274 to 971, v(2) rel max 90.5 to 198, i(v1) rel max 2.64 to 7.98, and v(5) rel max 321200769453.2656 to 321200769455.61346, which sets the relative envelope; lossy-line-24-inch v(2) abs max 1.129 to 1.133 V and v(3) abs RMS 0.375 to 0.392 V. NHFET level-5 inverse operation at VGS (#448, PR #454) changes only ngspice/hfet-inverter (587 to 593 points): abs RMS down on 4 of 6 signals and v(3) rel max 5624 to 5452, but v(4) and v(3) keep their 2.272 V and 2.231 V abs max losses, v(4) abs RMS rises 1.611 to 1.615 V and i(vin) rel max rises 1271 to 3208. The 667a704 main run then reproduces the 2c11c9f outcome exactly. The .disto harness mapping (#391, PR #464) changes only classic/diode-distortion (see its status transition): spice-ts 61/1/38 to 62/1/37, coverage 65 to 68 analyses across 49 to 50 fixtures, 935 to 950 absolute and 906 to 915 relative signals, 9,485,666 to 9,487,166 absolute and 9,449,958 to 9,450,858 relative samples, and 35,708 to 36,308 excluded zero references (the zero v(1) and v(3) distortion products). No tolerance changed.',
    'Merged after the 667a704 run (the #391 harness above), bisected the same way: one full 100-fixture run per main commit with the #391 harness (PR #464 head 5e9489e merged into each commit). The 5e9489e --check run reproduces outcome 3c5ec193. AMD fill-reducing column ordering for Gilbert-Peierls LU (#444, PR #449) changes pivot order and therefore last-digit rounding in every LU solve. It changes no status and no compared analysis, but the deterministic projection of 40 fixtures moves: DC, OP, AC, noise and disto metrics only at rounding level (for example classic/bjt-noise onoise_total relative max 4.88592e-4 to 4.88602e-4), and transient step sequences on stiff or switching circuits, which shift their grids and metrics. Gains: ngspice/mesa-oscillator v(6) abs max 0.1782 to 0.1771 V (2088 to 2089 points, 2041 to 2042 aligned); classic/coupled-lossy-lines abs RMS down on 27 and up on 15 of 47 signals, v(4) rel max 970.5 to 280.7 (3813 to 3816 points); classic/lossy-line-24-inch v(2) abs max 1.1333 to 1.1323 V; corpus-e/bjt-diffpair-transient v(4) abs RMS 0.0903 to 0.0877 V (3195 to 3193 points); the classic/coupled-lossy-lines v(5) rel max 321200769455.61346 to 321200768925.4484 and rel RMS 6402773048.130738 to 6400132539.273393, which lowers the relative envelope. Published losses: ngspice/hfet-inverter (593 to 558 points) abs RMS up on 4 of 6 signals, v(3) 1.234 to 1.261 V, i(vin) rel max 3208 to 5425 and i(vdd) RMS 1.002e-3 to 1.014e-3 A, at unchanged 2.272 V and 2.231 V worst abs max; ngspice/mesa-oscillator abs RMS up on 27 of 37 signals, by at most 0.1%; ngspice/jimi-fuzz (567467 to 567405 points) abs RMS up on 9 of 21 signals at about 1e-5 relative; corpus-e/bjt-diffpair-transient v(5) abs max 0.0890 to 0.0969 V (RMS 0.0381 to 0.0403 V); classic/lossy-line-24-inch v(3) rel max 171 to 196; classic/lossy-line-aluminium abs RMS up on 107 and down on 143 of 261 signals at about 1e-5 relative; classic/rca3040-wideband-amplifier TRAN (3994 to 3993 points) abs RMS up on 12 and down on 11 signals, v(15) abs max 0.3378 to 0.3389 V. The pre-#455 MOS6 rows moved too (3782 to 3788 points; abs RMS down on 30 and up on 14 of 44 signals, v(13) 1.132 to 1.234 V); #455 supersedes them. Bounded VBIC small-signal .ac/.pz (#446, PR #457) changes only ngspice/vbic-common-emitter-ac and the vbic-fo spice-ts signal list (two internal excess-phase nodes, no compared metric change). vbic-common-emitter-ac goes from unsupported to success, as it was in the #325 baseline, so it is no longer a status transition. That baseline success silently ran a default level-1 NPN (#382, PR #392); this is the first real VBIC comparison. AC (500 of 501 points aligned, one excluded out of range): i(vmeas) abs max 4.63e-6 A (relative max 1.08e-7), v(1) 1.84e-4 V, v(2) and v(4) 7.36e-5 V, i(vcc) 7.36e-8 A, v(3) 1.03e-9 V. PZ is a published loss (#451): spice-ts finds 3 poles and 1 zero against ngspice 7 and 6, and the four compared values are off by 1.14e12 (pole(1)), 5.41e11 (pole(2)), 8.65e10 (pole(3)) and 1.25e12 (zero(1)), with relative errors 0.95 to 1.0. zero(1) sets the absolute max and RMS envelope at 1251172988128.5068. MOSFET level 6 (#447, PR #455) changes only the three MOS6 fixtures. Gains: ngspice/mos6-inverter-transient and classic/mos6-inverter-chain (same deck, 3788 to 3872 points) worst abs max 5.0044 V v(43) to 0.2798 V v(xndinv4.14), with v(43) 5.0044 to 0.00623 V and abs RMS down on 41 of 44 signals; ngspice/mos6-simple-inverter-transient (2767 to 590 points) v(11) 2.956 to 0.2215 V (RMS 0.712 to 0.0216 V) and i(vdd) 2.32e-4 to 8.14e-5 A. Published losses: i(vin) abs RMS 5.22e-6 to 1.61e-5 A on mos6-simple-inverter-transient (abs max 1.53e-5 to 2.27e-5 A) and 7.09e-6 to 1.47e-5 A on the two mos6inv rows (abs max falls 3.69e-5 to 3.21e-5 A), from trapezoidal ringing in the source current (#461); mos6-simple-inverter-transient i(vdd) rel max 1729 to 22447; mos6inv v(1) abs RMS 2.3e-16 to 5.4e-16 V. Without vbic-common-emitter-ac the worst absolute max is now 4.7543 V on ngspice/mos-amplifier-transient v(6) (unchanged), and the worst absolute RMS stays 2.6555 V on its v(5). Totals across these three merges: spice-ts 62/1/37 to 63/1/36, 68 to 70 analyses, 50 to 51 fixtures, 950 to 960 absolute and 915 to 924 relative signals. Absolute samples change from 9,487,166 to 9,486,322 and relative samples from 9,450,858 to 9,447,756; excluded zero references change from 36,308 to 38,566. ngspice is unchanged at 52/9/39. Diode NBV/TBV1 breakdown parity (#438/#429, PR #460), merged next, leaves every compared metric, grid and status unchanged: a full run on 4ed111e reproduces the 3490527 per-fixture metrics exactly. This refresh (#467) adds only gap links: #451 on ngspice/vbic-common-emitter-ac and #461 on the three MOS6 fixtures. No fixture or tolerance changed.',
    'Merged after the 4ed111e run above (PR #470 head b8b3173, outcome fedbff5e), bisected the same way: one full 100-fixture run per main commit with the b8b3173 harness merged in, with the SOURCES.md pin set to that commit\'s catalogue in the throwaway worktree. Pencil-eigenvalue .pz (#451, PR #466, main 6bae695) changes the outcome to e1bd8b6a, only on the three pole-zero fixtures. It supersedes the #451 PZ loss and the 1251172988128.5068 envelope stated above. ngspice/vbic-common-emitter-ac PZ now reports 7 poles and 6 zeros, the same counts as ngspice, and all 13 are compared (4 to 13 signals): relative errors are 1.26e-9 to 1.20e-7, the largest absolute errors are 13716.6 on zero(1) and 13002.8 on pole(1), whose magnitudes are 1.2e12 to 1.3e12, and pole(7) is off by 7.0e-4. zero(1) still sets the absolute max and absolute RMS envelope, now at 13716.60302734375 (a single-point PZ signal, so max equals RMS). classic/pole-zero-four-stage worst abs max falls from 0.01295 (pole(1)) to 1.49e-8 (pole(3)), and classic/pole-zero-three-stage from 0.004812 (pole(3), relative 2.4e-4) to 3.65e-12 on all three poles. Signals change from 960 to 969 absolute and from 924 to 933 relative, and samples by 9. No status changes. Nonlinear device charges integrated with NIintegrate state (#456, PR #463, main 0f50fb1) changes the outcome to b9cb7e52 on 15 transient analyses; every DC, OP, AC, noise, disto and PZ analysis is unchanged, and so are the three MOS6 fixtures, which #463 does not cover (remaining scope #468). Gains: BJT/MOS transients take far fewer points at similar or lower worst error: classic/rca3040-wideband-amplifier TRAN worst v(14) 0.3534 to 0.3386 V (RMS 0.197 to 0.152 V) on 3993 to 714 points, classic/rtl-inverter-chain v(5) 0.2959 to 0.2849 V on 3247 to 234 points, classic/bjt-differential-pair 3184 to 159 points at an unchanged 0.1194 V worst, corpus-e/bjt-diffpair-transient 3193 to 166 points and corpus-e/bjt-diffpair-current-source 3291 to 228 points; ngspice/schmitt-trigger and classic/ecl-schmitt-trigger abs RMS down on 8 of 10 signals (v(6) RMS 0.461 to 0.277 V); ngspice/mos-amplifier-transient and classic/mos-amplifier v(5) abs RMS 2.656 to 2.334 V on 1855 to 716 points; classic/coupled-lossy-lines worst 0.889 V v(x3.1) to 0.870 V v(x3.3), abs RMS down on 28 of 47, and v(5) rel max 321200768925.4484 to 248110022136.66394 (rel RMS 6400132539.273393 to 5222101415.434834), which lowers the relative envelope; classic/mos-memory-cell v(8) 1.909 to 1.906 V. Published losses: ngspice/mesa-oscillator worst 0.1782 V v(8) to 0.3582 V v(4), abs RMS up on 36 of 37 signals (v(2) RMS 0.025 to 0.106 V) on 2089 to 3861 points, a start-up phase shift from voltage-based step control (#469); corpus-e/bjt-rtl-inverter-chain TRAN v(3) 0.2949 to 0.5997 V, v(2) 0.119 to 0.214 V and i(vcc) 3.96e-4 to 6.00e-4 A on 3229 to 170 points (ngspice 80), also #469; ngspice/mos-amplifier-transient and classic/mos-amplifier worst v(6) 4.754 to 4.805 V, abs RMS up on 9 of 24; ngspice/hfet-inverter v(3) abs RMS 1.261 to 1.328 V (rel max 574 to 6771) at unchanged 2.272 V and 2.231 V worst abs max (558 to 457 points); classic/rtl-inverter-chain v(5) abs RMS 0.041 to 0.145 V; corpus-e/bjt-diffpair-transient abs RMS up on 7 of 12 (v(5) 0.040 to 0.056 V); corpus-e/bjt-diffpair-current-source v(5) 0.1291 to 0.1309 V, abs RMS up on 6 of 12; classic/bjt-differential-pair abs RMS up on 6 of 12; classic/lossy-line-24-inch v(2) 1.132 to 1.134 V and v(3) rel max 196 to 1059 (3112 to 3151 points). Absolute samples change from 9,486,331 to 9,270,848, relative samples from 9,447,765 to 9,233,357, and excluded zero references from 38,566 to 37,491. Diode sidewall charge with the bottom F1 above FCS*VJSW and the MODEINITPRED junction predictor (#450, PR #471, main 25dd3ed) changes the outcome to 6f8aa84d, only on the three diode-bearing lossy-line transients. Gains: classic/lossy-line-aluminium abs RMS down on 224 and up on 36 of 261 signals at an unchanged worst abs max of 1.347 V v(3) (3970 to 3976 points); classic/lossy-line-24-inch abs RMS down on all 3 signals and v(3) rel max 1059 to 193 (3151 to 3143 points); classic/coupled-lossy-lines worst 0.870 to 0.866 V v(x3.3) (3820 to 3810 points). Published losses: classic/coupled-lossy-lines abs RMS up on 32 of 47 signals and v(5) rel max 248110022136.66394 to 248284946174.52246 (rel RMS 5222101415.434834 to 5233588211.050267), which sets the relative envelope; classic/lossy-line-24-inch v(2) abs max 1.134 to 1.135 V. Absolute samples change from 9,270,848 to 9,271,920, relative samples from 9,233,357 to 9,234,466, and excluded zero references from 37,491 to 37,454. Without the PZ rows the worst absolute max is now 4.805 V and the worst absolute RMS 2.334 V, both on ngspice/mos-amplifier-transient (v(6) and v(5)). Engine totals stay at 52/9/39 (ngspice) and 63/1/36 (spice-ts), and coverage at 70 analyses across 51 fixtures, through all three merges. No fixture, tolerance or harness logic changed.',
    'Merged after the 25dd3ed run above (PR #470 head 44d2d62, outcome 2d1d8d2f), bisected the same way: one full 100-fixture run per main commit with the 44d2d62 harness merged in. The M2 scaling runtime benchmark (#426, PR #476, main 34e85e9) adds files outside the corpus and leaves benchmarks/SOURCES.md unchanged: aggregate-report.ts --check passes on that merge and reproduces outcome 2d1d8d2f exactly. VBIC substrate terminal and thermal-node rejection (#453, PR #473, main 3a7ad44, SOURCES.md pin set to its catalogue in the throwaway worktree) changes the outcome to 20093b20, only on the two VBIC fixtures; no status, grid or signal list changes. Gains: ngspice/vbic-common-emitter-ac AC abs RMS down on all 6 signals (i(vmeas) abs max 4.63e-6 to 2.87e-6 A, relative max 1.08e-7 to 6.67e-8; v(1) 1.84e-4 to 1.21e-4 V); its PZ abs error falls on all 13 poles and zeros (zero(1) 13716.6 to 7022.0, pole(1) 13002.8 to 7175.3, zero(2) 569.0 to 140.0, pole(7) 7.0e-4 to 5.2e-4) and the worst relative error falls from 1.20e-7 to 7.62e-8 (pole(6)); ngspice/vbic-fo DC i(v1) and i(vb) relative max 1.24e-3 to 9.29e-4 (rel RMS 8.08e-5 to 6.47e-5). pole(1) now sets the absolute max and absolute RMS envelope at 7175.34033203125 (a single-point PZ signal, so max equals RMS); this supersedes the 13716.60302734375 envelope stated above. Published losses: ngspice/vbic-fo i(v1) and i(vb) abs max 3.7715827e-6 to 3.7715832e-6 A and i(vc) 6.7147750e-6 to 6.7147755e-6 A (each about +5e-13 A), and their abs RMS 2.25100978e-7 to 2.25101017e-7 A (i(v1), i(vb)) and 2.89437148e-7 to 2.89437158e-7 A (i(vc)). Recording the M2 scaling deck sources (#480, PR #481, main ef8c5d4) edits only benchmarks/SOURCES.md and CI: the run on the merged branch, with the SOURCES.md pin moved from b88cb2bb to 53cd510c, reproduces every per-fixture metric, grid and status of the 3a7ad44 run. Engine totals stay at 52/9/39 (ngspice) and 63/1/36 (spice-ts), coverage at 70 analyses across 51 fixtures and 969/933 signals, and matched samples at 9,271,920 absolute and 9,234,466 relative through all three merges. The relative envelope (classic/coupled-lossy-lines v(5)) is unchanged. No fixture, tolerance or harness logic changed.',
    'Merged after the ef8c5d4 run above (PR #470 head cc21aec, outcome 3cd2ed62), bisected the same way: one full 100-fixture run per main commit with the cc21aec harness merged in and the SOURCES.md pin set to that commit\'s catalogue in the throwaway worktree. ngspice true gmin stepping as the DC operating-point fallback (#462, PR #474, main 90b461b, pin 7c3bae20) changes the outcome to 5a57e79a only through the pin: every per-fixture metric, grid and status equals the ef8c5d4 run, because no corpus fixture reaches the fallback. The MNA stamp value-slot cache in transient assembly (#475, PR #485, main 9ba80af, same pin) reproduces outcome 5a57e79a exactly, so it is outcome-neutral. MOS6 Meyer and junction charges integrated with TransientChargeState (#468, PR #478, main 1e8d9f8, pin cdd28c98) changes the outcome on the three MOS6 fixtures only; no status, signal list or envelope changes. Gains: ngspice/mos6-simple-inverter-transient (590 to 321 points, ngspice 308) v(11) abs max 0.2215 to 0.1057 V (RMS 0.0216 to 0.0124 V), i(vdd) 8.14e-5 to 6.17e-7 A (rel max 22447 to 1.16) and i(vin) 2.27e-5 to 2.01e-6 A (RMS 1.61e-5 to 2.28e-7 A), which removes the i(vdd) rel max and i(vin) RMS losses published for #455; on ngspice/mos6-inverter-transient and classic/mos6-inverter-chain (same deck) i(vin) abs max 3.21e-5 to 1.13e-5 A (RMS 1.47e-5 to 9.05e-7 A) and i(vdd) 1.97e-4 to 4.35e-5 A (RMS 8.62e-5 to 1.12e-5 A), so the #461 i(vin) RMS loss on all three MOS6 rows shrinks by 16x to 71x (#461 stays open: mos6inv i(vin) still alternates more often than ngspice). Published losses: on ngspice/mos6-inverter-transient and classic/mos6-inverter-chain (3872 to 912 points, ngspice 315) the worst abs max rises from 0.2798 V v(xndinv4.14) to 0.3261 V v(xndinv3.14) (v(xndinv3.14) 0.2719 to 0.3261 V, RMS 0.0106 to 0.0247 V; v(xndinv4.14) 0.2798 to 0.3239 V, RMS 0.0098 to 0.0294 V), abs max is worse on 39 and abs RMS on 36 of 44 signals, v(5) 0.0076 to 0.0752 V, v(43) 0.0062 to 0.0724 V and v(42) rel max 233.7 to 1.945e5. These voltage errors scale with RELTOL: spice-ts transient Newton lacks ngspice\'s MOS6 device convergence test and MODEINITPRED, which the old generic C(v) history hid by taking about 4x more steps (#479). mos6-simple-inverter-transient v(1) abs max moves 2.7e-15 to 3.6e-15 V, at rounding level. Absolute samples change from 9,271,920 to 9,010,095, relative samples from 9,234,466 to 8,983,151, and excluded zero references from 37,454 to 26,944. The absolute envelope (7175.34033203125, vbic-common-emitter-ac pole(1)) and the relative envelope (classic/coupled-lossy-lines v(5)) are unchanged; without the PZ rows the worst absolute max and RMS stay 4.805 V and 2.334 V on ngspice/mos-amplifier-transient. Engine totals stay at 52/9/39 (ngspice) and 63/1/36 (spice-ts), and coverage at 70 analyses across 51 fixtures and 969/933 signals, through all three merges. No fixture, tolerance or harness logic changed.',
    'The runtime sums in the totals above are single samples on a shared, heavily loaded host. No spice-ts run hit the 120000 ms bound in this run. They are not comparable with the previous 77150.906 / 270491.926 ms sample and support no speed claim.',
  ],
};

const GAP_ISSUES = [
  { url: 'https://github.com/mfiumara/spice-ts/issues/76', scope: 'parser syntax, directives, expressions, and unsupported device cards' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/75', scope: 'noise, pole-zero, and distortion analyses' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/7', scope: 'transmission-line devices' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/5', scope: 'BJT model coverage' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/3', scope: 'MOS model coverage' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/123', scope: 'jimi-fuzz transient waveform divergence' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/280', scope: 'newly exposed classic-corpus execution failures and RCA3040 regression' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/366', scope: 'non-terminating xyce/inductor-transient simulation' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/391', scope: 'unmapped .disto results in the corpus harness (classic/diode-distortion now compared; see the ledger)' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/427', scope: 'MOS1 inverter transient supply-current spike after #417 (closed by PR #436; residual mos1-inverter-sweep TRAN losses published in the ledger)' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/432', scope: 'transient output emitted before .tran TSTART (closed by PR #440)' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/451', scope: '.pz root-finder missed poles and zeros on wide-spread time constants (closed by PR #466; vbic-common-emitter-ac now matches ngspice\'s 7 poles and 6 zeros at relative error up to 1.2e-7)' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/468', scope: 'MOS6 (level 6) still uses the generic C(v) trapezoidal history instead of the #456 charge state' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/469', scope: 'charge-based LTE (ngspice CKTterr) for device charges; targets the post-#456 mesa-oscillator and bjt-rtl-inverter-chain step-control losses' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/461', scope: 'trapezoidal ringing in source currents driving voltage-dependent capacitance (MOS6 i(vin) loss)' },
] as const;

function sha256(input: Buffer | string): string {
  return createHash('sha256').update(input).digest('hex');
}

async function filesBelow(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(entries.map(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  }));
  return paths.flat().sort();
}

async function provenance(root: string): Promise<AggregateReport['provenance']> {
  const fixtureFiles = (await Promise.all(
    CORPORA.map(corpus => filesBelow(resolve(root, `benchmarks/corpus/${corpus}`))),
  )).flat().sort();
  const fixtureTree = createHash('sha256');
  for (const path of fixtureFiles) {
    fixtureTree.update(relative(root, path));
    fixtureTree.update('\0');
    fixtureTree.update(await readFile(path));
    fixtureTree.update('\0');
  }
  return {
    fixtureTreeSha256: fixtureTree.digest('hex'),
    sourcesSha256: sha256(await readFile(resolve(root, 'benchmarks/SOURCES.md'))),
  };
}

async function readManifest(root: string, corpus: CorpusId): Promise<CorpusManifest> {
  return JSON.parse(
    await readFile(resolve(root, `benchmarks/corpus/${corpus}/manifest.json`), 'utf8'),
  ) as CorpusManifest;
}

const REFRESH_GUIDANCE = 'If the change is intended, refresh with `pnpm exec tsx benchmarks/aggregate-report.ts`, '
  + 'update the pinned hashes in benchmarks/aggregate-report.ts, and commit the regenerated '
  + 'benchmarks/aggregate-report.json and benchmarks/AGGREGATE_PARITY.md.';

/**
 * Validates every aggregate input without running an engine, so stale provenance fails in
 * seconds instead of after all fixtures. Read-only: safe to run concurrently.
 */
export async function preflightAggregateInputs(root = resolve('.')): Promise<AggregateReport['provenance']> {
  for (const corpus of CORPORA) {
    const manifest = await readManifest(root, corpus);
    if (manifest.circuits.length !== FIXTURES_PER_CORPUS) {
      throw new Error(`${corpus}: expected ${FIXTURES_PER_CORPUS} fixtures, found ${manifest.circuits.length}`);
    }
    for (const circuit of manifest.circuits) {
      const digest = sha256(await readFile(resolve(root, circuit.localPath)));
      if (digest !== circuit.sha256) {
        throw new Error(
          `${corpus}/${circuit.id}: fixture SHA-256 mismatch for ${circuit.localPath} (manifest ${circuit.sha256}, actual ${digest})`,
        );
      }
    }
  }

  const actual = await provenance(root);
  const stale = [
    ['benchmarks/SOURCES.md', SOURCES_SHA256, actual.sourcesSha256],
    [`aggregate fixture tree (benchmarks/corpus/{${CORPORA.join(',')}})`, FIXTURE_TREE_SHA256, actual.fixtureTreeSha256],
  ].filter(([, pinned, current]) => pinned !== current);
  if (stale.length > 0) {
    const details = stale.map(([input, pinned, current]) => `${input} SHA-256 pinned ${pinned}, actual ${current}`);
    throw new Error(`aggregate provenance is stale: ${details.join('; ')}. ${REFRESH_GUIDANCE}`);
  }
  return actual;
}

/**
 * Publishes generated artifacts through per-run temporary files and atomic renames, so a
 * concurrent reader (for example another lane's --check) never observes a torn file.
 */
export async function writeAggregateArtifacts(
  paths: { jsonPath: string; markdownPath: string },
  json: string,
  md: string,
): Promise<void> {
  const runId = `${process.pid}.${randomUUID()}`;
  await Promise.all([[paths.jsonPath, json], [paths.markdownPath, md]].map(async ([path, content]) => {
    const temporary = `${path}.${runId}.tmp`;
    try {
      await writeFile(temporary, content);
      await rename(temporary, path);
    } finally {
      await rm(temporary, { force: true });
    }
  }));
}

function commandVersion(command: string, args: string[], pattern?: RegExp): string {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) return 'unavailable';
  const output = `${result.stdout}\n${result.stderr}`;
  return pattern?.exec(output)?.[0] ?? output.trim().split(/\r?\n/).find(Boolean) ?? 'unknown';
}

function normalizeStatus(execution: EngineExecution, expected?: ExpectedStatus): Status {
  if (execution.status === 'success') return 'success';
  if (execution.status === 'unsupported' || expected?.failureKind === 'unsupported') return 'unsupported';
  return 'failed';
}

function receipt(
  execution: EngineExecution,
  expected: ExpectedStatus | undefined,
  runtimeMs: number,
  command: string[],
  digest: string,
): EngineReceipt {
  const value: EngineReceipt = {
    status: normalizeStatus(execution, expected),
    convergence: execution.convergence,
    runtimeMs: Number(runtimeMs.toFixed(3)),
    command,
    inputSha256: digest,
    analyses: execution.analyses.map(analysis => ({
      type: analysis.type,
      points: analysis.series.grid.length,
      signals: Object.keys(analysis.series.signals).sort(),
    })).sort((left, right) => left.type.localeCompare(right.type)),
  };
  if (execution.error) value.error = execution.error;
  return value;
}

function commonSignals(left: SampleSeries, right: SampleSeries): string[] {
  return Object.keys(left.signals).filter(signal => right.signals[signal] !== undefined).sort();
}

function measureInChunks(
  spiceTs: SampleSeries,
  ngspice: SampleSeries,
  signals: string[],
  options: AlignmentOptions = {},
): ComparisonMetrics {
  const chunkSize = 25_000;
  const chunks = Array.from({ length: Math.ceil(spiceTs.grid.length / chunkSize) }, (_, index) => {
    const start = index * chunkSize;
    const end = start + chunkSize;
    return alignAndMeasure({
      grid: spiceTs.grid.slice(start, end),
      signals: Object.fromEntries(signals.map(signal => [signal, spiceTs.signals[signal].slice(start, end)])),
    }, ngspice, signals, options);
  });
  const comparedSignals: ComparisonMetrics['signals'] = {};
  for (const signal of signals) {
    const parts = chunks.map(chunk => chunk.signals[signal]);
    if (parts.some(part => part.status !== 'compared')) {
      comparedSignals[signal] = { status: 'missing', missingFrom: ['spice-ts'] };
      continue;
    }
    const values = parts.filter(part => part.status === 'compared');
    const absoluteCount = values.reduce((sum, value) => sum + value.sampleCount, 0);
    const relativeCount = values.reduce((sum, value) => sum + value.relativeError.sampleCount, 0);
    comparedSignals[signal] = {
      status: 'compared',
      sampleCount: absoluteCount,
      absoluteError: {
        max: Math.max(0, ...values.map(value => value.absoluteError.max)),
        rms: absoluteCount === 0 ? 0 : Math.sqrt(values.reduce(
          (sum, value) => sum + value.absoluteError.rms ** 2 * value.sampleCount,
          0,
        ) / absoluteCount),
      },
      relativeError: {
        max: relativeCount === 0 ? null : Math.max(...values.flatMap(value => value.relativeError.max === null ? [] : [value.relativeError.max])),
        rms: relativeCount === 0 ? null : Math.sqrt(values.reduce(
          (sum, value) => sum + (value.relativeError.rms ?? 0) ** 2 * value.relativeError.sampleCount,
          0,
        ) / relativeCount),
        sampleCount: relativeCount,
        excludedZeroReferences: values.reduce((sum, value) => sum + value.relativeError.excludedZeroReferences, 0),
      },
    };
  }
  return {
    grid: {
      spiceTsPoints: spiceTs.grid.length,
      ngspicePoints: ngspice.grid.length,
      alignedPoints: chunks.reduce((sum, chunk) => sum + chunk.grid.alignedPoints, 0),
      excludedOutOfRange: chunks.reduce((sum, chunk) => sum + chunk.grid.excludedOutOfRange, 0),
    },
    signals: comparedSignals,
  };
}

/**
 * Matches every spice-ts analysis with its ngspice counterpart. For transients the primary
 * metric does not interpolate ngspice across a breakpoint step it leaves unresolved (#445);
 * the pre-#445 linear metric is retained alongside it.
 */
export function compareExecutions(left: EngineExecution, right: EngineExecution): ComparisonReceipt[] {
  const comparisons: ComparisonReceipt[] = [];
  for (const spiceAnalysis of left.analyses) {
    const ngspiceAnalysis = findMatchingAnalysis(right.analyses, spiceAnalysis);
    if (!ngspiceAnalysis) continue;
    const signals = commonSignals(spiceAnalysis.series, ngspiceAnalysis.series);
    if (signals.length === 0) continue;
    comparisons.push({
      analysis: spiceAnalysis.type,
      signals,
      metrics: measureInChunks(spiceAnalysis.series, ngspiceAnalysis.series, signals, {
        breakpoints: spiceAnalysis.type === 'tran'
          ? sharedGridPoints(spiceAnalysis.series.grid, ngspiceAnalysis.series.grid)
          : undefined,
      }),
      linearMetrics: measureInChunks(spiceAnalysis.series, ngspiceAnalysis.series, signals),
    });
  }
  return comparisons.sort((a, b) => a.analysis.localeCompare(b.analysis));
}

function gapIssues(circuit: CorpusCircuit): string[] {
  const text = `${circuit.category} ${circuit.analyses.join(' ')} ${circuit.spiceTs.reason ?? ''}`.toLowerCase();
  const issues = new Set<string>(['https://github.com/mfiumara/spice-ts/issues/76']);
  if (/noise|pole|pz|disto/.test(text)) issues.add('https://github.com/mfiumara/spice-ts/issues/75');
  if (/transmission|lossy|ltra/.test(text)) issues.add('https://github.com/mfiumara/spice-ts/issues/7');
  if (/bjt|vbic|npn|pnp/.test(text)) issues.add('https://github.com/mfiumara/spice-ts/issues/5');
  if (/mos|bsim/.test(text)) issues.add('https://github.com/mfiumara/spice-ts/issues/3');
  if (circuit.id === 'jimi-fuzz') issues.add('https://github.com/mfiumara/spice-ts/issues/123');
  if (circuit.localPath.endsWith('/INDUCTOR/inductor.cir')) issues.add('https://github.com/mfiumara/spice-ts/issues/366');
  if (circuit.localPath.endsWith('/d_mos1.inv1.ckt')) issues.add('https://github.com/mfiumara/spice-ts/issues/427');
  if (circuit.localPath.endsWith('/mesa/mesosc.cir')) issues.add('https://github.com/mfiumara/spice-ts/issues/432');
  if (circuit.localPath.endsWith('/vbic/CEamp.cir')) issues.add('https://github.com/mfiumara/spice-ts/issues/451');
  if (/\/mos6\/(mos6inv|simpleinv)\.cir$|\/spice3f5\/mos6inv\.cir$/.test(circuit.localPath)) issues.add('https://github.com/mfiumara/spice-ts/issues/461');
  if (['mos6-inverter-chain', 'mos-amplifier', 'mos-memory-cell', 'rca3040-wideband-amplifier'].includes(circuit.id)) {
    issues.add('https://github.com/mfiumara/spice-ts/issues/280');
  }
  return [...issues];
}

async function timed(run: () => Promise<EngineExecution>): Promise<{ execution: EngineExecution; runtimeMs: number }> {
  const started = performance.now();
  const execution = await run();
  return { execution, runtimeMs: performance.now() - started };
}

/** Same wall-clock bound the classic runner applies to every ngspice subprocess. */
export const SPICE_TS_TIMEOUT_MS = 120_000;
const SPICE_TS_CHILD_FLAG = '--spice-ts-child';

/**
 * Runs the in-process spice-ts adapter inside a child process so a non-terminating
 * simulation is recorded as a failed execution instead of stalling the aggregate.
 * The child reports its own adapter runtime; v8 serialization preserves typed arrays
 * and non-finite samples exactly.
 */
export async function runBoundedSpiceTs(
  input: Buffer,
  circuit: ClassicCircuit,
  timeoutMs: number,
): Promise<{ execution: EngineExecution; runtimeMs: number }> {
  const directory = await mkdtemp(resolve(tmpdir(), 'spice-ts-aggregate-'));
  const inputPath = resolve(directory, 'fixture.cir');
  const circuitPath = resolve(directory, 'circuit.json');
  const outputPath = resolve(directory, 'execution.v8');
  const started = performance.now();
  try {
    await writeFile(inputPath, input);
    await writeFile(circuitPath, JSON.stringify(circuit));
    const completed = spawnSync(
      process.execPath,
      [...process.execArgv, fileURLToPath(import.meta.url), SPICE_TS_CHILD_FLAG, inputPath, circuitPath, outputPath],
      { cwd: process.cwd(), encoding: 'utf8', timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024 },
    );
    if (completed.error || completed.status !== 0) {
      const timedOut = (completed.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT';
      const detail = timedOut
        ? `spice-ts exceeded the ${timeoutMs} ms aggregate execution bound`
        : completed.error?.message || [completed.stderr, completed.stdout].filter(Boolean).join('\n').trim()
          || `spice-ts child exited ${completed.status}`;
      return {
        execution: { status: 'failed', convergence: timedOut ? 'failed' : 'not-run', analyses: [], error: detail.slice(0, 1000) },
        runtimeMs: performance.now() - started,
      };
    }
    return deserialize(await readFile(outputPath)) as { execution: EngineExecution; runtimeMs: number };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function spiceTsChild(inputPath: string, circuitPath: string, outputPath: string): Promise<void> {
  const input = await readFile(inputPath);
  const circuit = JSON.parse(await readFile(circuitPath, 'utf8')) as ClassicCircuit;
  await writeFile(outputPath, serialize(await timed(() => runNativeSpiceTs(input, circuit))));
}

function deterministicView(report: Omit<AggregateReport, 'outcomeSha256'> | AggregateReport): unknown {
  return JSON.parse(JSON.stringify(
    report,
    (key, value) => key === 'outcomeSha256' || key === 'environment' || key === 'runtimeMs' || key === 'error'
      ? undefined
      : value,
  ));
}

function deterministicDigest(report: Omit<AggregateReport, 'outcomeSha256'> | AggregateReport): string {
  return sha256(`${JSON.stringify(deterministicView(report))}\n`);
}

function countStatuses(fixtures: FixtureReceipt[], engine: 'ngspice' | 'spiceTs'): Record<Status, number> {
  const totals: Record<Status, number> = { success: 0, failed: 0, unsupported: 0 };
  for (const fixture of fixtures) totals[fixture[engine].status] += 1;
  return totals;
}

function runtimeSums(fixtures: FixtureReceipt[]): AggregateReport['totals']['runtimeMs'] {
  const sum = (engine: 'ngspice' | 'spiceTs') => Number(fixtures
    .reduce((total, fixture) => total + fixture[engine].runtimeMs, 0)
    .toFixed(3));
  return { ngspice: sum('ngspice'), spiceTs: sum('spiceTs') };
}

export function matchedPointEnvelope(fixtures: FixtureReceipt[]): MatchedPointEnvelope {
  const compared = fixtures.flatMap(fixture => fixture.comparisons.flatMap(comparison =>
    Object.values(comparison.metrics.signals).filter(signal => signal.status === 'compared'),
  ));
  const relative = compared.filter(signal => signal.relativeError.max !== null);
  return {
    comparedSignals: compared.length,
    relativeComparedSignals: relative.length,
    absoluteSamples: compared.reduce((sum, signal) => sum + signal.sampleCount, 0),
    relativeSamples: compared.reduce((sum, signal) => sum + signal.relativeError.sampleCount, 0),
    excludedZeroReferences: compared.reduce((sum, signal) => sum + signal.relativeError.excludedZeroReferences, 0),
    maximumAbsoluteError: Math.max(0, ...compared.map(signal => signal.absoluteError.max)),
    maximumAbsoluteRms: Math.max(0, ...compared.map(signal => signal.absoluteError.rms)),
    maximumRelativeError: relative.length === 0 ? null : Math.max(...relative.map(signal => signal.relativeError.max as number)),
    maximumRelativeRms: relative.length === 0 ? null : Math.max(...relative.map(signal => signal.relativeError.rms as number)),
  };
}

export function validateAggregateAccounting(report: AggregateReport): void {
  if (
    report.provenance.fixtureTreeSha256 !== FIXTURE_TREE_SHA256
    || report.provenance.sourcesSha256 !== SOURCES_SHA256
  ) {
    throw new Error(
      `aggregate provenance changed: fixture tree ${report.provenance.fixtureTreeSha256}; sources ${report.provenance.sourcesSha256}`,
    );
  }
  if (report.fixtures.length !== TOTAL_FIXTURES || report.totals.fixtures !== TOTAL_FIXTURES) {
    throw new Error(`aggregate accounting must contain ${TOTAL_FIXTURES} fixtures`);
  }

  if (new Set(report.fixtures.map(fixture => fixture.key)).size !== TOTAL_FIXTURES) {
    throw new Error(`aggregate accounting must contain ${TOTAL_FIXTURES} unique fixture keys`);
  }
  if (new Set(report.fixtures.map(fixture => fixture.localPath)).size !== TOTAL_FIXTURES) {
    throw new Error(`aggregate accounting must contain ${TOTAL_FIXTURES} unique local paths`);
  }
  if (new Set(report.fixtures.map(fixture => fixture.input.sha256)).size !== TOTAL_FIXTURES) {
    throw new Error(`aggregate accounting must contain ${TOTAL_FIXTURES} unique input hashes`);
  }

  for (const corpus of CORPORA) {
    const actual = report.fixtures.filter(fixture => fixture.corpus === corpus).length;
    if (actual !== FIXTURES_PER_CORPUS || report.totals.corpusFixtures[corpus] !== actual) {
      throw new Error(`${corpus}: aggregate accounting must contain ${FIXTURES_PER_CORPUS} fixtures`);
    }
  }
  if (report.corpusSources.length !== CORPORA.length) {
    throw new Error(`aggregate accounting must retain ${CORPORA.length} corpus sources`);
  }

  for (const fixture of report.fixtures) {
    if (
      fixture.input.identicalForBothEngines !== true
      || fixture.ngspice.inputSha256 !== fixture.input.sha256
      || fixture.spiceTs.inputSha256 !== fixture.input.sha256
    ) {
      throw new Error(`${fixture.key}: engine input hashes must match the byte-identical fixture`);
    }
  }

  for (const engine of ['ngspice', 'spiceTs'] as const) {
    const statuses = report.totals[engine];
    if (statuses.success + statuses.failed + statuses.unsupported !== TOTAL_FIXTURES) {
      throw new Error(`${engine} outcomes must reconcile to ${TOTAL_FIXTURES} fixtures`);
    }
    if (JSON.stringify(statuses) !== JSON.stringify(countStatuses(report.fixtures, engine))) {
      throw new Error(`${engine} outcome totals differ from per-fixture outcomes`);
    }
  }

  const comparedFixtures = report.fixtures.filter(fixture => fixture.comparisons.length > 0).length;
  const comparedAnalyses = report.fixtures.reduce((sum, fixture) => sum + fixture.comparisons.length, 0);
  if (report.totals.comparedFixtures !== comparedFixtures || report.totals.comparedAnalyses !== comparedAnalyses) {
    throw new Error('comparison totals differ from per-fixture error availability');
  }
  if (JSON.stringify(report.totals.runtimeMs) !== JSON.stringify(runtimeSums(report.fixtures))) {
    throw new Error('runtime sums differ from per-fixture receipts');
  }
  if (JSON.stringify(report.matchedPointEnvelope) !== JSON.stringify(matchedPointEnvelope(report.fixtures))) {
    throw new Error('matched-point envelope differs from per-signal metrics');
  }
  for (const transition of report.comparisonToPrevious.statusTransitions) {
    const fixture = report.fixtures.find(candidate => candidate.key === transition.fixture);
    if (!fixture || fixture[transition.engine].status !== transition.to || transition.explanation.length === 0) {
      throw new Error(`${transition.engine}/${transition.fixture}: invalid or unexplained status transition`);
    }
  }
}

export async function buildAggregateReport(): Promise<AggregateReport> {
  const inputProvenance = await preflightAggregateInputs();
  const fixtures: FixtureReceipt[] = [];
  const corpusSources: AggregateReport['corpusSources'] = [];

  for (const corpus of CORPORA) {
    const manifest = await readManifest(resolve('.'), corpus);
    if (manifest.circuits.length !== FIXTURES_PER_CORPUS) {
      throw new Error(`${corpus}: expected ${FIXTURES_PER_CORPUS} fixtures, found ${manifest.circuits.length}`);
    }
    corpusSources.push({ id: corpus, ...manifest.source, fixtureCount: manifest.circuits.length });

    for (const circuit of manifest.circuits) {
      const input = await readFile(resolve(circuit.localPath));
      const digest = sha256(input);
      if (digest !== circuit.sha256) throw new Error(`${corpus}/${circuit.id}: fixture SHA-256 mismatch`);
      const compatible = circuit as ClassicCircuit;
      const ngspice = await timed(() => runNativeNgspice(input, compatible));
      const spiceTs = await runBoundedSpiceTs(input, compatible, SPICE_TS_TIMEOUT_MS);
      fixtures.push({
        key: `${corpus}/${circuit.id}`,
        corpus,
        id: circuit.id,
        category: circuit.category,
        declaredAnalyses: circuit.analyses,
        localPath: circuit.localPath,
        input: { bytes: input.byteLength, sha256: digest, identicalForBothEngines: true },
        ngspice: receipt(ngspice.execution, circuit.ngspice, ngspice.runtimeMs, ['ngspice', '-b', '-r', '<raw>', '<identical-fixture>'], digest),
        spiceTs: receipt(spiceTs.execution, circuit.spiceTs, spiceTs.runtimeMs, ['@spice-ts/core', 'simulate', '<identical-fixture>'], digest),
        comparisons: compareExecutions(spiceTs.execution, ngspice.execution),
        gapIssues: gapIssues(circuit),
      });
    }
  }

  const corpusFixtures = Object.fromEntries(CORPORA.map(corpus => [corpus, fixtures.filter(fixture => fixture.corpus === corpus).length])) as Record<CorpusId, number>;
  const base: Omit<AggregateReport, 'outcomeSha256'> = {
    schemaVersion: SCHEMA,
    provenance: inputProvenance,
    corpusSources,
    environment: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model ?? 'unknown', node: process.version },
    tools: {
      spiceTs: (JSON.parse(await readFile(resolve('packages/core/package.json'), 'utf8')) as { version: string }).version,
      ngspice: commandVersion('ngspice', ['--version'], /ngspice-\d+(?:\.\d+)*/i),
      pnpm: commandVersion('pnpm', ['--version']),
    },
    commands: {
      generate: 'pnpm exec tsx benchmarks/aggregate-report.ts',
      verify: 'pnpm exec tsx benchmarks/aggregate-report.ts --check',
      ngspice: 'ngspice -b -r <raw> <identical-fixture>',
      spiceTs: '@spice-ts/core simulate(<identical-fixture>)',
    },
    policy: {
      input: 'byte-identical fixture for both engines',
      fixtureAdaptation: 'none',
      perCircuitToleranceTuning: false,
      comparisonGrid: 'spice-ts',
      interpolation: 'linear',
      breakpointAlignment: 'one-sided at time points shared by both transient grids; linear metric retained',
      timing: 'single wall-clock execution per engine and fixture; descriptive, not a speed claim',
      deterministicHashExcludes: ['environment', 'runtimeMs', 'error'],
    },
    totals: {
      fixtures: fixtures.length,
      corpusFixtures,
      ngspice: countStatuses(fixtures, 'ngspice'),
      spiceTs: countStatuses(fixtures, 'spiceTs'),
      comparedFixtures: fixtures.filter(fixture => fixture.comparisons.length > 0).length,
      comparedAnalyses: fixtures.reduce((sum, fixture) => sum + fixture.comparisons.length, 0),
      runtimeMs: runtimeSums(fixtures),
    },
    matchedPointEnvelope: matchedPointEnvelope(fixtures),
    comparisonToPrevious: PREVIOUS_REPORT,
    gapIssues: [...GAP_ISSUES],
    fixtures,
  };
  const report = { ...base, outcomeSha256: deterministicDigest(base) };
  validateAggregateAccounting(report);
  return report;
}

const METHOD_ISSUE_URL = 'https://github.com/mfiumara/spice-ts/issues/445';

/** Methodology text for the alignment the report was actually generated with. */
export function comparisonMethodLines(policy: AggregateReport['policy']): string[] {
  const base = '- Comparison method: errors are evaluated at the spice-ts output points with ngspice linearly '
    + 'interpolated onto them; relative errors divide by that ngspice value.';
  const artifact = 'At a source breakpoint both engines report the left limit, so a waveform that steps there '
    + '(for example L·di/dt at a PWL corner) shows its right limit only at the next ngspice sample. Linear '
    + 'interpolation across that interval invents values neither engine produced and charges them as error at '
    + 'every spice-ts point inside it.';
  if (policy.breakpointAlignment !== undefined) {
    return [
      base,
      `- Breakpoint alignment ([#445](${METHOD_ISSUE_URL})): ${artifact} For transients, every time point present in both engines' grids is treated as a breakpoint. Inside an ngspice interval that opens at one, each spice-ts sample is compared with the nearer of the linear interpolation and the right-sided reconstruction from the next two ngspice samples. Every other sample, analysis, and tolerance is unchanged.`,
      '- The pre-#445 plain-linear metric is still published for every comparison as `linearMetrics` in `benchmarks/aggregate-report.json`, so the change hides no loss. The envelope below uses the primary breakpoint-aligned metric.',
    ];
  }
  return [
    base,
    `- Known artifact ([#445](${METHOD_ISSUE_URL})): ${artifact} The next regeneration compares one-sided across such intervals and keeps this plain-linear metric as a secondary column.`,
  ];
}

function markdown(report: AggregateReport): string {
  const { totals } = report;
  const { matchedPointEnvelope: envelope, comparisonToPrevious: previous } = report;
  const issueNumber = previous.issueUrl.split('/').at(-1);
  const pullRequestNumber = previous.pullRequestUrl.split('/').at(-1);
  const transitionLines = previous.statusTransitions.length === 0
    ? ['- Status transitions: none. Both engines retained every prior success, failure, and unsupported classification.']
    : previous.statusTransitions.map(transition => `- ${transition.engine} \`${transition.fixture}\`: ${transition.from} → ${transition.to}. ${transition.explanation}`);
  const lines = [
    '# Aggregate 100-circuit parity report',
    '',
    'This report publishes all outcomes, including failures and unsupported cases. It makes no speed or superiority claim.',
    '',
    '## Reproduction',
    '',
    `- Generate: \`${report.commands.generate}\``,
    `- Verify committed outcomes: \`${report.commands.verify}\``,
    `- Machine: ${report.environment.cpu}; ${report.environment.platform} ${report.environment.release} ${report.environment.arch}; Node ${report.environment.node}`,
    `- Tools: spice-ts ${report.tools.spiceTs}; ${report.tools.ngspice}; pnpm ${report.tools.pnpm}`,
    `- Deterministic outcome SHA-256 (host, timings, and error text excluded): \`${report.outcomeSha256}\``,
    `- Aggregate fixture-tree SHA-256: \`${report.provenance.fixtureTreeSha256}\`.`,
    `- Source catalogue SHA-256: \`${report.provenance.sourcesSha256}\`.`,
    '- Runtime is one wall-clock sample per engine/fixture. Treat it as diagnostic data, not a performance comparison.',
    '',
    '## Policy and totals',
    '',
    '- Both engines receive the exact same fixture bytes; each row records the common SHA-256.',
    '- No fixture adaptation and no per-circuit tolerance tuning.',
    ...comparisonMethodLines(report.policy),
    `- Accounted fixtures: ${totals.fixtures} (${CORPORA.map(corpus => `${corpus}=${totals.corpusFixtures[corpus]}`).join(', ')}).`,
    `- ngspice: ${totals.ngspice.success} success, ${totals.ngspice.failed} failed, ${totals.ngspice.unsupported} unsupported.`,
    `- spice-ts: ${totals.spiceTs.success} success, ${totals.spiceTs.failed} failed, ${totals.spiceTs.unsupported} unsupported.`,
    `- Matched-point errors: ${totals.comparedAnalyses} analyses across ${totals.comparedFixtures} fixtures. Full per-signal max/RMS absolute and relative errors are in \`benchmarks/aggregate-report.json\`.`,
    `- Matched signals: ${envelope.comparedSignals} absolute (${envelope.absoluteSamples} samples); ${envelope.relativeComparedSignals} relative (${envelope.relativeSamples} samples, ${envelope.excludedZeroReferences} zero references excluded).`,
    `- Matched-point envelope (worst per signal): absolute max ${envelope.maximumAbsoluteError}, absolute RMS ${envelope.maximumAbsoluteRms}, relative max ${envelope.maximumRelativeError}, relative RMS ${envelope.maximumRelativeRms}.`,
    `- Descriptive single-run runtime sums: ngspice ${totals.runtimeMs.ngspice.toFixed(3)} ms; spice-ts ${totals.runtimeMs.spiceTs.toFixed(3)} ms.`,
    '',
    '## Transition from the previous accepted report',
    '',
    `- Baseline: [issue #${issueNumber}](${previous.issueUrl}), [PR #${pullRequestNumber}](${previous.pullRequestUrl}), head \`${previous.headSha}\`, outcome \`${previous.outcomeSha256}\`.`,
    `- Previous totals: ngspice ${previous.totals.ngspice.success}/${previous.totals.ngspice.failed}/${previous.totals.ngspice.unsupported} success/failed/unsupported; spice-ts ${previous.totals.spiceTs.success}/${previous.totals.spiceTs.failed}/${previous.totals.spiceTs.unsupported}; ${previous.totals.comparedAnalyses} analyses across ${previous.totals.comparedFixtures} fixtures.`,
    `- Previous matched-point envelope: absolute max ${previous.matchedPointEnvelope.maximumAbsoluteError}, absolute RMS ${previous.matchedPointEnvelope.maximumAbsoluteRms}, relative max ${previous.matchedPointEnvelope.maximumRelativeError}, relative RMS ${previous.matchedPointEnvelope.maximumRelativeRms}.`,
    ...transitionLines,
    ...previous.metricTransitions.map(transition => `- ${transition}`),
    '',
    '## Gap tracking',
    '',
    ...report.gapIssues.map(issue => `- ${issue.url} — ${issue.scope}`),
    '',
    '## Per-circuit outcomes',
    '',
    '| Fixture | Analyses | ngspice | spice-ts | Runtime ms (ng/spice-ts) | Compared analyses | Gap issues |',
    '|---|---|---|---|---:|---:|---|',
    ...report.fixtures.map(fixture => {
      const gaps = fixture.gapIssues.map(url => `[#${url.split('/').at(-1)}](${url})`).join(', ');
      return `| ${fixture.key} | ${fixture.declaredAnalyses.join(', ') || 'none'} | ${fixture.ngspice.status}/${fixture.ngspice.convergence} | ${fixture.spiceTs.status}/${fixture.spiceTs.convergence} | ${fixture.ngspice.runtimeMs}/${fixture.spiceTs.runtimeMs} | ${fixture.comparisons.length} | ${gaps} |`;
    }),
    '',
    'Every unsupported or failed spice-ts row is a published loss. Engine error strings, input hashes, commands, signal lists, point counts, and matched-point metrics are retained in the JSON report.',
    '',
  ];
  return lines.join('\n');
}

function stableReport(report: AggregateReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function verifyCommittedArtifacts(
  generated: AggregateReport,
  committedJson: string,
  committedMarkdown: string,
): void {
  let committed: AggregateReport;
  try {
    committed = JSON.parse(committedJson) as AggregateReport;
  } catch (error) {
    throw new Error(`committed aggregate JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }

  const committedProjection = JSON.stringify(deterministicView(committed));
  const generatedProjection = JSON.stringify(deterministicView(generated));
  if (committedProjection !== generatedProjection) {
    const committedByKey = new Map((committed.fixtures ?? []).map(fixture => [fixture.key, fixture]));
    const differing = (generated.fixtures ?? []).flatMap(fixture => {
      const previous = committedByKey.get(fixture.key);
      if (previous && JSON.stringify(deterministicView(previous as never)) === JSON.stringify(deterministicView(fixture as never))) return [];
      return [`${fixture.key} (spice-ts ${previous?.spiceTs.status ?? 'missing'} -> ${fixture.spiceTs.status}; ngspice ${previous?.ngspice.status ?? 'missing'} -> ${fixture.ngspice.status})`];
    });
    throw new Error(`committed aggregate deterministic JSON projection differs from regenerated outcomes; differing fixtures: ${differing.join(', ') || 'none'}`);
  }

  const digest = deterministicDigest(committed);
  if (committed.outcomeSha256 !== digest || generated.outcomeSha256 !== digest) {
    throw new Error(`aggregate deterministic JSON projection hash mismatch: committed=${committed.outcomeSha256}; regenerated=${generated.outcomeSha256}; calculated=${digest}`);
  }

  validateAggregateAccounting(committed);

  if (committedMarkdown !== markdown(committed)) {
    throw new Error('committed aggregate Markdown differs from the committed JSON projection');
  }
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check');
  // Each run is isolated (read-only inputs, per-engine temporary directories, atomic writes),
  // so concurrent runs are safe. Stop a run by its own PID, never by a global pattern match.
  process.stderr.write(`aggregate${check ? ' --check' : ''}: pid ${process.pid}; to stop only this run: kill ${process.pid}\n`);
  const report = await buildAggregateReport();
  const json = stableReport(report);
  const md = markdown(report);
  if (check) {
    const [committedJson, committedMarkdown] = await Promise.all([
      readFile(JSON_PATH, 'utf8'),
      readFile(MARKDOWN_PATH, 'utf8'),
    ]);
    verifyCommittedArtifacts(report, committedJson, committedMarkdown);
  } else {
    await writeAggregateArtifacts({ jsonPath: JSON_PATH, markdownPath: MARKDOWN_PATH }, json, md);
  }
  process.stderr.write(`aggregate: ${report.totals.fixtures} fixtures; outcome ${report.outcomeSha256}; compared ${report.totals.comparedAnalyses} analyses\n`);
}

if (process.argv[2] === SPICE_TS_CHILD_FLAG) {
  const [inputPath, circuitPath, outputPath] = process.argv.slice(3);
  spiceTsChild(inputPath, circuitPath, outputPath).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
} else if (basename(process.argv[1] ?? '') === 'aggregate-report.ts') {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
