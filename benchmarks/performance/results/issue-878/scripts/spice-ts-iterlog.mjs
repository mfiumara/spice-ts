#!/usr/bin/env node
// Issue #878: per-timepoint transient Newton iterations of one M2 scaling deck
// for a spice-ts dist (SPICE_TS_DIST, default packages/core/dist).
//
//   node spice-ts-iterlog.mjs <circuit> <nodes>
//
// Prints one line per Newton attempt in the format of the instrumented
// ngspice-47 build (`ITERLOG time delta iterations converged`), so both logs
// can be compared with compare-iterlog.mjs. Accepted steps only change
// `simTime`; rejected attempts show up as extra iterations on the same point.
import { pathToFileURL } from 'node:url';

const root = new URL('../../../../..', import.meta.url).pathname.replace(/\/$/, '');
const dist = process.env.SPICE_TS_DIST
  ? pathToFileURL(`${process.env.SPICE_TS_DIST}/index.js`).href
  : `${pathToFileURL(root).href}/packages/core/dist/index.js`;
const { createTransientSim } = await import(dist);
const { m2Netlist } = await import(`${pathToFileURL(root).href}/benchmarks/performance/scaling-m2-fixture.mjs`);

const circuit = process.argv[2];
const nodes = Number(process.argv[3] ?? 10000);
const sim = await createTransientSim(m2Netlist(circuit, nodes).netlist);
let iterations = sim.convergence.transient.newtonIterations;
let rejected = sim.convergence.transient.rejectedSteps;
let previous = sim.simTime;
while (!sim.isDone) {
  sim.advanceSolution();
  const t = sim.convergence.transient;
  console.log(`ITERLOG ${sim.simTime} ${sim.simTime - previous} ${t.newtonIterations - iterations} ${t.rejectedSteps - rejected}`);
  iterations = t.newtonIterations;
  rejected = t.rejectedSteps;
  previous = sim.simTime;
}
const t = sim.convergence.transient;
console.error(JSON.stringify({ circuit, nodes, dcIterations: sim.convergence.dc.newtonIterations, ...t }));
