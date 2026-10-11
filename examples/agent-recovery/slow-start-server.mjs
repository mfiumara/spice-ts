// Test helper: stands in for an MCP stdio server that is slow to start, as on a
// loaded CI machine. It waits SPICE_TS_SLOW_START_MS, then loads the real
// entrypoint named by SPICE_TS_SLOW_START_SERVER. Requests written meanwhile
// stay buffered in the stdin pipe, exactly as during a slow cold start.
import { pathToFileURL } from 'node:url';

const delayMs = Number(process.env.SPICE_TS_SLOW_START_MS);
const server = process.env.SPICE_TS_SLOW_START_SERVER;
if (!Number.isFinite(delayMs) || delayMs < 0 || !server) {
  throw new Error('Set SPICE_TS_SLOW_START_MS and SPICE_TS_SLOW_START_SERVER');
}

await new Promise(resolveDelay => setTimeout(resolveDelay, delayMs));
await import(pathToFileURL(server).href);
