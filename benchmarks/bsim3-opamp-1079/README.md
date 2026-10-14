# #1079: the nominal BSIM3 op-amp deck actually selects MOS9

Evidence-only disposition. The public loss stays open. No production simulator,
fixture, model card, tolerance, or public corpus score is changed by this PR.

## Model identity, proven against ngspice-47

The byte-identical corpus-m m-3 fixture says `LEVEL=9 VERSION=3.2.2`.
Its upstream directory and comments call it BSIM3, but that is not its meaning
in ngspice. The native stderr explicitly says `unrecognized parameter (version)
- ignored`; the native model/device listing is MOS9, modified level 3.
spice-ts also compiles eight MOS3 instances with `model.level === 9` and zero
BSIM3 instances. `packages/core/src/circuit.ts:2489` handles this dispatch.

The inspected source is ngspice-47, commit
`a80f6e3e95d51534905b1f23410a951802666656`. `source.json` records SHA-256
for each relevant source file. These files were unmodified in the source tree.

- [inpdomod.c:271-296](https://sourceforge.net/p/ngspice/ngspice/ci/a80f6e3e95d51534905b1f23410a951802666656/tree/src/spicelib/parser/inpdomod.c):
  only LEVEL=8/49 enters the BSIM3 version dispatch; LEVEL=9 selects `Mos9`.
- [b3v32set.c:77-92](https://sourceforge.net/p/ngspice/ngspice/ci/a80f6e3e95d51534905b1f23410a951802666656/tree/src/spicelib/devices/bsim3v32/b3v32set.c):
  VERSION=3.2.2 selects the 3.2.2 revision only after BSIM3v32 was selected.
- [mos9load.c:702-721](https://sourceforge.net/p/ngspice/ngspice/ci/a80f6e3e95d51534905b1f23410a951802666656/tree/src/spicelib/devices/mos9/mos9load.c):
  the near-saturation output-conductance expression used by this deck.

The BSIM3v32 load source was also checked and hashed, but is not executed by
this fixture. Changing BSIM3 code cannot fix this loss. Changing LEVEL to 49
would change the benchmark circuit, not fix its simulation.

## DC first, then the small-signal control

`probe.ts` obtains the ordinary spice-ts DC solution, then compares the native
DC voltages, device gm/gds/gmb, native gate/junction capacitances, and spice-ts
physical-node capacitance stamps. Raw native output and the complete numeric
receipt are retained in `native-op.txt.gz` and `ts-op.json`.
The probe adds a diagnostic `.control` block in its private directory only.
The public corpus command still uses the original unmodified bytes.

The largest DC-node difference is only 3.607866854e-7 V. However, M4 sits just
below saturation with zero default VTO/GAMMA/ETA/VMAX/NSUB. In this case the
native formula reduces to `gds = KP * W/L * (Vgs - Vds)`; it becomes zero at
and above saturation. Its output conductance is comparable to the junction
GMIN conductance, so these tiny voltage changes strongly affect the AC gain.

| Quantity | spice-ts DC bias | ngspice DC bias |
|---|---:|---:|
| v(bias1), V | 4.296028128126104 | 4.296028128126105 |
| v(bias2), V | 4.2960281380465455 | 4.296028175107854 |
| M4 gm, S | 2.917099284312956e-5 | 2.917099130739321e-5 |
| M4 gds, S | 4.110805267569832e-13 | 1.946816829631579e-12 |
| M4 gmb, S | 0 | 0 |

At the same native bias, the unchanged spice-ts M4 evaluator returns
`gm=2.9170991307393215e-5 S`, `gds=1.946816829631579e-12 S`, and `gmb=0`.
The fixed-bias gate capacitance stamps also agree with ngspice:
`Cgs=4.60419173291998e-16 F`, `Cgd=6.145500072958732e-23 F`,
`Cgb=Cbd=Cbs=0`. `minimal.cir` is a self-written MIT one-transistor reduction
of that bias. It retains LEVEL=9 and does not borrow the GPL op-amp topology.
The native `id` includes junction contributions, unlike `evaluateChannel`'s
channel-only `cdrain`; they are not presented as the same quantity.

All 61 AC frequencies, 100 Hz to 100 MHz, were checked. Error below is the
maximum complex absolute difference divided by the native peak magnitude.

| Run | v(out) normalized error |
|---|---:|
| Normal spice-ts DC bias and unchanged AC solve | 0.6369491175377238 |
| Diagnostic: only v(bias2) replaced by native DC voltage | 2.489715873080301e-7 |
| Diagnostic: all DC node voltages replaced by native voltages | 3.298606910883643e-8 |

These replacement-bias runs are localization controls, not corrected outcomes
or suggested production behavior. They show the loss originates in the
OP-sensitive MOS9 linearization, not BSIM3 capacitances or AC matrix handling.
They do not establish which Newton stopping, bypass, or initialization detail
causes the sub-microvolt DC discrepancy. That deeper diagnosis and any generic
fix require a separately scoped MOS9/operating-point card. The current card
explicitly forbids MOS3 and DC recovery edits; no ngspice bug is claimed.

## Honest public before/after

Both runs used `spice-heavy pnpm exec tsx benchmarks/corpus/corpus-m/parity.ts`,
exit 0, original bytes, unchanged uniform 1% matching policy. Full generated
outcomes are retained as `corpus-before.json.gz` and `corpus-after.json.gz`;
`corpus-summary.json` lists every outcome, including the losses.

| Outcome | Before | After |
|---|---:|---:|
| ngspice successes | 24 | 24 |
| spice-ts successes | 21 | 21 |
| matches | 15 | 15 |
| numeric mismatches | 6 | 6 |
| spice-ts engine losses | 3 | 3 |
| m-3 ac v(out) error | 0.637 | 0.637 |

Numeric gaps remain m-3 and m-18 through m-22. Engine losses remain m-4,
m-23 and m-24. Canonical corpus-m files are left unchanged, avoiding a
wall-time-only update. No performance improvement or superiority is claimed.

## Reproduce and verify

From the repository root, with ngspice-47 installed:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm exec tsx benchmarks/bsim3-opamp-1079/probe.ts
pnpm -C packages/core exec vitest run src/devices/mos9-opamp-1079.test.ts src/devices/bsim3v32-ngspice-parity.test.ts
spice-heavy pnpm exec tsx benchmarks/corpus/corpus-m/parity.ts
pnpm exec tsx --test benchmarks/corpus/corpus-m/corpus-m.test.ts
spice-heavy pnpm test
```

Install/build/lint/probe/targeted/corpus/offline commands exited 0.
The targeted run passed 109 tests in two files, including five new diagnosis
checks and 104 existing BSIM3v32 parity checks. The five new checks exercise
model dispatch, the authentic BSIM3 negative control, fixed-bias gm/gds/gmb,
capacitance stamps, and the retained-loss/same-bias receipt. These are evidence
checks, not a RED-to-GREEN production fix. The uniform public parity predicate
remains RED for m-3 before and after.

The guarded local full-suite attempt hit the terminal tool's 420-second timeout
during the root benchmark tests. Core completed with 4301 tests passed,
1 expected failure and 5 skipped; the workspace package suites also completed.
The overall full-suite exit was not obtained and is not reported as green.
Required exact-head GitHub CI is the authoritative full gate. Logs are retained
in this directory, including the interrupted full-test receipt.

Sources and licences are recorded in `benchmarks/SOURCES.md`. This report does
not close #1079 and is intentionally not a `Fixes #1079` PR.
