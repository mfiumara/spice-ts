# 4-bit adder transient timeouts (#611 adder_bip, #604 adder_mos)

Diagnosis only, no simulator change. ngspice-47 finishes each of the two corpus-f 4-bit
NAND adders in about 4.5 s. spice-ts takes 7.8-10x more timesteps on both, because its
node-voltage truncation-error check limits almost every step and ngspice-47 has no such
check. That step gap does not depend on host load. Whether it becomes a timeout at the
120 s aggregate bound does:

- adder_mos (#604) times out on every host measured so far.
- adder_bip (#611) is marginal. It needed 98.1 s at a 1-minute load of 7-24 (measured by
  spice-ts-review on main + #600/#605) and 222.6 s at load 33-41 (this run). On a
  quieter host it finishes inside 120 s; on a busier one it times out.

adder_mos also has a second problem that is independent of the timeout: a BSIM3
transient mismatch.

## Reproduce

From the repository root, on a tree where `pnpm build` has run:

    CORE_DIST=$PWD/packages/core/dist/index.js \
    CORE_SRC=$PWD/packages/core/src/index.ts \
    OUT=<scratch dir> FULL_BIP_MS=900000 bash benchmarks/adder-timeout-611/run.sh
    pnpm exec tsx benchmarks/adder-timeout-611/summarize.mts <scratch dir> > benchmarks/adder-timeout-611/results.json

`run.sh` wraps every engine run in `spice-heavy`, so the host-load rule is respected. It
runs with `set -euo pipefail` and stops at the first failing step, including a failing
comparison. It records `uptime` in `load.start` and `load.end`. It runs:

- ngspice-47 `-b -r` with ASCII raw output, the same setup as corpus-f.
- `measure.mts` at the unchanged 120 s budget, once as the baseline with `--diagnose` and
  once with `--experiment no-node-lte`.
- Only when `FULL_BIP_MS` is set: one diagnostic adder_bip baseline run with that budget,
  to record whether and when it completes at the current load. The 120 s gate itself is
  unchanged.
- A 30 s V8 CPU profile, reduced by `profile-split.mts`.
- `compare.ts`, which applies the corpus-f metric: max |error| on the spice-ts grid divided
  by the ngspice peak, with a 1 % threshold (`alignAndMeasure`).

A completed adder_bip baseline records 106,319 points. `alignAndMeasure` used to call
`Math.max(...errors)`, which throws `RangeError` once the spread is too large for the
call stack (the review hit it at 106k points), and the old `run.sh` hid that with
`|| true`. The harness now
reduces with a loop, `comparison-harness.test.ts` covers 250,001 points, and `run.sh`
no longer hides failures.

The scripts:

- `measure.mts` drives the public `createTransientSim` until the run finishes or the budget
  runs out. It records accepted/rejected steps, Newton iterations, the smallest accepted
  dt, a dt histogram and, optionally, waveforms.
- `--diagnose` wraps the driver's two truncation checks on the instance. It counts which
  check rejects a trial step and which one caps the next dt. Return values are unchanged.
- `--experiment no-node-lte` zeroes the node-voltage LTE ratio. This is a diagnostic
  only, not a fix: it shows what the step count would be under ngspice's default
  timestep control.

## Decks

- `adder_bip.cir`: the corpus-f fixture `examples/digital/compare/adder_bip.cir`,
  identical bytes (sha256 `fd53a062…95aa42`).
- `adder_mos_body.cir`: corpus-f `examples/digital/compare/adder_mos.cir` with its
  `.control` block removed. spice-ts rejects `pre_set strict_errorhandling` there before
  it simulates anything. The outputs that block saved are kept as
  `.save V(9) V(10) V(11) V(12) V(13)`. The circuit is identical to
  `examples/mos/adder_mos.cir`, and both engines read these bytes.

No new fixtures are committed. `run.sh` derives the decks from the corpus-f bytes, whose
source and licence are in `benchmarks/corpus/corpus-f/SOURCES.md`.

## Tree

This PR's branch merged with `origin/main` 7c66aab9, with `packages/core/dist` built from
it. Main now contains both changes the decks need:

- #600, merged as 098da449, adds `.option noinit acct`. Without it both decks stop with
  `ParseError: Unsupported .options field: 'noinit'`.
- #605, merged as 3f26f107, adds BSIM3 reverse mode and type*VTH0. Without it adder_mos
  fails its DC operating point (nr-divergence after source and gmin stepping).

The load-independent counts (both `no-node-lte` runs, the completed adder_bip baseline)
are identical to the earlier measurement on main 8013a231 + #600 + #605 and to the
reviewer's run.

## Host

Apple M5 Pro (18 cores), macOS 27.0.1, Node v22.23.1, ngspice-47 (Homebrew).

The host was not quiet. It is shared, and `uptime` reported these 1-minute load averages:

- `run.sh`: 19.5 at the start, 37.3 at the end (21:59-22:09 CEST).
- The `FULL_BIP_MS=900000` adder_bip run: 32.6 at the start, 41.0 at the end
  (22:10-22:14 CEST). It ran as the same command `run.sh` issues, right after the main
  run.

Step and iteration counts do not depend on load. Wall times do, and so does whether
adder_bip reaches 6.4 µs inside 120 s.

## Load dependence of #611

| adder_bip baseline (unchanged code) | 1-min load | result |
|---|---|---|
| spice-ts-review, main + #600/#605 | 7-24 | completes in 98.1 s (inside 120 s, 18 % headroom) |
| this run, 120 s budget | 19.5-37.3 | stops at 3.47 of 6.4 µs (54 %) |
| this run, `FULL_BIP_MS=900000` | 32.6-41.0 | completes in 222.6 s |

The two completed runs take the same steps: 106,318 accepted, 21,534 rejected, 342,670
Newton iterations, smallest dt 2.26e-14 s. Node-voltage LTE caps 104,473 of the accepted
steps (98.3 %). Only the time per Newton iteration changes with load: 0.29 ms at load
7-24, 0.65 ms at load 33-41. The completed run matches ngspice to 2.42 % (worst v(10)),
and no output is ever at the opposite logic level.

So #611 is a marginal, load-dependent timeout, not a hard one. The 7.8x step gap against
ngspice stays either way. adder_mos (#604) is not marginal: it reaches 3.00 of 6.4 µs in
120 s here and 4.20 µs in the reviewer's lower-load run.

## Results (`results.json`, this run)

| | adder_bip | adder_mos_body |
|---|---|---|
| ngspice-47 accepted / rejected steps | 13,690 / 4,134 | 18,073 / 2,429 |
| ngspice-47 Newton iterations | 76,036 | 67,718 |
| ngspice-47 transient time (load / factor / solve / trunc) | 4.61 s (2.26 / 1.10 / 0.60 / 0.28) | 4.36 s (3.72 / 0.15 / 0.08 / 0.18) |
| spice-ts at 120 s: simulated time reached | 3.47 µs of 6.4 µs (54 %) | 3.00 µs of 6.4 µs (47 %) |
| spice-ts accepted / rejected steps at 120 s | 58,197 / 11,814 (all LTE) | 85,926 / 20,909 (20,391 LTE, 518 NR) |
| spice-ts Newton iterations at 120 s (per attempt) | 187,731 (2.68) | 318,153 (2.98) |
| spice-ts smallest accepted dt | 2.3e-14 s | 1.2e-15 s |
| accepted steps per simulated ns, spice-ts vs ngspice | 16.8 vs 2.14 (7.8x) | 28.6 vs 2.82 (10.1x) |
| accepted steps whose next dt is capped by node-voltage LTE | 57,207 (98.3 %) | 79,091 (92.0 %) |
| rejections caused by node-voltage LTE / by charge truncation alone | 11,793 (21 of them also charge-rejected) / 0 | 20,391 / 0 |
| wall time per Newton iteration, spice-ts vs ngspice (load-dependent) | 0.64 ms vs 0.061 ms | 0.38 ms vs 0.064 ms |
| CPU split (30 s profile): device eval / assembly / factor+solve / driver / GC | 49 % / 20 % / 16 % / 7 % / 7 % | 57 % / 24 % / 5 % / 5 % / 7 % |
| experiment `no-node-lte`: completes? | yes, 51.1 s; 14,024 / 4,026 steps; 89,624 iterations | yes, 28.6 s; 17,369 / 1,060 steps; 68,145 iterations |
| parity vs ngspice-47, 1 % threshold | loss: baseline window worst 2.39 %, completed baseline 2.42 %, experiment 2.84 % (all v(10)); logic levels never opposite | loss: about 100 % in both runs; outputs at the opposite logic level for 24 / 16 / 9 / 5 / 1 % (baseline window) and 25 / 17 / 10 / 4 / 1 % (experiment) of samples, v(9) .. v(13) |

The ngspice-47 rows use the single-run decks. `ngspice -b` runs the full fixture
`adder_bip.cir` twice (batch, then the `.control` run), so its counters are cumulative.
They are in `results.json` as well.

## Root cause (shared by #611 and #604)

`packages/core/src/analysis/transient-driver.ts`, `TransientSimImpl.advanceSolution()`,
rejects a step and sizes the next dt from two checks:

- `checkLTE()`: a node-voltage predictor LTE over every node not on the exempt list.
- `chargeTruncationTimestep()`: ngspice CKTtrunc, i.e. device DEVtrunc on charges.

ngspice-47 controls the timestep with CKTtrunc alone. The ngspice-47 used here does not
compile in node-voltage truncation: `.option newtrunc` prints
`Warning: Option 'newtrunc' ignored`.

On these digital decks, `checkLTE` caps 92-98 % of the accepted steps and causes every
LTE rejection, so spice-ts takes 7.8-10x more steps than ngspice. When the experiment
turns off only that check, accepted steps land within 2.4 % (bip: 14,024 vs 13,690) and
3.9 % (mos: 17,369 vs 18,073) of ngspice. Rejections land at 4,026 vs 4,134 (bip) and
1,060 vs 2,429 (mos). Both decks then finish well inside 120 s, even at load 19-37.

A separate, smaller gap is the time per Newton iteration: 0.4-0.6 ms in spice-ts against
about 0.06 ms in ngspice on the same loaded host.

### Why this card does not fix it

Dropping the node-voltage LTE changes step selection on every transient deck. Linear
decks currently depend on it, because `devices/capacitor.ts` and `devices/inductor.ts`
have no `truncateTransientStep` (CAPtrunc/INDtrunc) hook.

The fix needs three things:

1. Add CAPtrunc/INDtrunc charge and flux truncation to the linear C and L devices.
2. Drop node-voltage LTE from the default timestep control in `advanceSolution()` /
   `checkLTE()`, or restrict it to nodes that no truncating device covers.
3. Re-run the full aggregate and corpus parity under `spice-heavy`. The #598 lane owns
   the pins.

### adder_mos (#604) also needs BSIM3 work

Even when it completes (the experiment), adder_mos is about 100 % off. Its outputs sit at
the opposite logic level for a fraction of samples that halves from bit 0 to the carry.
That pattern points to a per-gate delay difference, not to wrong logic. The divergence
starts at the first input edge (3.1-3.6 ns), after a DC operating point that converges
only with #605. This is a BSIM3 transient mismatch in the #582 lane (BSIM3 device
files), and it is independent of the timestep control.

## BYPASS

Device evaluation takes 49 % (bip) and 57 % (mos) of the busy time per iteration.
Including stamping, it takes 69 % and 81 %. In ngspice, load is 49 % and 85 %.

Bypass can only skip part of the device-eval share. Even skipping all of it would cap the
gain at about 2x (bip) and 2.3x (mos), and in practice it would be less. The truncation
gap is 7.8-10x more steps. The completed adder_bip baseline needs 342,670 Newton
iterations against 89,624 in the experiment (3.8x). For adder_mos, extrapolating the
120 s baseline linearly to 6.4 µs gives about 10x the experiment's iterations. A BYPASS
card is not justified before the truncation fix lands. Re-profile after that fix.
