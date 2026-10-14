# #994 remediation: SINE after nonliteral DC/AC

PR: https://github.com/mfiumara/spice-ts/pull/1030

The scalar-only prefix matcher at 4993922a0c3577399e7fb193c36835181916ff51 missed valid brace DC/AC values and allowed Xyce to silently discard SINE. The adapter now tokenizes balanced braces, parentheses and quotes as opaque values. Only the top-level waveform name changes. Unrecognized prefixes, malformed expressions and unsupported SINE syntax return a translation limitation before launching Xyce. No core, solver tolerance, aggregate or historical receipt changes.

## Reproduction and measured results

Original synthetic regression deck (project-authored, repository MIT licence):

    expression source probe
    V1 in 0 DC {2.5} SINE(1 .3 440 0 0)
    R1 in 0 1
    .tran 10u 3m
    .end

macOS arm64, ngspice-47, XyceNF Release 7.10.0. Both engines receive the same source deck; the adapter changes SINE to native SIN and adds its usual output card. Extrema use each engine's native transient samples, not matched-time waveform errors.

| Source/prefix | ngspice min/max v(in), V | Before Xyce min/max, V | After Xyce min/max, V |
| --- | --- | --- | --- |
| V, DC {2.5} | 0.7000034927909502 / 1.299995900823113 | 2.5 / 2.5 | 0.7000348757296038 / 1.2997314033926568 |
| V, AC {1} {45} | 0.7000034927909502 / 1.299995900823113 | not separately measured | 0.7000348757296038 / 1.2997314033926568 |
| V, DC {2.5} AC {1} {45} | 0.7000034927909502 / 1.299995900823113 | not separately measured | 0.7000348757296038 / 1.2997314033926568 |
| I, DC {2.5} | -1.299995900823113 / -0.7000034927909502 | not separately measured | -1.2997314033926568 / -0.7000348757296038 |
| I, AC {1} {45} | -1.299995900823113 / -0.7000034927909502 | not separately measured | -1.2997314033926568 / -0.7000348757296038 |
| I, DC {2.5} AC {1} {45} | -1.299995900823113 / -0.7000034927909502 | not separately measured | -1.2997314033926568 / -0.7000348757296038 |

The live test uses the existing 0.01 V source-extrema allowance, skips when XYCE_BIN is unset, and logs the measured extrema. Unit tests also cover quoted and nested parenthesized expressions, expression function names, and unsupported syntax before execution. This fixes silent excitation loss, not the previously documented Jimi capacitor-IC startup discrepancy; no broader parity claim is made.

## Commands and receipts

Run from the repository root with XYCE_BIN pointing to Xyce 7.10.0:

    pnpm install --frozen-lockfile
    pnpm build
    pnpm lint
    XYCE_BIN=/path/to/Xyce pnpm exec tsx --test benchmarks/reference/xyce.test.ts benchmarks/reference/compare.test.ts benchmarks/reference/investigations/974/receipt.test.ts

Frozen install, build and lint returned exit 0. All 41 targeted tests passed with live Xyce enabled (0 skipped), exit 0. With XYCE_BIN unset the same targeted command returned exit 0 with live checks skipped.

RED commit 608dd721 contains the new tests without the fix. After installing dependencies, `XYCE_BIN=/path/to/Xyce pnpm exec tsx --test benchmarks/reference/xyce.test.ts` returned exit 1: 25 passed, 3 failed, 0 skipped. Failures were expression normalization, structured fail-closed behavior, and the live flat-2.5-V repro. The initial attempt before dependency installation returned 254 and is not counted as RED evidence.

The task requires targeted local tests only. Required full build/accuracy/test CI checks on the final exact head are recorded in the Kanban completion handoff, not inferred from local tests.
