# Local verification

All commands executed in the isolated task worktree. Production baseline
8e32f51f555a2941a30ccfa9281a75f8ef2dbe30 remained unchanged.

- `pnpm install --frozen-lockfile`: exit 0, install.log.
- `spice-heavy python3 benchmarks/xspice-residual-after-931/run.py`: exit 0
  on both attempts, with the first readout child exit 1 preserved, not hidden.
  Final cumulative child budget 7.712823753s / 300s, 28 serial children.
- `python3 benchmarks/xspice-residual-after-931/test_evidence.py -v`: exit 0,
  7 offline tests. No simulator invocation by these tests.
- `pnpm -C packages/core exec vitest run src/devices/xspice`: exit 0,
  5 files / 54 tests passed, targeted.log.
- `pnpm build`: exit 0, build.log.gz (normal Vite chunk-size warnings).
- `pnpm lint`: exit 0, lint.log.
- `spice-heavy pnpm test`: exit 0, full-tests.log.gz. This includes all
  workspace tests and the root benchmark tests. Root node-test summary is
  144 passed / 4 skipped / 0 failed; all preceding workspace summaries are
  retained in the compressed log. Skips are not treated as passes.
- `git diff --cached --check` on authored files: exit 0. An unrestricted check
  reports original whitespace in the byte-identical imported source/COPYING and
  code-model files. It is deliberately not rewritten because source hashes and
  provenance require unchanged bytes. No source-whitespace cleanup is claimed.

Exact-head test20/test22/build/accuracy CI is authoritative and will be recorded
in the task handoff after publication. No local aggregate run or daytime aggregate
hold. No local accuracy claim substituted for required accuracy CI.
