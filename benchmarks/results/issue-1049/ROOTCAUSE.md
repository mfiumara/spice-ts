# #1049 slice 2: teraohm option narrowing in ngspice-47

Refs #1049. Evidence only. No core, tolerance, corpus pin or scoring change. The original loss remains published. The root cause of the large XQ37 and XU68 OP differences is the native **effective shunt resistance**, not a MOS model default or demonstrated multistability.

## Minimal original reproducer

[shunt-control.cir](shunt-control.cir) contains one 5 V source and `.options rshunt=1T`. It has no nonlinear device, subcircuit, vendor model or floating node. On the measured Homebrew ngspice-47 darwin arm64 binary (SPARSE 1.3), source current is -2.328306437622898e-9 A. That is exactly -5/2147483647, not the intended -5/1e12 A returned by spice-ts.

The [weak-diode.cir](weak-diode.cir) companion is a self-authored generic weak-node example. Both fixtures are MIT-licensed original project work. They are not copies of the vendor model. Every trial sends identical netlist bytes to both engines. The [rootcause.json](rootcause.json) receipt stores all node voltages and source currents, hashes, engine revision/version, and source-free diagnostics for 20 trials, including disagreements.

| RSHUNT text | spice-ts source current, A | ngspice source current, A |
|---|---:|---:|
| 1G | -5e-9 | -5e-9 |
| 2147483647 | -2.3283064376228985e-9 | -2.328306437622898e-9 |
| 2147483648 | -2.3283064365386963e-9 | -2.328306437622898e-9 |
| 3G | -1.6666666666666667e-9 | -2.328306437622898e-9 |
| 1T | -5e-12 | -2.328306437622898e-9 |
| 1000000000000.5 | -4.9999999999974996e-12 | -4.9999999999975e-12 |

An explicit `Rshunt high 0 1T`, rather than the option, also gives -5e-12 A in both engines. Thus the discrepancy is option handling, not general suffix interpretation, LU accuracy, diode convergence acceptance or device equations. Above-range integral option values narrow to signed INT_MAX on this binary; a fractional value avoids that path. This is a measured platform/binary result, not a claim about every ngspice build.

## Source trace

