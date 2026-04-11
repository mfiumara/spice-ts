/**
 * Example 5: Programmatic API — Build Circuit in Code
 *
 * Build a Wheatstone bridge circuit using the Circuit class instead
 * of a netlist string. Demonstrates all programmatic methods.
 *
 *        V1 (10V)
 *        |
 *     ---+---
 *     |     |
 *    R1    R2
 *   (1k)  (2k)
 *     |     |
 *     a     b    <-- measure V(a) - V(b)
 *     |     |
 *    R3    R4
 *   (3k)  (6k)
 *     |     |
 *     ---+---
 *        |
 *       GND
 */
import { Circuit, simulate } from '@spice-ts/core';

const ckt = new Circuit();

// Power supply
ckt.addVoltageSource('V1', 'top', '0', { dc: 10 });

// Bridge resistors
ckt.addResistor('R1', 'top', 'a', 1000);
ckt.addResistor('R2', 'top', 'b', 2000);
ckt.addResistor('R3', 'a', '0', 3000);
ckt.addResistor('R4', 'b', '0', 6000);

// DC operating point analysis
ckt.addAnalysis('op');

const result = await simulate(ckt);
const dc = result.dc!;

const vA = dc.voltage('a');
const vB = dc.voltage('b');

console.log(`Wheatstone Bridge (Programmatic API)`);
console.log(`  V(a)     = ${vA.toFixed(4)} V`);
console.log(`  V(b)     = ${vB.toFixed(4)} V`);
console.log(`  V(a-b)   = ${(vA - vB).toFixed(4)} V`);
console.log(`  Balanced: ${Math.abs(vA - vB) < 0.01 ? 'yes' : 'no'}`);
// R1/R3 = 1k/3k = 0.333, R2/R4 = 2k/6k = 0.333 -> balanced bridge
