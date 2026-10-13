# RC1k cold-process attribution, #960

Measurement only on base d3901ec1355519e582dc068b4dec5cc033e22de8.
Node v22.23.1, Homebrew ngspice-47 KLU, macOS 27.0.1 arm64.
Archive date is local CEST; samples were collected on 2026-10-13 UTC.
No core source, parser/device semantics, matrix archive, or aggregate output changed.
The deck is the original MIT M2 generator already recorded in SOURCES.md.

## Result

The loss remains. Unprofiled spice-ts cold wall median is **159.048 ms**
(IQR 15.168), against **45.598 ms** (IQR 9.801) for native ngspice process
wall plus full-output materialization/hash. The ratio of medians is **3.488x**.
This is not a before/after optimization and is not directly equivalent to #958's
133.709 / 51.680 ms single observations. Those included controller polling;
this study removes that quantization, hashes both engines, and asks ngspice to
emit every vector instead of only its rounded `.print` probe.

The gap is mixed, not an isolated LU bottleneck. Control medians are 30.334 ms
to first user code, 26.495 ms for imports, 14.635 ms for parse, 73.921 ms for
simulate, 6.137 ms for hashing, and 4.751 ms for exit. Medians of separate
boundaries do not add to the median of wall time.

Instrumented simulation has 23.208 ms load/stamp, 7.631 ms compile,
4.214 ms factor, 2.237 ms solve, 3.433 ms internal result recording, and
29.011 ms unassigned simulation residual. The residual is larger than
load/stamp in **15/15** instrumented children. Load/stamp exceeds factor plus
solve in **15/15**, but it is not the dominant isolated boundary. The residual
includes timestep/history/control, matrix preparation, validation, allocation/GC
and timer-bookkeeping not assigned to the named spans. It must not be renamed
"GC", "device load", or "startup" without further measurements.

Conclusion: this is a **cold-start plus benchmark/core attribution gap**, not
proof that one general core optimization dominates. Startup/import and parse
are substantial, and simulation itself is slower than ngspice acct analysis
(17.213 ms median), so startup alone does not explain it either. No core change
is justified by this slice. Recommend a separate, bounded finer attribution of
the simulation residual before selecting an optimizer. Do not infer a sparse-LU
or per-circuit tuning fix from these measurements.

## Instrumentation overhead and uncertainty

Instrumented-minus-control wall medians = **-0.109 ms**. Paired per-round
median = **+0.885 ms**; paired min/max = **-24.126 / +35.226 ms**. The negative
difference of medians is host/JIT variation, not evidence that instrumentation
speeds up simulation or costs nothing. Every sample is retained. The host is
shared. Before/after loadavg(1) ranges from 6.708 to 8.077; process count from
1235 to 1238. Receipts also retain 5/15-minute loads and native-child envelopes.

Each instrumented child uses hrtime body spans, not an inspector/V8 sampling
profiler. The AST transformation wraps only Circuit.compile, bulk static/dynamic
stamping and companion-system building, GilbertPeierlsSolver.factorize/solve,
and ColumnRecorder.record/flush plus TransientResult construction. Nested spans
are exclusive, so shared stamping/recording is not double-counted. Preparation
asserts exactly one match per target. The unprofiled built JS copy is unchanged.
Prepared bundle hashes and gzip copies are preserved for independent inspection.
Timer entry/exit bookkeeping can perturb JIT behavior; only the measured
mode-level comparison quantifies its net overhead.

## Boundaries and engine comparison

See table.md for median/IQR and summary.json for n, q1/q3, min/max of **all**
observations. ngspice's parse column is its **acct netlist-loading** clock, not
an equivalent parseAsync boundary. Native load/factor/solve/reorder/analysis
columns are its internal acct clocks, not hrtime wall spans. Native import,
first-user-code, compile, and raw-output-emission splits are **unavailable**;
no invented zero is reported. The ngspice spawn/import/exit table entries refer
to its Node hashing wrapper, not native ngspice internals.

The ngspice wrapper wall (145.817 ms median) contains Node startup, imports,
process-count diagnostics, raw parsing/hash, and native wall. It is not the
engine speed comparison. `engineAndHash` for ngspice is, per sample,
`nativeWall + outputHash`; it excludes wrapper startup/exit and diagnostics but
includes native process startup/exit, all-node raw emission and raw file
read/materialization/hash. For spice-ts it is its cold process wall, including
startup/import and full result materialization/hash. No one-sided hash removal.
`outputMaterializationAndHash` for instrumented spice-ts combines internal
recording spans and external canonical serialization/hash; ngspice native raw
emission remains unsplit inside nativeWall. Do not add nested table columns.

