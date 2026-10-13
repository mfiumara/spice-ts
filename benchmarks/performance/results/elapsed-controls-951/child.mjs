// Run unchanged #938 measurement code, never the archived deadline controller.
import { writeFileSync } from 'node:fs';
const [bundle, circuit, size, journal, lifetime] = process.argv.slice(2);
const startPerformance = performance.now(), startRealtime = Date.now();
for (const mode of circuit === 'resistor-mesh-op' ? ['isolate', 'simulate'] : ['simulate']) {
  process.argv = [process.argv[0], process.argv[1], mode, bundle, circuit, size, journal + '.' + mode, 'baseline'];
  await import(new URL('../issue-938/worker.mjs?' + mode, import.meta.url));
}
writeFileSync(lifetime, JSON.stringify({ performanceMs: performance.now() - startPerformance, realtimeMs: Date.now() - startRealtime, nodeVersion: process.version, execPath: process.execPath }) + '\n');