Inspected the official [ngspice-47 source archive](https://downloads.sourceforge.net/project/ngspice/ng-spice-rework/47/ngspice-47.tar.gz), SHA256 `894e649651f1838a14095e5a5439e7d3aa63e87ede14d283173fda4fcdef675f`. No source bytes are redistributed here.

- `src/frontend/inp.c:1390-1392` parses option variables through `cp_setparse`.
- `src/frontend/parser/numparse.c:165-166` classifies integer values with `(double) (int) val == val`. Out-of-range double-to-int conversion is not a safe range check in C.
- `src/frontend/variable.c:530-536` stores the integer-classified result via `var_alloc_num(name, (int) dbl_val, vars)`.
- `src/spicelib/analysis/cktsopt.c:244-247` sets the actual shunt conductance to `1.0 / val->rValue`; `cktload.c:109-114` adds it at every voltage node.

The option-path source and integral/fractional boundary experiments support integer narrowing as the mechanism. No instrumented native rebuild was performed, so the particular compiler transformation is not claimed. The decisive proof of the effective circuit is the linear current measurement and matched-shunt replay below.

## XQ37 and full #737 causal replay

The source-free XQ37 reduction retains the original included model and fixes only the gate to the prior native OP. Includes remain fetch-only. Model defaults, instance parameters and gate boundary are unchanged.

| Diagnostic deck | spice-ts source, V | ngspice source, V |
|---|---:|---:|
| XQ37, original rshunt=1T | -0.0015970519985703212 | -0.1043817416791904 |
| XQ37, rshunt=2147483647 | -0.10438182884357082 | -0.1043817416791904 |
| XQ37, rshunt=1000000000000.5 | -0.0015970519985703212 | -0.001597041908798028 |

Changing both engines to the measured native resistance makes spice-ts reproduce the native branch. Using a fractional teraohm option makes ngspice return near the original spice-ts branch. These are separately hashed diagnostic decks, not revised benchmark entries or tuned fixes.

Full circuit results, relative differences against the native value with no floor:

| Trial | spice-ts i(V159), A | native i(V159), A | Relative difference |
|---|---:|---:|---:|
| Original 1T | -0.0013554713473383079 | -0.001237320859729758 | 9.5488964467% |
| Matched 2147483647 ohm | -0.0012373208597323236 | -0.001237320859729758 | 2.0735575585e-10% |
| Fractional teraohm | -0.0013554713472767321 | -0.001355471347888616 | 4.5141773632e-8% |

| Trial | spice-ts v(Q37-S), V | native v(Q37-S), V | Relative difference |
|---|---:|---:|---:|
| Original 1T | -0.0016983367337954761 | -0.1043817443873431 | 98.3729561680% |
| Matched 2147483647 ohm | -0.10438179375850437 | -0.1043817443873431 | 0.0000472987% |
| Fractional teraohm | -0.0016983367410971708 | -0.00169811455539761 | 0.0130842586% |

Before/after the evidence-only commit, the **original** headline losses are unchanged at 9.5488964467% and 98.3729561680%. The remaining fractional-teraohm voltage difference is explicitly retained. No claim of bitwise parity or transient resolution is made.

## Correction to slice 1's XU68 KCL interpretation

Slice 1 assumed the native shunt was 1e12 ohm and attributed the approximately 0.976 nA disable-node residual to numerical OP acceptance. That assumption was false for this native binary. Using the measured 2147483647 ohm shunt in `(V(DisA)-V(10))/5625 + V(DisA)/Rshunt` changes the reduced native residual from -9.7570143156543e-10 A to -9.073385498124788e-20 A. The full native disable-node residual also falls below 1e-18 A (checked independently in rootcause.test.ts).

The prior receipt remains unmodified as historical evidence. Its KCL interpretation is superseded. The clamp point does not violate KCL when checked against the circuit ngspice actually solved. This is not evidence of a superior spice-ts nonlinear solver.

## Recommendation and limits

Do not introduce an INT_MAX cap or per-circuit convergence change into spice-ts to imitate the native overflow. Keep the existing loss in the public score and the original pin. Route an upstream ngspice report with the one-source reproducer and binary/platform details. Any future benchmark oracle correction or compatibility policy is separate reviewed work. Keep #1049 open because the original-byte benchmark loss remains and the transient disagreement is not resolved.

Exploratory runs found that disabling bypass and tightening reltol alone did not remove the large native source offset. Two extreme-tolerance probe attempts hit outer 180 s and 300 s timeouts; they produced no completed comparison and are not evidence for a tolerance-based fix. An explicit gmin sweep also exposed differing option semantics in spice-ts; it is not the cause of this original default-gmin mismatch and is outside this slice. No core fix was attempted.

## Reproduction and verification

Run from the worktree root. Set TMPDIR to a managed scratch directory if the shell overrides Hermes's configured path.

1. `pnpm install --frozen-lockfile` (exit 0).
2. `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 737` and `pnpm exec tsx benchmarks/corpus/ngspice-bugs/prepare-737.ts` (exit 0 each). Archive/deck pins verified; vendor bytes stay ignored.
3. `pnpm build` (exit 0).
4. `spice-heavy pnpm exec tsx benchmarks/results/issue-1049/rootcause.ts <new-receipt.json>` (exit 0, 20 native successes). Refuses an existing output path, persists per-trial progress, uses private local startup configuration and cleans the temporary tree. HOME and SPICE_USERINIT_DIR are bound to it.
5. `pnpm exec tsx --test benchmarks/results/issue-1049/rootcause.test.ts benchmarks/results/issue-1049/diagnostics.test.ts` (exit 0, 6 tests).
6. `pnpm -C packages/core exec vitest run src/options-rshunt-824.test.ts` (exit 0, 12 tests).
7. `pnpm -C packages/core exec tsc --noEmit --strict --skipLibCheck --module nodenext --moduleResolution nodenext --target es2022 --types node ../../benchmarks/results/issue-1049/rootcause.ts ../../benchmarks/results/issue-1049/rootcause.test.ts` (exit 0).
8. `pnpm lint` (exit 0).
9. `spice-heavy pnpm test` was attempted. The tool transport timed out after 420 s during benchmark tests; no complete local full-suite pass or exit code is claimed. Required green CI on the exact PR head is the full gate.

No aggregate run is required because packages/core and corpus outcomes are unchanged. The rootcause evidence tests are an explicit targeted command, not added to the existing root test list.
