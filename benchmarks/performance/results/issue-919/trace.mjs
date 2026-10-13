// Three additional phase-tagged traces. Max 45s per direct Node child.
// Diagnostic monkey-patching changes receiver shape/call targets AFTER timing.
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
const out = resolve('benchmarks/performance/results/issue-919');
const rows = [];
for (const size of [1000, 10000, 50000]) {
  const prefix = `${out}/profiles/capture-resistor-mesh-op-${size}-r3`;
  writeFileSync(`${prefix}.jsonl`, '');
  const argv = ['--trace-opt', '--trace-deopt', '--print-bytecode', '--print-bytecode-filter=applySupernode', `${out}/worker.mjs`, 'isolate', 'resistor-mesh-op', String(size), prefix];
  const start = performance.now();
  const child = spawnSync(process.execPath, argv, { encoding: 'utf8', timeout: 45000, killSignal: 'SIGKILL', maxBuffer: 128 * 1024 * 1024 });
  writeFileSync(`${out}/logs/trace-${size}.stdout.gz`, gzipSync(child.stdout ?? ''));
  writeFileSync(`${out}/logs/trace-${size}.stderr.txt`, child.stderr ?? '');
  rows.push({ size, argv, exit: child.status, signal: child.signal, wallMs: performance.now() - start, error: child.error?.message, samples: readFileSync(`${prefix}.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) });
  if (child.status !== 0) throw new Error(`trace ${size} failed`);
}
writeFileSync(`${out}/trace-samples.json`, JSON.stringify(rows, null, 2));
console.log('Three phase-tagged bytecode/JIT trace children exit0');
