// Microbench: LinearReactiveTruncation.timestep + accept on N capacitors.
import { LinearReactiveTruncation } from '../../../../packages/core/src/analysis/transient-reactive-truncation.ts';
import { Capacitor } from '../../../../packages/core/src/devices/capacitor.ts';

const N = Number(process.argv[2] ?? 10000);
const devices = [];
for (let i = 0; i < N; i++) devices.push(new Capacitor(`C${i}`, [i, -1], 1e-12));
const lrt = new LinearReactiveTruncation(devices, N);
const x = new Float64Array(N);
for (let i = 0; i < N; i++) x[i] = Math.sin(i);
lrt.accept(x, undefined);
const integ = { method: 'trapezoidal' as const, dt: 1e-9, prevDt: 1e-9 };
const trunc = { deltas: [1e-9, 1e-9, 1e-9] as const, reltol: 1e-3, abstol: 1e-12, chgtol: 1e-14, trtol: 7 };
let sink = 0;
for (let r = 0; r < 3; r++) { for (let i = 0; i < N; i++) x[i] += 1e-3; lrt.accept(x, integ); }
const reps = 300;
let t0 = performance.now();
for (let r = 0; r < reps; r++) { x[r % N] += 1e-4; sink += lrt.timestep(x, integ, trunc); }
const tTrunc = performance.now() - t0;
t0 = performance.now();
for (let r = 0; r < reps; r++) { x[r % N] += 1e-4; lrt.accept(x, integ); }
const tAcc = performance.now() - t0;
console.log(`N=${N} timestep ${(tTrunc / reps / N * 1e6).toFixed(1)} ns/cap, accept ${(tAcc / reps / N * 1e6).toFixed(1)} ns/cap  (${sink > 0})`);
