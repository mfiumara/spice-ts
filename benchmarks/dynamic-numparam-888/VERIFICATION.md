# Local verification receipts

All commands run from the isolated task worktree. Log files below are real captured output.

| Command | Exit | Evidence |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | 0 | Installed locked dependencies; no lockfile diff. Initial missing MCP bin warning precedes build. |
| `python3 benchmarks/dynamic-numparam-888/generate.py` | 0 | 16 cases generated. |
| `spice-heavy python3 benchmarks/dynamic-numparam-888/compare.py` | 0 | receipt.json, 16 reference completions, 6 native failures, 2 native numeric precedence losses; 5.513440246 actual child seconds. |
| `python3 benchmarks/dynamic-numparam-888/test_receipt.py` | 0 | offline.log, 5 offline evidence tests. |
| `python3 benchmarks/dynamic-numparam-888/test_receipt.py --parity` | 1, expected RED | red.log.gz, 8 failing subcases on the captured baseline. |
| `pnpm build` | 0 | build.log.gz. |
| `pnpm lint` | 0 | lint.log. |
| `pnpm -C packages/core exec vitest run src/parser/subckt-param-order-857.test.ts src/subcircuit-model-scope-854.test.ts` | 0 | lexical.log, 17 tests. |
| Relocated offline check | 0 | Copied test_receipt.py, receipt.json, matrix.json and decks to ignored .run/offline-copy; 5 tests pass with no upstream source checkout at that location. |
| `git diff --check` | 0 | No whitespace errors. |

The first lexical command included nonexistent src/parser/subckt-models.test.ts, so only
12 #857 tests actually ran. lexical.log was subsequently replaced by the corrected command
above, which executes all 17 #854/#857 tests. No claim is made for the nonexistent path.

Full gate is invoked as `spice-heavy pnpm test`, never unwrapped. Its log is untracked
full-tests.log; final exit and exact-head test20/test22/build/accuracy CI are recorded in the
PR and card handoff, not guessed here. No production change was made, so there is no GREEN
fix or production before/after measurement. Offline evidence GREEN is distinct from parity RED.
