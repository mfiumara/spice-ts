# Issue 348 multi-analysis recovery

This executable example sends one request containing transient and AC analyses through the public packed MCP API. It discovers capabilities first, then validates the request with `maxAnalyses` set to one. Validation returns a structured `RESOURCE_LIMIT` error that names `maxAnalyses`, reports the configured maximum, and reports the required value.

The workflow clones the request and changes only `/options/limits/maxAnalyses`. It validates again, starts the corrected job, replays the first cursor exactly, and resumes from `nextCursor` to the terminal response. A second corrected run must produce the same normalized terminal result and hashes. The checked output records the public error, changed JSON pointer, analysis and point order, input hash, result hash, event hash, and normalized terminal hash.

`RESOURCE_LIMIT.retryable` is `false`. Recovery requires the named request-field repair. Retrying the unchanged request is not supported.

Run from the repository root after installing dependencies:

```sh
pnpm -C packages/mcp build
node --test examples/agent-workflows/issue-348/workflow.test.mjs
```

Run the packed consumer directly with:

```sh
node examples/agent-workflows/issue-348/packed-consumer.mjs
```

`packed-consumer.mjs` packs `@spice-ts/core`, `@spice-ts/protocol`, and `@spice-ts/mcp`, installs the tarballs in a temporary external project, copies only `workflow.mjs`, and runs from that external directory. The focused test compares stdout byte-for-byte with `expected-output.json`.

The circuit is authored demonstration data. It is not benchmark or parity evidence, and this example makes no simulator-accuracy or performance claim.
