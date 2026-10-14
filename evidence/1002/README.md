# MOS2 last-load transient history localization (#1002)

Evidence only. The candidate retains MOS2's last Newton-load charge, voltage and
capacitance when a step is accepted. It does not reload them at the final linear solution. No
Newton tolerances, integration settings, maximum steps, benchmark decks or
comparison thresholds changed. DC/OP code and shared Newton code are untouched.
The candidate is NOT shipped: it regresses the unchanged mosamp2 default-step
regression. Production code remains at the baseline, so #1002 stays open.
The card's evidence-only fallback is used rather than weakening that test.

## Measured original-input results

Against the recorded ngspice-47 reference from #996, using the identical original
corpus-k input bytes and its unchanged reference-peak 1% rule:

| Circuit | Before worst normalized error | Candidate after | Experimental verdict |
|---|---:|---:|---|
| k-10 mosrect | 0.015832540193349596, I(VDD) | 0.00016719011364082088, I(L2) | loss to match |
| k-15 ring | 0.32446133275386674, v(6) | 0.32446014813595225, v(6) | remains a loss, #1003 |

I(VDD)'s mosrect error falls to 0.00010438477431064205 normalized. I(L1)'s
maximum absolute error falls from 1.5453985768 mA to 4.1870474865 nA.
`before.json` and `after.json` retain all common signals, including losses.
The latter describes the rejected candidate, not current production behavior.
No phase shift or fixture-specific tuning was used. This is a correctness
measurement, not a speed benchmark. The ring startup problem remains separate.

## First divergent operation, rather than first threshold violation

The earlier 482.28 ns event was the first 1% waveform violation, not the first
state difference. The initial OP already differs at floating/Newton tolerance
scale, so an absolute first cross-engine floating-point difference is not
claimed here.

`before-trace.json.gz` isolates the extra history mutation at the first accepted
10 ps point. md1's last-load qbs is -1.0813814995493277e-14 C, but acceptance
replaces it with -1.0813815002809488e-14 C and introduces a -7.316211579381751e-13 A
capacitor current. The pre-fix `mos2.ts:1158-1166` evaluates q/C again at the
solved voltages and `charge-state.ts:113-121` integrates that different q. The
candidate `mos2.ts:1165-1177` commits the loaded state instead. Initial DC/UIC
initialization still evaluates the initial solution; reset clears the cache.

This matches ngspice's actual state lifecycle:

- `mos2load.c:1188-1191,1200-1211,1263-1269,1304-1308` writes the loaded device
  voltages, capacitances, q and cq into CKTstate0.
- `niiter.c:254,287-290,332-335` solves and returns after convergence testing,
  without a final device reload at the solved voltages.
- `dctran.c:661-665` rotates that loaded state into the previous-step history.
  MOS2 has no accept callback that recomputes charges.

The native build below contains only fprintf instrumentation. Its 1008-point
raw waveform is numerically identical, on every common signal, to the existing
#996 ngspice reference. This checks that the instrumented build represents the
reference, rather than assuming its configure flags are equivalent.

Both engines already take the same accepted sequence, to at most 2.12e-22 s
rounding difference. There are no rejected steps in the native run.
The pre-fix spice-ts run records one NR retry overall; the fixed run records
none. No LTE retries occur. Near
480.28, 481.28, 482.28 and 483.28 ns both use 1 ns trapezoidal/order-2 steps and
three Newton iterations. Thus this error is not caused by different accepted
timesteps or iteration counts in that window. Native CKTtrunc returns its
2 ns growth-capped bound at 482.28 ns; spice-ts's raw charge bound is
47.25426971576924 ns, also capped to 2 ns by the driver. LTE does not cut the step.

At 482.28 ns, native md1's final loaded qbs is -1.6986107640877496e-14 C.
Pre-fix accepted qbs is -1.695208614064561e-14 C; after is
-1.6986276299729856e-14 C. The trace records every native load in that window,
not just the last one. Native bypass/predictor semantics and OP differences
can still account for residual differences; no complete bitwise model parity
is claimed. `localization.json` contains the first history mutation and the
window comparison. Fixed accepted q equals its last-load q in every captured
acceptance under the candidate. Rejected trials and truncation checks never commit the cache.

## Why no production fix is published

The guarded full suite on the candidate passes 3735 core tests, skips two and
fails one existing assertion in `classic-mos-convergence.test.ts:54`. On the
unchanged mosamp2 deck, baseline final v(5) is 9.46397222886114 V; candidate is
9.463964915509695 V. Against the existing 9.46397521 V ngspice reference, errors
are 2.9811388593 uV and 10.2944903038 uV respectively, versus the unchanged
5 uV bound. Both finish successfully. `mosamp-before.json` and
`mosamp-candidate.json` retain exact values, fixture hashes and convergence counts.
Being closer to a refined-step/OP value is not a reason to waive identical-input
default-step parity. No fixture or tolerance is edited to make the candidate pass.

