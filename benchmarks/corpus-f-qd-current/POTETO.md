# Diagnosis design receipt

This is a read-only benchmark reconciliation, not a simulator feature. CHARTER.md and the existing `/poteto-mode` design receipt at `benchmarks/wasm-dc-sweep/POTETO.md` were read. The advertised `plugin:pstack:poteto-mode` skill lookup returned "not found" in this worker; no live plugin activation is claimed.

Data shape first: the complete historical 22-ID Q/D bucket from commit 5014ae0bcfd6484a2ad4d5b25ed14672851b3ca2; unchanged BSD-3-Clause fixture bytes; historical reference stored separately from fresh parse/native diagnostics; unavailable waveform metrics explicitly null.

Considered designs: regenerate the shared corpus-f outcomes, or isolate a frozen-base diagnosis receipt. Chosen: isolated diagnosis, because this card owns only benchmarks/corpus-f-qd-current/ and must not change shared outcomes, policy or core. No deck adaptation, per-circuit tuning, fresh-reference implication, or unreleased .temp branch import.

Blocking sequence: freeze origin/main, mechanically export all IDs, verify hashes/licence, run sequential bounded parse/native children, validate complete accounting, publish residuals, then independent exact-head review. No simulator fix is attempted, so there is no simulator RED/GREEN claim.

Parallel checkpoint: no writer fan-out. Heavy runs use spice-heavy. Every child has a 256 MiB V8 heap, 64 KiB per output stream, 12s wall/CPU ceiling, own process group, and scoped kill; the entire diagnosis has a 600s budget. Current run completed all 44 children without failures/timeouts.
