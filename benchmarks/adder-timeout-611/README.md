# 4-bit adder transient timeouts (#611 adder_bip, #604 adder_mos)

Diagnosis only, no simulator change. The two corpus-f 4-bit NAND adders hit the 120 s
aggregate bound in spice-ts. ngspice-47 finishes each one in about 6 s. Both decks share
one root cause: spice-ts's node-voltage truncation-error check limits almost every
timestep. ngspice-47 does not have this check. adder_mos also has a second problem that
is independent of the timeout: a BSIM3 transient mismatch.

## Reproduce

From the repository root, with a spice-ts checkout that accepts the decks (see "Tree"):

    CORE_DIST=<tree>/packages/core/dist/index.js \
    CORE_SRC=<tree>/packages/core/src/index.ts \
    OUT=<scratch dir> bash benchmarks/adder-timeout-611/run.sh
    pnpm exec tsx benchmarks/adder-timeout-611/summarize.mts <scratch dir> > benchmarks/adder-timeout-611/results.json

`run.sh` wraps every engine run in `spice-heavy`, so the host-load rule is respected. It runs:

- ngspice-47 `-b -r` with ASCII raw output, the same setup as corpus-f.
- `measure.mts` at the unchanged 120 s budget, once as the baseline with `--diagnose` and
  once with `--experiment no-node-lte`.
- A 30 s V8 CPU profile, reduced by `profile-split.mts`.
- `compare.ts`, which applies the corpus-f metric: max |error| on the spice-ts grid divided
  by the ngspice peak, with a 1 % threshold (`alignAndMeasure`).

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

The measurements use a local merge that is not pushed:

- `origin/main` 8013a231
- PR #600 at 7eace8f6, which adds `.option noinit acct`
- PR #605 at 51aaf22a, which adds BSIM3 reverse mode and type*VTH0

On main, both decks stop with `ParseError: Unsupported .options field: 'noinit'`. With
#600 but without #605, adder_mos fails its DC operating point: nr-divergence after
source and gmin stepping.

## Host

Apple M5 Pro (18 cores), macOS 27.0.1, Node v22.23.1, ngspice-47 (Homebrew).

The host was not quiet. It is shared, and the 1-minute load average was 28-38 during the
runs. Wall times are therefore upper bounds. Step and iteration counts do not depend on
load.

## Results (`results.json`)

| | adder_bip | adder_mos_body |
|---|---|---|
| ngspice-47 accepted / rejected steps | 13,690 / 4,134 | 18,073 / 2,429 |
| ngspice-47 Newton iterations | 76,036 | 67,718 |
| ngspice-47 transient time (load / factor / solve / trunc) | 6.36 s (3.12 / 1.51 / 0.78 / 0.39) | 5.66 s (4.74 / 0.20 / 0.11 / 0.25) |
| spice-ts at 120 s: simulated time reached | 3.21 µs of 6.4 µs (50 %) | 2.74 µs of 6.4 µs (43 %) |
| spice-ts accepted / rejected steps | 53,348 / 10,790 (all LTE) | 78,991 / 19,283 (18,792 LTE, 491 NR) |
| spice-ts Newton iterations (per attempt) | 171,925 (2.68) | 293,311 (2.98) |
| spice-ts smallest accepted dt | 2.3e-14 s | 1.2e-15 s |
| accepted steps per simulated ns, spice-ts vs ngspice | 16.6 vs 2.14 (7.8x) | 28.9 vs 2.82 (10.2x) |
| accepted steps whose next dt is capped by node-voltage LTE | 52,428 (98.3 %) | 72,687 (92.0 %) |
| rejections caused by node-voltage LTE / by charge truncation alone | 10,790 (20 of them also charge-rejected) / 0 | 18,792 / 0 |
| wall time per Newton iteration, spice-ts vs ngspice | 0.70 ms vs 0.084 ms | 0.41 ms vs 0.084 ms |
| CPU split (30 s profile): device eval / assembly / factor+solve / driver / GC | 50 % / 20 % / 17 % / 7 % / 5 % | 59 % / 29 % / 5 % / 4 % / 2 % |
| experiment `no-node-lte`: completes? | yes, 34.4 s; 14,024 / 4,026 steps; 89,624 iterations | yes, 16.4 s; 17,369 / 1,060 steps; 68,145 iterations |
| parity vs ngspice-47, 1 % threshold | loss: baseline window worst 2.39 % (v(10)); experiment worst 2.84 % (v(10)); logic levels never opposite | loss: about 100 % in both runs; outputs at the opposite logic level for 24 / 17 / 10 / 5 / 1 % of samples (v(9) .. v(13)) |

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
1,060 vs 2,429 (mos). Both decks then finish well inside 120 s, even on a loaded host.

A separate, smaller gap is the time per Newton iteration: 0.4-0.7 ms in spice-ts against
0.084 ms in ngspice, measured on the loaded host.

### Why this card does not fix it

Two reasons:

1. `transient-driver.ts` is touched by open PR #600.
2. Dropping the node-voltage LTE changes step selection on every transient deck. Linear
   decks currently depend on it, because `devices/capacitor.ts` and `devices/inductor.ts`
   have no `truncateTransientStep` (CAPtrunc/INDtrunc) hook.

The fix needs three things, sequenced after #600:

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
only with #605. This is a BSIM3 transient mismatch in the #582 / PR #605 lane (BSIM3
device files), and it is independent of the timestep control.

## BYPASS

Device evaluation takes 50 % (bip) and 59 % (mos) of the busy time per iteration.
Including stamping, it takes 70 % and 88 %. In ngspice, load is 49 % and 84 %.

Bypass can only skip part of the device-eval share. Even skipping all of it would cap the
gain at 2x (bip) and 2.4x (mos), and in practice it would be less. The truncation gap is
7.8-10x more steps. Extrapolating the baseline linearly to the full 6.4 µs, the experiment
needs about 3.8x (bip) and 10x (mos) fewer Newton iterations. A BYPASS card is not justified before the truncation fix lands.
Re-profile after that fix.
