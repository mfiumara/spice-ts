# MOS2 operating-point startup slice (#1001)

This is a partial fix, not a resolution of #1001. The reduced unseeded latch now
selects ngspice-47's asymmetric rails. The original cram transient remains a
loss, and the cram plain-OP control becomes worse. Both are retained in
`receipt.json`. No fixture, tolerance, transient integration, transistor equation
or aggregate report is changed. No speed claim is made.

## First semantic divergence and corrected path

Baseline `43aefef1a1105696cdce74acbfd3144e5cff3b7d` called
`dc.ts:42`'s optional `beginOperatingPoint`, but MOS2 had no junction-init load.
`newton-raphson.ts:96-106` stamped ordinary global node voltages immediately;
`mos2.ts:937` read the all-zero solution as terminal biases.

ngspice-47 source at tag commit
[a80f6e3e95d51534905b1f23410a951802666656](https://github.com/imr/ngspice/tree/a80f6e3e95d51534905b1f23410a951802666656):

- `src/spicelib/devices/mos2/mos2load.c:367-377` uses instance IC biases in
  MODEINITJCT; for the supported default, non-OFF, zero-IC instances it uses
  polarity-domain Vbs=-1, Vgs=type*tVto, Vds=0. These biases cannot be expressed
  as one global solution vector: grounded NMOS bulk/source cannot have Vbs=-1.
- `src/maths/ni/niiter.c:337-343` advances JCT to FIX after the first load, and
  FIX to FLOAT only once convergence passes. `:326-330` forbids immediate
  convergence on the first floating iteration after nodeset release.
- `src/spicelib/analysis/cktload.c:122-145` holds nodeset rows in JCT/FIX only.
  `:146-173` independently holds .ic rows for TRANOP without UIC, not plain OP.
- `mos2load.c:338-361` limits model-local gate/drain/body voltages against the
  previous load. spice-ts previously scaled the entire global Newton solution
  from MOS2's gate/drain limit instead. Startup alone still selected the wrong
  latch solution, V12=1.8426327068691892 V. Adding the model-local DC limits
  produced the rail solution. This is not evidence that startup alone suffices.
- CKTop still tries plain Newton, then gmin homotopies, then source stepping.
  No fallback reordering or per-circuit seed was introduced.

The seam is `StampContext.operatingPointPhase` plus a model opt-in,
`DeviceModel.initializesOperatingPoint`. MOS2 adopts it; other models retain
existing behavior until their own initial loads are implemented. Nodesets also
activate the startup phases. The assembler carries separate nodeset and .ic
holds. Existing .ic priority, TRANOP hold and UIC bypass are preserved. DC phases
are cleared before returning the assembler for subsequent analyses. MOS2's
local gate/drain limits are DC-only; transient stamping and charge history are
unchanged.

Scope ceiling: this slice covers existing supported MOS2 default startup, not a
new MOS instance OFF/IC API, all-model INITJCT parity, first-point DC-sweep mode
parity, bypass parity or LU/roundoff equivalence. Those must not be inferred from
the successful reduced latch.

## Measured results

Before values are the retained #996 baseline runs on the above main commit;
after values are fresh native ngspice-47 and spice-ts executions of the same
control decks. This is the #996 offline diagnostic metric: linear interpolation
onto spice-ts points, no phase alignment, uniform peak floors of 1e-4 V and
1e-10 A. It is not an aggregate outcome refresh. The same 1% threshold is used.

| Control | Before worst normalized | After worst normalized | Outcome |
| --- | ---: | ---: | --- |
| reduced latch OP | 1253170.8542004412 (supply current) | 2.9476145517568227e-7 | matches |
| original cram transient | 3.137159738608177 | 1.1501800384706622 | still mismatched at t=0 |
| cram plain OP | 49999.99878516641 | 3194111.7530000396 | worsened loss |
| cram fine step | 3.150747535067848 | 1.1508561960417991 | still mismatched |
| cram nodeset diagnostic | 3.144052165774383 | 3.119439127883779 | still mismatched |
| original mosrect transient | 0.015832540193349596 | 0.015832540193349596 | unchanged loss |
| original ring transient | 0.32446133275386674 | 0.3244613309478497 | still mismatched |

Reduced latch values before were V12=1.8426336725256554 V,
V13=1.8426336725257213 V, I(VDD)=-0.0001253170959929356 A. After:
V12=4.999999946097098 V, V13=1.3677625588866796e-8 V,
I(VDD)=-1.0572862030322483e-11 A. The retained full-precision native reference
is V12=4.999999946096958 V, V13=1.367762560720779e-8 V,
I(VDD)=-1.0572891506468e-11 A.

The original cram's after worst voltage is v(xi20.7), with a 1.842632681489912 V
initial difference. Its plain OP has I(VVDD)=-0.0005012676476287697 A versus a
native rail-state current near -1.569348631033638e-10 A. Some internal pairs still
sit near the symmetric metastable state. The worsened OP current error is not a
successful branch-selection fix. The tight cram diagnostic still fails in both
engines. All 21 controls, including small regressions and failures, are recorded.

Remaining investigation belongs to a supervisor-routed continuation: trace
original cram's other cross-coupled pairs and exact load/bypass/solver
trajectories against ngspice. Do not force an asymmetric seed, loosen tolerances,
or infer unique equilibrium correctness from a branch disagreement.

## Verification and reproduction

    pnpm build
    pnpm lint
    pnpm -C packages/core exec vitest run src/analysis/latch-op-selection-1001.test.ts src/initial-state.test.ts
    spice-heavy pnpm exec tsx evidence/1001/run.ts
    python3 evidence/1001/check.py
    spice-heavy pnpm test

RED was reproduced before simulator edits: V12 differed by 3.1573662735713026 V;
1 test failed. The final focused command passes 16 tests (two latch tests and
14 existing node-initial-state tests). Default-step mosamp2's unchanged 5 uV
guard and MOS2 convergence, temperature and series-resistance tests passed.
Root build and lint exited 0. The guarded root full test exited 0, with core
3732 passed / 2 skipped and final benchmark tests 144 passed / 4 skipped.

The first broader candidate added phases to unrelated models and failed nine
existing diode/B-source stopping guards. That behavior was removed: phase
initialization is opt-in or nodeset-driven. The final full suite has no failures.
No tolerances or guard assertions were relaxed. Required exact-head GitHub CI
and independent exact-head review remain separate gates before merge.

`run.ts` accepts an optional control name, e.g. `k-5-latch-op`. It writes only
scalar receipts, never raw ngspice logs or waveform corpora, and does not modify
historical #996 evidence. Full run asserts 21 controls; `check.py` verifies hashes,
counts, retained failures/losses and the explicitly worsened cram OP result.
`baseHead` identifies the pre-commit checkout; the working-tree code-patch hash
binds the measured candidate. The PR head is recorded in the Kanban handoff.

## Provenance

No new external netlist is imported. Exact decks come from retained #996 runs,
which derive from corpus-k / Xyce_Regression
`7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2`, GPL-3.0-or-later. Existing source
URLs, licences and hashes are recorded in `benchmarks/SOURCES.md`, corpus-k's
manifest/notices, and `evidence/996/README.md`. The reduced latch test reads
`evidence/996/repro/latch.cir` directly. The opposite-rail nodeset regression was
also executed natively with ngspice-47 and the same deck plus
`.nodeset v(12)=0.2 v(13)=4.8` (V12=1.369410e-8, V13=5, I(VDD)=-1.05729e-11).
