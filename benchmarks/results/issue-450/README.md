# Issue #450: diode sidewall charge above FCS*VJSW uses the bottom F1 (ngspice-47)

## Change

Two ngspice-47 behaviours, both in `packages/core/src/devices/diode.ts`:

1. Sidewall charge offset (`dioload.c:559`). Above `FCS*VJSW` ngspice
   computes `deplchargeSW = czeroSW*DIOtF1 + czof2SW*(...)`, where `DIOtF1`
   is the *bottom* junction's `VJ*(1-(1-FC)^(1-M))/(1-M)` (`diotemp.c:191`).
   The sidewall charge therefore steps at `FCS*VJSW` by
   `CJSW*(F1_bottom - F1_sidewall)`. spice-ts now uses the same offset. The
   sidewall capacitance (AC, noise, PZ, the charge companion's dQ/dV) is
   unchanged.
2. First-iterate junction predictor (`dioload.c:172-203`, `MODEINITPRED`,
   `devsup.c` `DEVpred`). The first Newton iterate of every timepoint after
   the first linearises the junction at
   `vd = (1+x)*vd(n) - x*vd(n-1)`, `x = h(n+1)/h(n)`, not at the previous
   solution. Limiting is still against `vd(n)`. Without this the `FC=0.3`
   deck, whose charge steps *down* and so has two charge-conserving
   solutions at the crossing, converges to the lower branch while ngspice
   lands on the upper one. Shipping (1) alone made that deck worse
   (316 mV max / 84 mV RMS), which is why #403 did not ship it.

No tolerance, option, fixture or per-circuit setting was changed.

## Identical-netlist comparison vs ngspice-47

Decks and ngspice-47 output are the #403 set in
`benchmarks/results/issue-403/ngspice` (re-run with local ngspice-47 for
this PR: `tran_sw.out` and `tran_sw_fc05.out` reproduce byte-for-byte in the
data rows). Run with `node benchmarks/results/issue-403/compare.mjs`;
`before` = `origin/main` `4ed111e` dist via `SPICE_TS_DIST`, `after` = this
branch. Raw output: `compare-before.json`, `compare-after.json`.

Machine: Apple M5 Pro arm64 macOS, Node v22, ngspice-47 (Homebrew).

`v(out)` absolute error (V) over ngspice's 501 linearised points:

| deck | max before | RMS before | max after | RMS after |
|---|---|---|---|---|
| `tran_sw` (`CJSW=8p PJ=1`, `FC=0.3`, step down) | 1.64e-1 | 6.89e-2 | 8.53e-2 | 5.12e-3 |
| `tran_sw_fc05` (default `FC`, step up) | 1.66e-2 | 6.61e-3 | 8.62e-3 | 5.29e-4 |
| `tran` | 1.70e-4 | 1.33e-5 | 1.70e-4 | 1.36e-5 |
| `tran_vj1` | 1.70e-4 | 1.33e-5 | 1.70e-4 | 1.36e-5 |
| `tran_vj1_reltol6` | 2.59e-4 | 3.55e-5 | 2.59e-4 | 3.55e-5 |
| `tran_tt` (`TT=5n`) | 4.42e-4 | 1.41e-4 | 8.72e-4 | 2.71e-4 |
| `tran_rs` (`RS=50 TT=1n`) | 1.56e-4 | 3.93e-5 | 1.56e-4 | 4.06e-5 |
| `tran_rc` | 1.39e-2 | 1.34e-3 | 1.39e-2 | 1.23e-3 |

The two remaining `tran_sw` spikes (85 mV at 23.7 ns, 76 mV at 18.0 ns) are
single samples on the two charge-step jumps, where the jump falls in a
different 0.1 ns interval; every other point is within 2.5 mV. Before, the
whole 18-25 ns segment sat on the wrong branch (0.52 V instead of 0.64 V at
18.5 ns).

Published losses (predictor, no sidewall charge involved): `tran_tt` max
0.44 mV to 0.87 mV and RMS 0.14 mV to 0.27 mV (both on the reverse-recovery
edge, a timing shift of about 0.4 ps at about 2 V/ns); `tran_rs` RMS 3.93e-5
to 4.06e-5; the #389 level-1 endpoint error rises from 3.49e-7 V to 5.90e-7 V
(with and without `CJO`, which still agree to 1e-13 V), inside the 1e-6 V
test bound.

## Aggregate (benchmarks/aggregate-report.ts, 100 fixtures, before/after)

Both runs on this machine: before = `origin/main` `4ed111e`, after = this
branch. On current main the generator's accounting validation throws for an
unrelated fixture (`spiceTs/ngspice/vbic-common-emitter-ac: invalid or
unexplained status transition`), so for both runs that one check was made
non-fatal locally; nothing from that patch or the regenerated artifacts is
committed. Statuses are unchanged (spice-ts 63/1/36). Only three fixtures
change, all transient:

- `classic/lossy-line-aluminium` (3970 to 3976 points): abs RMS down on 224
  of 261 signals, up on 36; worst abs max unchanged (1.347 V, v(3)).
- `classic/coupled-lossy-lines` (3816 to 3821 points): abs RMS up on 28 of
  47 signals, down on 13; worst abs max 0.889 V v(x3.1) to 0.899 V v(x3.3);
  v(5) rel max 3.21e11 to 3.50e11, which raises the relative envelope
  (near-zero reference).
- `classic/lossy-line-24-inch` (3112 to 3122 points): abs RMS up on all 3
  signals (v(2) 0.1758 to 0.1774 V, v(3) 0.3919 to 0.3934 V); v(3) abs max
  1.122 to 1.131 V; v(3) rel max 196 to 130, v(2) 9.95 to 10.4.

These fixtures carry about 1 V errors from other causes; the changes here
are about 1% of that, in both directions. Their diodes have no `CJO`,
`CJSW` or `TT`, so the change there comes from the predictor alone (a
different Newton start gives a slightly different accepted grid).