Native raw files retain all 1002 vectors and 120240 doubles per child. Both
engines use name + NUL + little-endian Float64 bytes, SHA256, through the same
hashVectors function. All **30** spice-ts children match #958's full-output hash
`6a650522805562c8018777ab78a344668d2fb12038fd6e4fcfd7cc3302c4e8a7`.
All **15** ngspice hashes are
`437fcf743eca12eaf2486bf14b29940aa79b59bc3f490e420bb1aa186e9d0055`.
They need not equal spice-ts bit-for-bit. On the retained n10 probe, maximum
time-grid difference is 6.617e-24 s; max absolute voltage difference is
7.772e-16 V and RMS is 3.680e-16 V. This is probe evidence, not an all-node
accuracy claim. Both report 238 transient iterations and 120 saved points
(spice-ts 119 accepted advances plus t=0). No iteration explosion explains the loss.

## Budget, certification, and the retained controller mistake

15 rotating/interleaved rounds. 15 control Node processes, 15 instrumented Node
processes, 15 Node ngspice/hash wrappers, and 15 native ngspice grandchildren.
Exactly **60 workload processes**, **45** top-level receipts in receipts.jsonl
and **15** native receipts in *.native.json. Diagnostic `ps`, metadata commands,
preparation, and offline report/test processes are administrative and are not
engine workload children. Every engine process has a 60-second parent deadline;
native ngspice shares its wrapper's deadline/process group. No timeout occurred.

The controller imports #951 ContinuousClock/clock_error/node_error unchanged.
On macOS this is mach_continuous_time; Linux uses CLOCK_BOOTTIME for certification.
Timing endpoints are blocking pipe-close/reap reads, not a 10 ms polling loop.
Node hrtime marks timestamp first user code and the final receipt handoff. No
controller polling is used for the reported wall or native wall numbers.

**01-control remains flagged invalid in the original receipt.** The first
controller version assumed Python monotonic and Node hrtime shared an epoch.
On this macOS/Node22 host, Node hrtime uses the continuous epoch while Python
monotonic uses a suspend-excluding epoch. This produced an impossible negative
exit and a huge startup split, despite valid underlying durations and a matching
full-output hash. We stopped after that child, corrected the controller, and
resumed without replacing the child or exceeding the budget. Both runs' host
metadata and raw worker stdout are retained. The original boundary/error record
was not rewritten.

The offline report explicitly rederives only that first row's startup/exit from
its saved continuous-clock endpoints. It keeps the original invalid status and
reports **44 originally certified top-level receipts plus one recovered,
flagged observation**, not 45 certified receipts. The corrected first row is
included in all n=15 distributions. Nothing is silently excluded. The resumed
runner exits 1 because the old invalid row remains; this is expected and is not
a failed simulator. Offline tests reject actual clock divergence as unrepairable.

## Reproduce

From a built checkout, choose a fresh output directory inside your workspace.
Do not rerun workload measurements into this frozen archive.

```sh
pnpm install --frozen-lockfile
pnpm build && pnpm lint
spice-heavy python3 benchmarks/performance/rc1k-attribution.py /absolute/fresh/output --rounds 15
node benchmarks/performance/rc1k-attribution-report.mjs /absolute/fresh/output
pnpm -C packages/core exec vitest run --root ../.. --config benchmarks/performance/rc1k-attribution.vitest.mjs
spice-heavy pnpm test
```

For a smaller reviewer sanity check, use a different fresh directory and
`--rounds 1` or `--rounds 3`. Total rounds are capped at 15 and attempted IDs
are not rerun. The vitest suite is offline; it checks synthetic parsing, AST
return/throw semantics, clock correction, all archived receipts, native raw
hashes, and recomputed distributions. It is intentionally a separate targeted
command; the existing root test script is not modified.

For this archive, run the report command alone to reproduce summary.json and
table.md. Native raw files and prepared JS copies are gzip-compressed losslessly.
Check SHA256SUMS with `shasum -a 256 -c SHA256SUMS` from this directory. The
manifest hashes every archived file except itself.
