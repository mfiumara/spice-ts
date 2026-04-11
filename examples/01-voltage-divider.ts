/**
 * Example 1: Voltage Divider — DC Operating Point
 *
 * The simplest possible simulation: a resistive voltage divider.
 * Demonstrates netlist parsing and reading DC results.
 *
 *   V1 = 5V
 *     |
 *    [R1 1k]
 *     |
 *    out (2.5V)
 *     |
 *    [R2 1k]
 *     |
 *    GND
 */
import { simulate } from '@spice-ts/core';

const result = await simulate(`
  V1 in 0 DC 5
  R1 in out 1k
  R2 out 0 1k
  .op
`);

const vOut = result.dc!.voltage('out');
console.log(`V(out) = ${vOut.toFixed(4)} V`);  // 2.5000 V
console.log(`I(V1)  = ${(result.dc!.current('V1') * 1e3).toFixed(4)} mA`);  // -2.5000 mA
