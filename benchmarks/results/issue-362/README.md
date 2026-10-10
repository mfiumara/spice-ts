# Issue 362 bounded CCVS OP receipt

The three project-authored MIT fixtures in this directory are supplied byte-for-byte to the explicit `spice-ts-wasm` backend and native ngspice-47. They cover control-branch current, single-ended and differential output polarity, negative gain, deterministic node/branch result ordering, and CCVS branch current.

Run `pnpm --filter @spice-ts/wasm bench:ccvs-op` to generate the receipt. The generator builds the package, requires ngspice-47, executes five fresh-process samples per engine, and writes `report.json` with fixture hashes, the OP grid and all compared signals, scalar max/RMS absolute and relative errors, convergence, process boundaries, runtime samples, and artifact-size changes from exact base `7bc2d6466a2e0a181bd4d32b62cc65120f6fd72b`.

`versions.measuredRevision` is the `HEAD` commit of the checkout that produced the measurements.

The runtime boundary includes pnpm, tsx, Node, worker construction, parsing, solving, and serialization for WASM. The ngspice boundary uses one fresh native process per fixture. All 18 voltage/current scalars matched ngspice-47 exactly, so maximum/RMS absolute and relative errors were zero. Median suite wall time was 1664.697167 ms for WASM and 85.097166 ms for ngspice, a 1856.231030% WASM loss under the stated unequal process boundaries. These measurements are end-to-end receipts, not a kernel speed or simulator superiority claim.

From the exact base, `worker.js` grew 5375 bytes, `index.js` grew 53 bytes, and `dense-solver.wasm` grew 417 bytes. The backend remains dense, limited to 64 unknowns, 256 components, and three fixed memory pages. The committed report is authoritative for every runtime sample, error metric, and measured loss.
