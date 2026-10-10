# Resistor TC1/TC2 temperature-list reference

This project-authored fixture supports issue #318's bounded `.step TEMP LIST -55 25 72` accuracy benchmark. It uses a 1 V source, a temperature-sensitive 1 kohm series resistor, and a temperature-independent 2 kohm load. The shared 27 degrees Celsius default nominal temperature plus `TC1=1e-3` and `TC2=2e-6` make all three operating points distinct.

## Reproduce

Requires ngspice-47 on `PATH`:

    node benchmarks/resistor-temperature/capture-ngspice.mjs

The script records the exact version string, host, commands, per-process wall-clock durations, parsed values, process output, and complete ASCII raw output. It writes:

- `ngspice-47-reference.json`: structured provenance, commands, runtime, and values.
- `ngspice-47-reference.csv`: compact values and runtime table.
- `ngspice-47-output.txt`: exact command/process/raw-output receipt.

## Driver adaptation

The committed canonical netlist contains `.step TEMP LIST -55 25 72`, which spice-ts executes directly. ngspice-47 reports `.step` as an unimplemented dot command. The capture script therefore makes three temporary decks and replaces only that line with `.temp -55`, `.temp 25`, or `.temp 72`. All topology, device values and parameters, `.op` analysis, and tolerances remain unchanged.

The three ngspice invocations are separate processes, so their wall times include process startup and raw-file output. They are reproducibility data, not a speed comparison.
