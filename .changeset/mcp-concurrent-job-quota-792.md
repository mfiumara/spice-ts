---
"@spice-ts/mcp": minor
---

Enforce a per-server concurrent running-job quota (`streaming.maxConcurrentJobs`, default 2) shared by `spice_simulation_start` and `spice_simulate`; calls beyond it fail with a retryable structured `RESOURCE_LIMIT` (`details.limit: "maxConcurrentJobs"`, `configured`/`observed`, `maximum`/`actual`). The terminal-job retention TTL is now 300000 ms (was 60000 ms). `spice_capabilities` reports the quota, and the defaults now match docs/architecture/ai-native-api.md section 8 (#792).
