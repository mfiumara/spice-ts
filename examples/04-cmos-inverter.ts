/**
 * Example 4: CMOS Inverter — Nonlinear Transient
 *
 * A single CMOS inverter stage with NMOS/PMOS transistors.
 * Demonstrates .model cards, MOSFET simulation, and switching waveforms.
 *
 *   VDD (3.3V) --- MP (PMOS) --- out --- MN (NMOS) --- GND
 *                      |                     |
 *                     in                    in
 */
import { simulate } from '@spice-ts/core';

const result = await simulate(`
  * CMOS Inverter
  .model NMOD NMOS (VTO=0.7 KP=120u LAMBDA=0.04)
  .model PMOD PMOS (VTO=-0.7 KP=60u LAMBDA=0.05)

  VDD vdd 0 DC 3.3
  VIN in 0 PULSE(0 3.3 0 0.1n 0.1n 5n 10n)

  MP out in vdd PMOD
  MN out in 0 NMOD
  CL out 0 10f

  .tran 0.01n 20n
`);

const tran = result.transient!;
const time = tran.time;
const vIn = tran.voltage('in');
const vOut = tran.voltage('out');

// Find high and low output levels after settling
const vOutLast = vOut[vOut.length - 1];
const vOutMid = vOut[Math.floor(vOut.length / 2)];

console.log(`CMOS Inverter Transient`);
console.log(`  Timepoints:      ${time.length}`);
console.log(`  V(out) midpoint: ${vOutMid.toFixed(3)} V`);
console.log(`  V(out) final:    ${vOutLast.toFixed(3)} V`);
console.log(`  V(in) final:     ${vIn[vIn.length - 1].toFixed(3)} V`);
