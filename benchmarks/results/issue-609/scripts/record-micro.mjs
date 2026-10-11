// micro: cost of recording P points of C columns, old per-point push vs chunked recorder
const { ColumnRecorder } = await import(process.argv[2]);
const C = Number(process.argv[3] ?? 50001), P = Number(process.argv[4] ?? 235);
const slots = Array.from({ length: C }, (_, i) => i);
const sol = new Float64Array(C).map((_, i) => i * 1.5 + 0.1);
function old() {
  const cols = slots.map(() => []);
  const t = performance.now();
  for (let p = 0; p < P; p++) for (let k = 0; k < C; k++) cols[k].push(sol[slots[k]]);
  return performance.now() - t;
}
function chunked(rows) {
  const cols = slots.map(() => []);
  const t = performance.now();
  const r = new ColumnRecorder(cols, slots, rows);
  for (let p = 0; p < P; p++) r.record(sol);
  r.flush();
  return performance.now() - t;
}
function prealloc() {
  const t = performance.now();
  const cols = slots.map(() => new Float64Array(P));
  for (let p = 0; p < P; p++) for (let k = 0; k < C; k++) cols[k][p] = sol[slots[k]];
  return performance.now() - t;
}
for (let i = 0; i < 4; i++) {
  console.log('old', old().toFixed(0), 'chunk-default', chunked(undefined).toFixed(0), 'chunk64', chunked(64).toFixed(0), 'typed-prealloc', prealloc().toFixed(0));
}
