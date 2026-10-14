# Issue #1058: MOS6 AC oracle capability gap

## Attribution

The identical-byte l-10 mismatch reproduces, but it is not evidence of a native MOS6 defect. ngspice-47 omits MOS6 from its AC matrix. It has a nonzero OP transconductance and gate capacitance, yet returns exactly zero `v(3)`, `i(vdd1)` and `i(vin)` at all 71 frequencies.

The released ngspice-47 source explains this directly:

- `src/spicelib/devices/mos6/mos6init.c:43` registers `.DEVacLoad = NULL`.
- `src/spicelib/analysis/acan.c:430` clears the complex matrix. Line 433 loads only devices with a non-null `DEVacLoad` callback.

Thus neither MOS6 conductance nor capacitance reaches the ngspice AC matrix. The remaining resistors and sources yield `v(2)=0.1`, `v(3)=0`, and zero source current. This is not an OP mismatch, not an isolated capacitance-sign error, and not merely roundoff amplified by a near-zero metric. The current disagreement is 4.143772456033682 microamps, and output voltage disagreement is 0.10359431140084205 V.

`ngspice-source.json` records the archive and source-file hashes plus exact lines. `source-check.py` verifies these statements against the release archive, not an old GitHub mirror. Its archive SHA256 matches the stable-47 Homebrew formula. No ngspice source code is bundled here.

No production changes, corpus-l edits or tolerance changes are made. Matching this reference by deleting the native MOS6 AC stamp would remove physically meaningful behavior. This PR is evidence-only and uses `Refs #1058`, not a claim that numerical parity is fixed. Whether to classify this as an oracle limitation in future reporting belongs to the supervisor. The current published mismatch remains visible.

## Operating point on the identical fixture

The scored deck is unchanged. A separate observation driver uses `source <original>` then `op` and `print`; it does not inject directives into the fixture. Raw output is `ngspice-op.txt`. Native OP uses the normal parser/compiler and `solveDCOperatingPoint`. Native gm/gds come from `evaluateChannel` at that solution. Cgs/Cgd come from the actual dynamic stamp. Cgb/Cbs/Cbd are zero because this hash-pinned fixture has no bulk/overlap/junction capacitances and is in saturation. Native Id is the drain terminal current through Rload, including drain-body leakage, as ngspice `@m1[id]` reports.

| Quantity | ngspice-47 | spice-ts |
|---|---:|---:|
| V(1), V(2) (V) | 1.44 | 1.44 |
| V(3) (V) | 3.508241790577875 | 3.508241790577875 |
| V(vdd) (V) | 5 | 5 |
| I(vdd1) (A) | -5.967032837688499e-5 | -5.9670328376884986e-5 |
| Id (A) | 5.967032837688499e-5 | 5.967032837688499e-5 |
| gm (S) | 4.1437725596280003e-5 | 4.1437725596280003e-5 |
| gds (S) | 0 | 0 |
| Cgs (F) | 9.208383465839999e-16 | 9.208383465839999e-16 |
| Cgd, Cgb, Cbs, Cbd (F) | 0 | 0 |

## Per-frequency AC evidence

`ac.csv` and `report.json` contain all 71 paired frequencies and real/imaginary values for both engines for `i(vdd1)`, `v(3)`, `v(2)` and `i(vin)`. Representative rows below round frequency labels only. All ngspice `i(vdd1)` and `v(3)` entries are exactly `0+j0`.

| Hz | native I(vdd1) real (A) | imaginary (A) | native V(3) real (V) | imaginary (V) |
|---:|---:|---:|---:|---:|
| 100 | -4.143772456033676e-6 | 2.397503033181569e-13 | -0.10359431140084188 | 5.993757582953922e-9 |
| 1e4 | -4.143772455894975e-6 | 2.397503026079934e-11 | -0.10359431139737435 | 5.993757565199832e-7 |
| 1e6 | -4.143771068887340e-6 | 2.397502223662640e-9 | -0.10359427672218348 | 5.993755559156601e-5 |
| 1e8 | -4.129947268341702e-6 | 2.389504051949555e-7 | -0.10324868170854255 | 0.005973760129873888 |
| 1e9 | -3.104520122007257e-6 | 1.796212621831855e-6 | -0.07761300305018141 | 0.04490531554579637 |

