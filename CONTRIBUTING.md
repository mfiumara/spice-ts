# Contributing

Read [CHARTER.md](CHARTER.md) for project priorities, benchmark policy and publication boundaries.

Evidence goes in the PR body or a single README receipt, never raw logs or agent scratch planning notes. Keep structured benchmark data and any historical files required to verify existing receipts; do not add new tracked `*.log` or `*POTETO*.md` files.

`pnpm lint` runs the fast agent-artifact guard and its tests before workspace lint. The guard compares tracked additions (including staged files) against the merge base with `origin/main`, falling back to `HEAD` when no remote main exists. CI supplies the PR base SHA explicitly and fetches full history. You can reproduce that check with `node scripts/check-agent-artifacts.mjs --base <base-sha>`.
