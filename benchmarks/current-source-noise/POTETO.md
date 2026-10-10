# Current-source noise input/referral design receipt

## Trace

`.noise` computes the output transfer for a unit input source before referring each device's output-noise contribution back to that input. `solveNoise()` previously found only `VoltageSource` and stamped its MNA branch equation into `gainRhs`. Independent current sources already expose their positive/negative node pair and use SPICE's positive-to-negative current convention.

## Considered designs

1. Reuse `getACExcitation()`. Rejected because `.noise` normalizes the named source to unity and must not inherit a user-declared AC magnitude or phase.
2. Add a synthetic branch for current sources. Rejected because an ideal independent current source is already represented by a node-pair RHS and needs no matrix variable.
3. Stamp a unit current into the existing node-pair RHS. Chosen because it matches the current-source AC convention and keeps the noise transfer solve independent of the source card's AC magnitude.

## TDD sequence

RED: changed the focused noise test to require current-source input referral. The pre-change run failed with `InvalidCircuitError: .noise input source 'I1' is not an independent voltage source` (1 failed, 48 skipped).

GREEN: accept an independent `CurrentSource`, stamp `-1` at its positive node and `+1` at its negative node, and retain the voltage-source branch path unchanged. The focused test checks ngspice-47 output/input spectra and integrated totals.

## Benchmark checkpoint

`compare.ts` reads the byte-identical Berkeley SPICE3f5 `resnoise.cir` and `bjtnoise.cir` fixtures without modifying them on disk. The runner applies one common parser-only adaptation for both engines: it removes the legacy trailing noise-summary interval and output-only `.print noise` card. Circuit topology, model/source cards, values, and sweep remain unchanged. The generated receipt records original/adapted hashes, point counts, max/RMS absolute and relative errors for both spectra and totals, runtimes, and every loss.

## Scope bounds

Current-valued outputs, dependent-source referral, differential semiconductor noise, stepped noise, and temperature cards remain explicitly unsupported. Parser directives, device models, convergence, aggregate manifests, ROADMAP, WASM, versions, and web files are not changed.
