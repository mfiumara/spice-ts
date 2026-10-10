# Bounded Gummel-Poon forward-active parity grid

This benchmark exercises only the level-1 NPN forward-active subset implemented by spice-ts:
`LEVEL=1`, `IS`, `BF`, `BR`, `NF`, `NR`, `VAF`, `IKF`, `ISE`, and `NE`.
Defaults preserve the earlier Ebers-Moll path when `VAF`, `IKF`, and `ISE` are omitted.

Cards that request the bounded path with `VAF`, `IKF`, `ISE`, or `NE` reject every other model
parameter with a stable unsupported error. Three-terminal Q cards are supported; the pre-existing
grounded-substrate form, optionally with `OFF=1`, remains accepted for level-1 compatibility.
That compatibility form intentionally retains its historical default-model behavior; new bounded
cards must use the three-terminal form. Other substrate and instance forms are rejected. This slice does not implement
capacitances, transit time, resistances, temperature scaling, reverse Early/high-current effects,
breakdown, substrate current, area scaling, or a full Gummel-Poon model.

The three checked-in netlists use the bounded parameter subset extracted from the public CA3080
`VERTNPN` model and sweep VBE from 0.55 V through 0.70 V at VCE = 1, 5, and 9 V. Each local
netlist is supplied byte-for-byte to spice-ts and ngspice; no engine-specific tolerance or circuit
rewrite is applied. Run:

    pnpm exec tsx benchmarks/gummel-poon/compare.ts

The JSON receipt reports ngspice version, convergence failures, and max/RMS absolute and relative
errors for base voltage, collector voltage, base terminal current, and collector terminal current.
