# Issue #179 diode-noise parity receipt

Reference: ngspice-47, KLU build. Date: 2026-10-10.

The three committed CC0-1.0 fixtures are supplied unchanged to spice-ts and ngspice. The runner appends only ngspice batch output-control commands to a temporary copy. Run:

    pnpm exec tsx benchmarks/diode-noise/compare.ts

`results.json` contains every matched-frequency max/RMS absolute and relative error, both integrated totals, all runtime samples, fixture SHA-256 values, failures, and unsupported forms.

Before: spice-ts rejected all 3/3 LIN/DEC/OCT fixtures with the stable error `.noise does not support diode noise for 'D1'`; there were no diode spectral or integrated results.

After: all 22/22 matched frequency points completed with no failures. Maximum output-density absolute/relative error was 1.175138019429566e-9 V/sqrt(Hz) / 9.356436623966881e-4. Maximum input-density absolute/relative error was 8.785736751345917e-9 V/sqrt(Hz) / 4.564031710174417e-4. Maximum integrated-total relative error was 9.356420630676564e-4. Median spice-ts public-API runtimes were 0.626 ms (LIN), 0.530 ms (DEC), and 0.251 ms (OCT); fresh ngspice CLI wall times were 11.574 ms, 11.507 ms, and 11.595 ms respectively. These timing modes are diagnostic and not an engine-speed claim. The residual density error is published rather than hidden; it follows the existing diode model's bounded 300 K thermal-voltage approximation versus ngspice's 27 C model.

The bounded slice supports resistor thermal noise plus diode junction shot noise and the ngspice `KF * abs(Id / M)^AF * M / f` flicker model. Unexpanded diode series-resistance noise, BJT/MOS noise, temperature-card/per-instance temperature noise, stepped noise, differential/current outputs, and current-source input referral remain explicitly unsupported or rejected.