The native response also agrees with the independent small-signal equation
`V3 = -0.1 * gm * 25k / (1 + j*2*pi*f*100k*Cgs)` within 20 nV across the sweep. This is an analytical cross-check using ngspice OP values, not a substitute ngspice AC golden and not a broad correctness/superiority claim.

## Outcome and verification

Before (corpus-l exact head `66d67caff2f10e4d6a36d2e59898cc52d661b98d`) and current rerun both report `mismatch`, worst normalized error `41400`, worst signal `ac i(vdd1)`. The unchanged corpus-f runner and corpus-j reduction are called by `verify.ts`. Both engines succeed, 71 points align and six signals compare. With zero reference current, the uniform 1e-10 A peak floor gives `4.143772456033682e-6 / 1e-10 = 41437.72456033682` before three-significant-digit reporting. The match cutoff is 0.01, equivalent to 1e-12 A at this floor. This loss is not hidden or weakened.

Commands from repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm lint
export TMPDIR="$HOME/.hermes/profiles/spice-ts-engineer/cache/scratch"
spice-heavy pnpm exec tsx benchmarks/results/issue-1058/verify.ts
pnpm exec tsx --test benchmarks/results/issue-1058/evidence.test.ts
pnpm -C packages/core exec vitest run src/devices/mos6.test.ts src/devices/mos6-trap-ringing-461.test.ts
curl -fL https://downloads.sourceforge.net/project/ngspice/ng-spice-rework/47/ngspice-47.tar.gz -o "$TMPDIR/issue-1058-ngspice-47.tar.gz"
python3 benchmarks/results/issue-1058/source-check.py "$TMPDIR/issue-1058-ngspice-47.tar.gz"
```

Measured locally: install/build/lint pass; 10 targeted Vitest tests in two files pass; four new evidence checks pass. The guarded rerun succeeds and preserves the published mismatch. No simulator RED/GREEN fix is asserted because attribution found a missing reference capability, not a native bug. Full monorepo tests are left to required exact-head CI as the card requests targeted tests only. An extra standalone strict `tsc` check of the evidence scripts reaches existing `corpus-f/raw-stream.ts:167` TS2367; there are no diagnostics in the new files. This standalone check is not the repository lint command, which passes. `git diff --check` flags whitespace retained verbatim in the upstream fixture/licence/notice; the authored files pass. Runtime/speed comparisons are out of scope. Environment and ngspice-47 version are in `report.json`.

## Sources and licence

`gain-stage6.cir` retains unchanged Xyce Regression bytes from
`https://github.com/Xyce/Xyce_Regression/blob/7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2/Netlists/ACtests/mos/gain-stage6.cir`.
Its SHA256 is `1a8f881f5687036ab790a47ea24e56a8a1afc6dd42c1966eab92a4a36d657b3d`. The upstream copyright/licence README is retained verbatim in `licenses/xyce-README.md`.
Source/redistribution basis is the corpus-l registry in `benchmarks/SOURCES.md` and `benchmarks/corpus/corpus-l/SOURCES.md` at exact commit `66d67caff2f10e4d6a36d2e59898cc52d661b98d`. The source repository grants GPL-3.0-or-later. The unchanged full licence is retained in `licenses/GPL-3.0.txt`. Corpus-l is not yet present at this worktree base; `verify.ts` retrieves its committed manifest via `git show`, verifies byte identity and reuses existing corpus-f/j helpers without copying/editing corpus-l machinery. New verification scripts and prose follow this repository's licence; the original fixture retains its upstream licence.
