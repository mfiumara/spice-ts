# EKV static slice (#4)

Caller seam: Circuit compiles NMOS/PMOS LEVEL=260 to EKV26, which implements DeviceModel directly. No MOS1 inheritance or fallback. Alternative considered: share MOS1 stamping via subclass; rejected because its body junctions, temperature, batch cache and charges impose unrelated semantics.

Data shapes: EKV26 holds validated numeric model/instance parameters and modelWarnings. evaluate([D,G,S,B]) returns physical drain current and four terminal derivatives. Local three-variable forward-mode dual numbers propagate analytic chain-rule derivatives through the published static equations; bulk derivative follows voltage translation invariance. No finite differences in production.

Equation source: EPFL EKV 2.6 report (revision III corrections in Xyce documented separately). Invert equations 41-42 with Newton on log(y), not the GPL implementation's piecewise approximation. Xyce source is consulted for parameter defaults, smoothing and device registration only. Repository licence is MIT. No GPL source will be committed.

Sequence: capture MOS1 baseline; RED dispatch/current test; implement intrinsic DC equations including RSCE, charge sharing, velocity saturation/CLM and both mobility options; test analytic derivatives, continuity and polarity; run the identical published model/circuit statements against Xyce and retain ngspice fallback divergence. Static-only inverter transient retains an explicit missing-charge warning and residual error. Unknown parameters fail by name; known deferred parameters produce named warnings. Follow-up issues cover charges/AC/noise/temperature and residual reference gaps.

Heavy commands use spice-heavy. Exact-head CI and independent review gate publication; no merge or release work.
