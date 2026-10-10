# Issue 355 bounded VCVS OP receipt

The three project-authored MIT fixtures in this directory are supplied byte-for-byte to the explicit `spice-ts-wasm` backend and native ngspice-47. They cover single-ended gain, differential control/output polarity, negative gain, branch ordering, and VCVS branch current.

Run `pnpm --filter @spice-ts/wasm bench:vcvs-op` to generate the receipt. Run `pnpm --filter @spice-ts/wasm bench:vcvs-op:check` to validate its revision without rewriting it. The generator builds the package, requires ngspice-47, executes five fresh-process samples per engine, and writes `report.json` with fixture hashes, scalar max/RMS absolute and relative errors, convergence, process boundaries, runtime samples, and artifact-size changes from exact base `1c2c8985e47f3030396a1fc3da5fd47db50dc330`.

`versions.measuredRevision` names the checkout that produced the measurements. A receipt-only commit must have exactly one parent and change only `benchmarks/results/issue-355/report.json`; for that commit, `measuredRevision` must equal its sole parent. Generation from a valid receipt-only checkout keeps that parent revision instead of replacing it with the receipt commit SHA. On any other checkout, `measuredRevision` must equal `HEAD`.

The runtime boundary includes pnpm, tsx, Node, worker construction, parsing, solving, and serialization for WASM. The ngspice boundary uses one fresh native process per fixture. These measurements are end-to-end receipts, not a kernel speed or simulator superiority claim.

The recorded run matched all 19 scalar vectors exactly. The WASM suite median was 1,230.573 ms versus 60.336 ms for native ngspice, a 20.3954x or 1,939.54% end-to-end loss under the stated unequal process boundaries. From the exact base, `worker.js` grew 852 bytes, `index.js` grew 53 bytes, and `dense-solver.wasm` grew 495 bytes. The backend remains OP-only, dense, limited to 64 unknowns, 256 components, and three fixed memory pages.
