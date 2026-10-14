## Gap exposed by #1103

After accepting the nonthermal fourth VDMOS node, all corpus-n n-6..n-13 decks run in both ngspice-47 and spice-ts. The unchanged corpus-n engine worker and corpus-j reduceRow yield two matches (n-6, n-7), but six `not-compared` results with zero compared signals and null normalized error (n-8..n-13).

The six decks are VDMOS-DIO-AC.cir, VDMOS-DIO.cir, vdmos-out_ir_mtr.cir, vdmos-out_ir.cir, vdmosp-out-mtr.cir, vdmosp-out.cir. Both engines export analysis points, but the comparison receipt shows separately unmatched ngspice and spice-ts plots. For n-8, both export 51 AC points; comparisons pair neither `ac1` nor `AC Analysis`. Signals such as i(vs) and v(d) exist on both sides, yet the two unmatched records report them missing. This is evidence of a comparison gap, not evidence of a numerical simulator match or mismatch. Root cause has not been established; possible plot identity or saved-device-vector interactions require a separate investigation.

Reproduce on the #1103 PR head:

    pnpm -C packages/core build
    spice-heavy pnpm exec tsx benchmarks/vdmos-1103/run.ts after

Full per-deck comparison records, identical-input hashes and runtime/environment are in benchmarks/vdmos-1103/after.json.gz. No deck edits, tolerance tuning, fine-step adaptation or aggregate refresh.

Acceptance: RED test against the real exported plot shapes; generically repair the comparison/export boundary; rerun all six byte-identical decks against ngspice-47 under spice-heavy; publish metrics and file distinct numerical mismatches if revealed. Keep missing signals visible. M1 Correctness parity. Related #1103, #1045.
