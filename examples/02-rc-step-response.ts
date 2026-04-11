/**
 * Example 2: RC Low-Pass Filter — Transient Step Response
 *
 * A 1kHz RC filter driven by a 5V pulse. Demonstrates transient
 * analysis and reading time-domain waveforms.
 *
 *   V1 (pulse) --> R1 1k --> out --> C1 1u --> GND
 *
 *   tau = R*C = 1k * 1u = 1ms
 *   Expected: V(out) reaches ~3.16V (63.2%) at t = 1ms
 */
import { simulate } from '@spice-ts/core';

const result = await simulate(`
  V1 in 0 PULSE(0 5 0 1n 1n 10m 20m)
  R1 in out 1k
  C1 out 0 1u
  .tran 10u 5m
`);

const tran = result.transient!;
const time = tran.time;
const vOut = tran.voltage('out');

// Find voltage at t = tau (1ms)
const tauIdx = time.findIndex(t => t >= 1e-3);
console.log(`RC Step Response (tau = 1ms)`);
console.log(`  V(out) at t=0:   ${vOut[0].toFixed(4)} V`);
console.log(`  V(out) at t=tau: ${vOut[tauIdx].toFixed(4)} V  (expected ~3.16V)`);
console.log(`  V(out) at t=5ms: ${vOut[vOut.length - 1].toFixed(4)} V`);
console.log(`  Total timepoints: ${time.length}`);
