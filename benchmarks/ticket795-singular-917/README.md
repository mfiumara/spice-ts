# Ticket 795 floating diode island diagnosis

Refs #917 #812. Diagnosis only. No simulator, solver, device, parser, option,
tolerance, vendor deck or corpus changes. Both original spice-ts failures remain.
This does not reopen ticket 784's accepted TABLE/expanded-node diagnoses.

## Measured result

Baseline is origin/main `56e870f8149337ad08fe2d040da64e8df304386f`.
Host is macOS 27.0.1, Apple M5 Pro, Node v22.23.1, Homebrew ngspice-47.
The installed binary advertises KLU support; these actual runs use SPARSE 1.3.
`receipt.json` records pins, all seven include hashes, attached devices, first
and last Newton factorization loads, OP stacks and native recovery diagnostics.
Native raw files and full logs stay ignored under `.native/`.

| Input | spice-ts before | spice-ts after diagnosis | ngspice-47 default / LTPS |
| --- | --- | --- | --- |
| base_37.local.cir | singular pivot10, Net-_D183-K_ | unchanged | exit0, one finite OP row, source stepping completes |
| variant_37.local.cir | singular pivot10, Net-_D183-K_ | unchanged | exit1, source stepping fails, OPtran timestep too small at m.xq190.m1 |
| self-written floating-diode.cir | singular pivot1, k | unchanged | exit0, one finite OP row, OPtran completes |

Both original decks contain `.OP`, not `.AC`. This experiment executes those
pinned bytes directly, without appending an analysis. The #812 refresh's AC
label is not evidence that the original input contains an AC card.
The base remains an execution loss. The variant is a shared failure, not a win
or parity result. Max/RMS errors are null because spice-ts produces no solution.
No performance improvement or waveform correctness claim is made.

## Evidenced first-error cause

Both expanded circuits have the same isolated static component:

- D183 connects its series-resistance node `D183.rs` to `Net-_D183-A_`.
- D183.RS connects `D183.rs` to `Net-_D183-K_`.
- The only other connections from those external nodes are C267 and C269.
  Capacitors are open in the DC load.

The captured three rows have no nonzero entries outside that component.
All three diagonals are present and positive. There are no nonfinite values in
the first load. No TABLE, behavioral source, MOSFET or subcircuit-controlled
source stamps any of these rows. This is not a missing structural diagonal,
an unknown forward-referenced branch or a TABLE dependency loss.

With order `[A, K, rs]`, the mathematical block is

    [ gd,   0,       -gd      ]
    [ 0,    gs,      -gs      ]
    [ -gd,  -gs,     gd + gs  ]

Here gd is 0.00001584032779287937 S and gs is 485.43689320388347 S in both
first loads. `[1,1,1]` is a mathematical null vector. Binary summation in the
internal diagonal can leave an epsilon-scale residual; that is not a physical
ground reference. The external row sums are exactly zero. Changing LU ordering
may change which tiny residual survives, not create a unique static voltage.
The core solver correctly rejects the exact singular two-node reduction too.

Device gmin is already 1e-12 S and is included across the diode junction, not
from the island to ground. True-gmin stepping cannot remove its common-mode
nullspace. Dynamic diagonal gmin temporarily anchors nodes, but removing that
shunt restores the problem. Both original runs make 173 factor attempts,
33 failed; the first and final loads remain the same floating block. These
counts include fallback work, not 173 iterations of the initial Newton solve.
The original exception is rethrown after recovery fails, explaining why the
reported pivot is the initial one rather than a later fallback exception.

## What the ngspice comparison establishes

Base succeeds during native source stepping, after both gmin strategies fail.
The variant has the same D183 static island but fails source stepping and then
fails transient OP. The added source/capacitor branches change the larger
system and ordering, but do not ground the island at DC. Base still succeeds
with OPtran explicitly disabled. It would be incorrect to attribute its native
success to OPtran, or claim that a diode-OPtran fix proves base parity.

The minimal MIT deck removes all vendor models, subcircuits, TABLEs and diode
series resistance. It retains two nodes joined by an ordinary diode, each
coupled to ground through a capacitor. Its exact DC block is
`gd * [[1,-1],[-1,1]]`. It reproduces the static failure mechanism, not the
vendor's successful native source-stepping path. Ngspice also reports singular
matrix warnings on that reduction, fails both gmin strategies and source
stepping, then succeeds through OPtran. Disabling OPtran with the external
configuration `optran 1 1 1 0 0 0` makes it fail. Neither control edits the deck.

