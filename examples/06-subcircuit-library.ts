/**
 * Example 6: Subcircuits and Libraries
 *
 * Define a parameterized CMOS inverter subcircuit, then instantiate it
 * multiple times to build an inverter chain. Demonstrates .subckt,
 * parameter overrides, and the resolveInclude callback for .include files.
 */
import { simulate, parseAsync } from '@spice-ts/core';

// -- Part A: Inline subcircuit via netlist --

const resultA = await simulate(`
  * Inverter chain using inline subcircuit
  .model NMOD NMOS (VTO=0.7 KP=120u LAMBDA=0.04)
  .model PMOD PMOS (VTO=-0.7 KP=60u LAMBDA=0.05)

  .subckt inv in out vdd
  MP out in vdd PMOD
  MN out in 0 NMOD
  CL out 0 10f
  .ends inv

  VDD vdd 0 DC 3.3
  VIN in 0 DC 0

  X1 in n1 vdd inv
  X2 n1 out vdd inv

  .op
`);

console.log(`Part A: Inline Subcircuit (2-stage inverter)`);
console.log(`  V(in)  = ${resultA.dc!.voltage('in').toFixed(2)} V`);
console.log(`  V(n1)  = ${resultA.dc!.voltage('n1').toFixed(2)} V (inverted)`);
console.log(`  V(out) = ${resultA.dc!.voltage('out').toFixed(2)} V (double inverted)`);

// -- Part B: Using resolveInclude for external library files --

// Simulate an in-memory file system with a library file
const libraryFiles: Record<string, string> = {
  'models.lib': `
    .model NMOD NMOS (VTO=0.7 KP=120u LAMBDA=0.04)
    .model PMOD PMOS (VTO=-0.7 KP=60u LAMBDA=0.05)
  `,
};

const netlist = `
  * Using .include to load external models
  .include 'models.lib'

  VDD vdd 0 DC 3.3
  VIN in 0 DC 3.3

  MP out in vdd PMOD
  MN out in 0 NMOD
  RL out 0 10k

  .op
`;

// parseAsync with a resolver that returns file contents
const circuit = await parseAsync(netlist, async (path) => {
  const content = libraryFiles[path];
  if (!content) throw new Error(`File not found: ${path}`);
  return content;
});

const resultB = await simulate(circuit);

console.log(`\nPart B: External Library (.include)`);
console.log(`  V(in)  = ${resultB.dc!.voltage('in').toFixed(2)} V`);
console.log(`  V(out) = ${resultB.dc!.voltage('out').toFixed(2)} V`);
