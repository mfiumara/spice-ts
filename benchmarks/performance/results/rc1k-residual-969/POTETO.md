# RC1k residual attribution plan

Base: fresh origin/main d3901ec1 plus unmerged #966 head 405e9dc6f054931bf90f1a21b9272a32228c7370 (fast-forward). Reuse its bounded interleaved 15-round harness, clock certification, hashes and archival format.

Data shape: target-name -> exclusive timing category. Receipt boundaries carry numeric milliseconds or null, calls carry target/category invocation counts. Nested spans subtract child elapsed time, so measured categories partition simulate without double counting. All observations, host loads, failures and instrumentation overhead remain in the report.

Two designs considered: production timing hooks vs benchmark-copy AST spans. Choose AST spans to avoid runtime overhead and public API changes. Default #960 targets remain unchanged; optional residual mode adds driver/newton/history/LTE spans. No production edits until one measured hot path reproducibly reaches 20% of simulate. Self-time buckets describe their actual function, not speculative allocation/GC causes.

Flow traced: solveTransient -> driver constructor/advanceSolution -> attemptStep/load/factor/solve -> LTE/charge truncation -> accept/history -> column recorder. Instrument constructor and driver self-time separately from child spans. Allocation and GC within those spans are not independently attributable and must not be named as measured buckets.

Verification: RED test for configurable AST spans; GREEN nested return/throw balance and unchanged default targets; n=15 same-deck control/instrumented/ngspice, all-vector hash equality; offline recomputation and hash verification. If no bucket qualifies, publish attribution only. If it qualifies, further isolate before a general optimisation and rerun before/after plus RC1k/10k/50k.
