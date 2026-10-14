---
"@spice-ts/core": patch
---

Map netlist `.options gmin` to junction conductance (`deviceGmin`, ngspice CKTgmin) instead of a node-to-ground diagonal shunt. Propagate the configured baseline through operating-point homotopy, sweeps, transient, small-signal and noise device loads. The programmatic `SimulationOptions.gmin` option retains its diagonal-shunt meaning and zero default; `deviceGmin` defaults to 1e-12 S. Netlist serialization emits junction `deviceGmin` as `.options gmin`, not the diagonal API option.
