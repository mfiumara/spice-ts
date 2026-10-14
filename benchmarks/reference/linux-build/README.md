# Verified Linux arm64 serial Xyce source build (#948 criterion 1)

This source build is verified, superseding the bootstrap document's historical
“not yet executed” status. It does not finish all of #948, implement EKV in
spice-ts, change the adapter, or establish a 100-fixture mutually accepted set.

## Build receipt

Local headless Colima/Docker, Linux arm64, Ubuntu 24.04.4 LTS; two container CPUs,
two compilation jobs, all build/deck commands guarded by `spice-heavy`.
The clean source build completed with exit 0 in **1267 seconds**, excluding the
container/package installation and heavy-slot queue. This is a single build wall
time, not a simulator performance claim.

- Base OCI index: `ubuntu@sha256:786a8b558f7be160c6c8c4a54f9a57274f3b4fb1491cf65146521ae77ff1dc54`.
- Linux arm64 manifest: `sha256:ea0b2b8607a61f981b2461f21edc27c0b37ddd53d23d4d350936480adf5de28c`.
- GCC/G++ 13.3.0 (`13.3.0-6ubuntu2~24.04.1`), CMake 3.28.3,
  Ninja 1.11.1, Bison 3.8.2, Flex/libfl-dev 2.6.4, BLAS/LAPACK 3.12.0.
- Trilinos 14.4.0; SuiteSparse 7.8.3; Xyce 7.10.0. Exact source commits and
  SHA-256 hashes of `git archive HEAD` tar streams are in `pins.json` and the log.
- `TPL_ENABLE_MPI=OFF`, `Trilinos_ENABLE_Fortran=OFF`. The linked BLAS/LAPACK
  still require their packaged libgfortran runtime; no Fortran compiler is used.
- Resulting executable: `Xyce Release 7.10.0-opensource`.
- Executable SHA-256: `e17d62dc6020296a12ea7ddf0fc30139c6934625385e4972e5778153ea6d28ed`.

Before: the shell-checked recipe failed to configure AMD because SuiteSparse 7
installs `amd.h` in `include/suitesparse`, then exposed the missing `libfl-dev`
lexer-header prerequisite. Both actual RED logs are retained. After: the
corrected recipe ran from a fresh container and build root through installation
and `Xyce -v`, with exit 0. Upstream compiler warnings are retained, not hidden.

The build initially used exact direct-tool package pins. Afterwards all installed
packages were captured in `packages.lock`; the published Dockerfile replays this
complete lock, including compiler runtimes, linker and libc, and package versions
are compared byte-for-byte against the build environment. `locked-container.log.gz`
is the replay receipt. This is version-pinned, not a claim that future Ubuntu
mirrors will retain every package forever: missing pinned versions must fail,
never silently upgrade. No container image or executable is published.

## Mac/Linux cross-check

Exactly 3 published EKV2.6 decks and the 19 original numerically compared corpus
fixtures were executed on both platforms. All 22 Linux executions returned 0.
Mac uses the unchanged upstream **XyceNF Release 7.10.0** binary with package
SHA-256 `06cd438e0a3d4dc86948c1d0f6684fa125db3dfa1776ff1d9339ebb77865754b`.
Every regenerated Mac series hash matched the previously committed bootstrap
receipt. Every translated input hash matched too, and Linux executed identical
translated bytes. No adapter, circuit/model values or solver options changed.

`cross-check.md` contains the per-fixture max/RMS absolute error table, separated
into volts and amperes. Each RMS entry is the largest per-signal RMS in that unit,
not a pooled or mixed-unit RMS. `cross-check.json` retains all per-signal absolute
and relative metrics, sample counts and alignment exclusions. Comparison is on
the Linux grid, with linear interpolation of the Mac reference and monotonic DC
sweep segments matched by ordinal. All samples aligned, with zero out-of-range
exclusions. The EKV inverter has the largest measured differences:
**1.6428033322579694e-8 V**, **5.010003574653331e-13 A**. These small but nonzero
differences are published; neither bit-identical output nor universal equivalence
is claimed. The source build is opensource, whereas Sandia's Mac package identifies
itself as NF; only these tested fixtures were cross-checked.

`mac-series.json.gz` retains the original Mac series, command, timing and complete
stdout/stderr. `linux-outputs.json.gz` retains all 22 translated decks, CSV outputs,
exit status, stdout and stderr, including ignored-card warnings. Fixture source
licences/provenance and notices remain at the unchanged corpus/ekv paths referenced
by `benchmarks/SOURCES.md`; outputs are benchmark data, not linked into the MIT
simulator packages. Existing ngspice-vs-Xyce disagreements and MOS1 fallback losses
are unchanged. No before/after simulator-speed or correctness improvement is claimed.

## Reproduce from the repository root

```sh
spice-heavy docker build --platform linux/arm64 -t spice-xyce-serial \
  -f benchmarks/reference/Dockerfile.xyce .
spice-heavy docker run --name xyce-serial-build --platform linux/arm64 --cpus 2 \
  -v "$PWD:/work:ro" spice-xyce-serial \
  bash -euc 'bash /work/benchmarks/reference/build-xyce-serial.sh /build'
# Local checkpoint only, not a registry push:
spice-heavy docker commit xyce-serial-build spice-xyce-serial-built

# XYCE_BIN is the verified Mac upstream installation described in REFERENCES.md.
XYCE_BIN="$XYCE_BIN" spice-heavy pnpm exec tsx \
  benchmarks/reference/cross-check-linux.ts --prepare
spice-heavy docker run --rm --platform linux/arm64 --cpus 2 \
  -v "$PWD/benchmarks/reference/linux-build/decks:/decks" \
  -v "$PWD/benchmarks/reference/run-linux-decks.sh:/run-linux-decks.sh:ro" \
  spice-xyce-serial-built bash /run-linux-decks.sh /decks
pnpm exec tsx benchmarks/reference/cross-check-linux.ts --compare
```

The Dockerfile/package lock is arm64-specific. Linux amd64 is not verified here;
no workflow was needed because the local runtime works. Use unique local container
names or remove only your own stopped container before repeating the command.
Source fetches fail if an existing checkout has a wrong revision or dirty files.

Offline verification requires no simulators or container runtime:

```sh
pnpm exec tsx benchmarks/reference/cross-check-linux.ts --verify
pnpm exec tsx --test benchmarks/reference/linux-build.test.ts \
  benchmarks/reference/xyce.test.ts benchmarks/reference/compare.test.ts
```

The verifier recomputes all metrics from compressed CSV and Mac series, verifies
Mac series against historical hashes, verifies deck hashes, and compares against
the published cross-check JSON. Local build/lint, guarded full tests, and focused
reference tests were exercised; logs are retained. Live adapter tests skip
explicitly when XYCE_BIN is unset. Required GitHub CI is verified on the PR's
exact final head separately. Adding the provenance row leaves the historical
aggregate whole-file SOURCES.md pin stale; no aggregate ledger is regenerated.
