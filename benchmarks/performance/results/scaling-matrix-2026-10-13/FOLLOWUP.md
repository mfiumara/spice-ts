## Measured gap

Follow-up to #958. The fixed current-main matrix at 951e1e3d651fd5c3efc2cfecdc9761b39bc05fe9 completed all 18 cold engine/deck children with ngspice-47 KLU on byte-identical M2 decks. The largest observed spice-ts/ngspice wall ratio is RC ladder 1k, 133.709 / 51.680 ms = 2.587x. No timeout occurred. Archive is benchmarks/performance/results/scaling-matrix-2026-10-13/.

The baseline parseAsync call took 12.963 ms and simulate(circuit) took 50.929 ms. The remaining 69.817 ms includes spawn/import, output hashing and receipt I/O, exit, and the controller's 10 ms observation quantization. It is not all simulator startup. ngspice acct analysis is 11.857 ms with 3.201 ms load, 2.835 ms factor, and 2.497 ms solve.

A separate 1 ms V8 profile preserves the baseline's full-output SHA256. Of 82.125 ms sampled self time, parse/compile is 22.070%, device load/stamping 21.968%, GC 21.817%, factor/order 0.964%, timestep/Newton control 6.647%, and other/runtime 26.534%. No standalone solve sample was observed, which does not establish zero solve cost. Inspector post itself contributes 9.250 ms. RC transient iterations match at 238; accepted steps are 119 versus 120 ngspice points including t=0. No timestep/iteration explosion explains this ratio.

## Follow-up scope

Before any optimizer, use supervisor-authorized bounded repeated RC1k cold-process measurements that separate spawn/import, parse, compile, device load, factor, solve, output materialization/hash, and exit. Compare one no-profiler control against profile instrumentation, with #951 continuous-clock certification and per-child host load receipts. Do not silently remove hashing from only one engine or treat a 10 ms-polled single child as a reproducible gain.

If a core hot path dominates reproducibly, land one general TDD-backed optimization with identical full-output hashes and matched-point accuracy. Otherwise keep this as a benchmark/startup-attribution gap. No parser/device semantics, per-deck tuning, release publishing, or superiority claim.