Spice-ts's source stepping is a fixed nonzero source-scale schedule followed
by a final unshunted solve. Ngspice's Gillespie path first resets source scale,
node guesses and device state to zero, can combine zero-source solving with
diagonal gmin, then adapts its source increments. Its final path also assigns
CKTdiagGmin to nominal CKTgmin. These are evidenced strategy differences, not
proof that copying one line will fix the vendor circuit. This investigation
has not isolated which native pivot/roundoff or device-state transition permits
base's source-stepping completion. No unique mathematical base OP is proved.

The current passive OPtran subset in `analysis/dc.ts:143-226` deliberately
rejects nonlinear devices. A general nonlinear extension would need proven
MODEINITTRAN charge initialization and device limiting for the entire accepted
subset. Broadening it based on this zero-state diode example alone would be
speculative, and would still not prove the original vendor behavior. No general
fix is justified by this bounded diagnosis, so none is applied.

## Source and licence evidence

Vendor source is https://sourceforge.net/p/ngspice/bugs/795/, attachment
`project.7z`, SHA256
`4f553ecaa57d330c9db7ad9c581988252858451aad0c59a589b3953693fae924`.
The existing `benchmarks/SOURCES.md` and ngspice-bugs fetch-only policy apply.
No vendor decks/libraries or expanded vendor expressions are redistributed.
Only topology identities, numeric stamps and diagnostic outcomes are published.
All new code and the reduction deck are self-written MIT material.

Ngspice reference source is tag `ngspice-47`, verified by `git ls-remote` and a
shallow checkout, revision `a80f6e3e95d51534905b1f23410a951802666656`, at
https://git.code.sf.net/p/ngspice/ngspice. Its modified BSD licence applies;
no source implementation is copied here.

- `src/spicelib/analysis/cktop.c:38-103` establishes recovery order.
  `:494-548` resets source/state and tries the zero-source/gmin solution;
  `:570-656` adapts source stepping and assigns final gmin state.
  SHA256 `9f06d3ac7b6a8aa28bdb46f1af3157362c6ca4a2ecc701a388c990ac3a07eb5e`.
- `src/spicelib/devices/dio/dioload.c:512-519,809-815` adds junction gmin
  and the floating conductance block, not a ground shunt.
  SHA256 `865bbecef98de2237a1cceccf088fb77e6d868f9f913023827ac910232c35b38`.
- `src/spicelib/analysis/optran.c:65-71,181-185,290-294,415-419` documents
  default transient OP, its disabling control and transient initialization.
  SHA256 `293bd182839ac8f53e5b47186abfcdf9128ed17bd8cb33ba4083e10f71b00742`.
- `src/spicelib/devices/cap/capload.c:49-79` initializes/integrates charge.
  SHA256 `c969db26eef78270ffc78ac2195bfde5724e1a30f82637fa6f7cc482f293675b`.

## Reproduce

From repository root in an isolated worktree:

    pnpm install --frozen-lockfile
    pnpm -C packages/core build
    pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 795
    tar -xf benchmarks/corpus/ngspice-bugs/fetched/795/project.7z -C benchmarks/corpus/ngspice-bugs/fetched/795
    spice-heavy pnpm exec tsx benchmarks/ticket795-singular-917/probe.mts <new-receipt.json>
    pnpm exec tsx --test benchmarks/ticket795-singular-917/diagnosis.test.mts

The probe reconstructs missing `.local.cir` inputs only by CRLF-to-LF and
removing quoted Windows drive prefixes/include quotes, retaining `spice_lib/`
trees. Both historical pins must match before execution:

- base `d9310705e01c9ead00f033a7418e3c9cc5e5badc4699081fa0841f89031373a5`
- variant `fb1a6f8645a33268ab5a614a10b42d358b99f500d6d38b9add4c3cfd11d71562`

Native invocation is `ngspice -b -r <raw> <absolute-deck>`, cwd `.native/`,
with a symlink to the unchanged fetched `spice_lib` tree. Local `.spiceinit`
selects ASCII output, then separately default, LTPS and no-OPtran controls.
Native children are bounded at 120 seconds. The probe verifies deck/include
hashes again after native execution and restores all instrumentation in finally.
It is an isolated diagnosis tool, not a production API or numerical adapter.

Actual receipts:

- install, fetch and extraction exit0; both derived input pins match.
- guarded probe exit0; all nine native outcomes retained, including failures.
- `EXPECT_SUCCESS=1 pnpm exec tsx --test benchmarks/ticket795-singular-917/diagnosis.test.mts`
  exits1 with exactly the expected unresolved OP failure (three other checks pass).
- ordinary characterization command exits0, four tests pass. This is not a
  GREEN simulator fix; it preserves the known loss and verifies the diagnosis.
- `pnpm build` and `pnpm lint` exit0.

Required exact-head GitHub build/accuracy/test (20)/test (22) and local full-suite
receipts are reported on the PR. No issue is closed by this diagnosis.