A diagnostic retaining only bulk-junction last-load history keeps the mosamp2
test green but leaves mosrect failing at 0.01583222624022387 normalized.
`bulk-only.json` records all original-input signal scores. This separates the
Meyer gate-history defect from the earliest small junction-charge mutation:
bulk-junction acceptance alone does not explain or fix the observed waveform loss.
The last-loaded gate history is the causal candidate, but a safe correction
needs additional predictor/bypass/history interaction work that preserves the
mosamp2 guard. `rejected-candidate.patch` includes the complete candidate and
six focused regression tests, and can be applied to baseline `43aefef1`.
It is deliberately not applied in this PR. No superiority or completed fix is claimed.

## Checks and reproduction

The original-input regression was committed RED as `195c115c` before the fix;
it reports exactly 0.015832540193349596. It is removed from production tests in
this evidence-only PR and retained in the candidate patch. Device-level tests separately exercise
Euler, trapezoidal, actual Gear-2 history, retry/truncation isolation and reset.
The focused run passes 82 tests across seven files:

    pnpm -C packages/core exec vitest run src/analysis/transient-mosrect-1002.test.ts src/devices/mos2-charge-history-1002.test.ts src/devices/mos2.test.ts src/devices/mos2-series-resistance-982.test.ts src/devices/mos2-temperature-995.test.ts src/analysis/transient-charge-lte.test.ts src/analysis/transient-order-control-742.test.ts

Generate current-source waveforms and internal-state observations:

    pnpm exec tsx evidence/1002/run.ts before
    git apply evidence/1002/rejected-candidate.patch
    pnpm exec tsx evidence/1002/run.ts after
    pnpm exec tsx evidence/1002/mosamp.ts candidate

Use a clean throwaway checkout for applying the rejected patch. Expect the
mosamp2 regression above to FAIL; the six new candidate tests pass. For the
baseline, run with `before` before applying the patch. The observation
wrappers only read state. They do not change options, solutions or charge laws.
Trace receipts retain all timestep/order/LTE/iteration observations, plus stored
charges/currents/capacitances in the first 100 ps and 480-484 ns windows.

Native instrumentation, starting with the official ngspice-47 source archive:

    mkdir -p evidence/1002/.run
    tar -xzf ngspice-47.tar.gz -C evidence/1002/.run
    python3 evidence/1002/instrument-native.py evidence/1002/.run/ngspice-47
    cd evidence/1002/.run/ngspice-47
    ./configure --enable-xspice --enable-cider --disable-debug --without-x --with-readline=no CPPFLAGS=-I/opt/homebrew/opt/libomp/include LDFLAGS=-L/opt/homebrew/opt/libomp/lib
    spice-heavy make -j2 LDFLAGS='-L/opt/homebrew/opt/libomp/lib -lomp'
    cd ../../../..
    SPICE_ASCIIRAWFILE=1 evidence/1002/.run/ngspice-47/src/ngspice -n -b -r evidence/1002/.run/native.raw evidence/996/repro/mosrect.cir > evidence/1002/.run/native.stdout.txt 2> evidence/1002/.run/native.stderr.txt
    python3 evidence/1002/summarize.py
    python3 evidence/1002/check.py

Build and lint passed locally. The candidate's full suite failed as recorded
above; it was reverted before final publication. Baseline full-suite and exact-head CI receipts are in the
Kanban/PR handoff. The required checks and independent review remain the merge
gates. No merge or release was performed.

## Provenance

Original mosrect/ring decks and golden waveforms are reused from #996, with
corpus-k revision `e05f5f1748bb7aaada478e9c3378ec4dfb45e17c`. Fixture sources,
SHA-256 values, GPL-3.0-or-later grant and retained licences remain in
`benchmarks/SOURCES.md` and the corpus-k manifest/licence directory. No new
external fixture is introduced. New device-level synthetic tests are original
MIT project work.

Native source URL is
https://downloads.sourceforge.net/project/ngspice/ng-spice-rework/47/ngspice-47.tar.gz,
SHA-256 `894e649651f1838a14095e5a5439e7d3aa63e87ede14d283173fda4fcdef675f`.
ngspice's component licences are in its COPYING, also retained by corpus-k's
`licenses/ngspice/COPYING`. No downloaded C source or binary is committed.
The archive was obtained from the local Homebrew cache and hash-verified.
Environment is Darwin arm64, Node v22.23.1, pnpm 10.28.1, ngspice-47.
