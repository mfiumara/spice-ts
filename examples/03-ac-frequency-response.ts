/**
 * Example 3: RC Low-Pass Filter — AC Frequency Response (Bode Plot)
 *
 * Same RC filter as example 2, but analyzed in the frequency domain.
 * Demonstrates AC analysis with decade sweep and reading magnitude/phase.
 *
 *   f_-3dB = 1 / (2*pi*R*C) = 1 / (2*pi*1k*1u) = 159.15 Hz
 */
import { simulate } from '@spice-ts/core';

const result = await simulate(`
  V1 in 0 DC 0 AC 1
  R1 in out 1k
  C1 out 0 1u
  .ac dec 20 1 100k
`);

const ac = result.ac!;
const freqs = ac.frequencies;

// Find -3dB point (where magnitude drops to 1/sqrt(2) = 0.707)
const mags = ac.voltage('out').map(v => v.magnitude);
const phases = ac.voltage('out').map(v => v.phase);

let f3dB = 0;
for (let i = 1; i < mags.length; i++) {
  if (mags[i] < 0.707) {
    // Linear interpolation
    f3dB = freqs[i - 1] + (freqs[i] - freqs[i - 1]) *
      (mags[i - 1] - 0.707) / (mags[i - 1] - mags[i]);
    break;
  }
}

console.log(`AC Frequency Response — RC Low-Pass Filter`);
console.log(`  Frequency points: ${freqs.length}`);
console.log(`  |H| at 1 Hz:     ${mags[0].toFixed(4)} (${(20 * Math.log10(mags[0])).toFixed(1)} dB)`);
console.log(`  |H| at 100 Hz:   ${mags[Math.floor(freqs.length * 0.4)].toFixed(4)}`);
console.log(`  f_-3dB:          ${f3dB.toFixed(1)} Hz (expected ~159 Hz)`);
console.log(`  Phase at f_-3dB: ${phases[freqs.findIndex(f => f >= f3dB)].toFixed(1)} deg (expected ~-45 deg)`);
