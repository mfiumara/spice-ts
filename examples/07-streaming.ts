/**
 * Example 7: Streaming API — Process Results Incrementally
 *
 * Use simulateStream() to process transient simulation results as they
 * are computed, without waiting for the full simulation to complete.
 * Useful for progress reporting, live visualization, or early termination.
 */
import { simulateStream } from '@spice-ts/core';

const netlist = `
  * Damped RLC oscillation
  V1 1 0 PULSE(0 1 0 1n 1n 10u 100)
  R1 1 2 10
  L1 2 3 10m
  C1 3 0 1u
  .tran 0.5u 10m
`;

let pointCount = 0;
let peakVoltage = 0;
let peakTime = 0;

for await (const step of simulateStream(netlist)) {
  if ('time' in step) {
    // TransientStep: { time, voltages, currents }
    pointCount++;
    const vc = step.voltages.get('3') ?? 0;

    if (Math.abs(vc) > Math.abs(peakVoltage)) {
      peakVoltage = vc;
      peakTime = step.time;
    }

    // Print progress every 100 points
    if (pointCount % 100 === 0) {
      console.log(`  t = ${(step.time * 1e3).toFixed(3)} ms  V(cap) = ${vc.toFixed(4)} V`);
    }
  }
}

console.log(`\nStreaming Results:`);
console.log(`  Total points:  ${pointCount}`);
console.log(`  Peak voltage:  ${peakVoltage.toFixed(4)} V at t = ${(peakTime * 1e6).toFixed(1)} us`);
