# /poteto-mode receipt

Scope: issue #277 bounded passive R/I/V single-source DC-sweep numeric WASM slice.

Data shape first: one compiled circuit, one linear `.dc` command, one matched independent source, a bounded inclusive axis, fixed-order real matrices/RHS vectors, and protocol-native DC series. The public facade and ABI-v2 native artifact remain unchanged.

Two designs considered:

1. Call the core DC-sweep driver and replace its solver. Rejected because its solver seam is not public, it would not prove every solve used the verified artifact, and core is outside this card.
2. Validate and prepare the linear sweep in the WASM worker, mutate only the matched source for each point, stamp R/I/V in TypeScript, and execute every solve through `solve_f64` in the verified fixed-memory artifact. Chosen because it preserves the no-fallback backend boundary and ABI.

Blocking sequence: verify manifest/integrity and compiled analysis shapes; add failing facade tests; implement grid/source validation and solving; add packed/browser coverage; then measure identical project-owned netlist bytes against native ngspice-47.

Parallel checkpoint: implementation, consumer coverage, and benchmark depend on the same backend contract and are serial. There is no safe writer fan-out in this narrow slice.

Ceilings: one unstepped `.dc`, R/I/V only, one constant/DC independent source, 64 unknowns, 256 components, 4,096 result points, caller limits, and three fixed WASM memory pages. Nested sweeps, nonlinear waveforms/devices, invalid grids, missing/ambiguous sources, and ceiling breaches fail explicitly. No TypeScript simulation fallback exists.

RED receipt: focused tests at commit `cf0936c` failed because `.dc` returned `UNSUPPORTED_FEATURE` with `feature: analysis`; both new DC tests failed before implementation.
