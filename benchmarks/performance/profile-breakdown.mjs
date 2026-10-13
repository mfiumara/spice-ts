#!/usr/bin/env node
/**
 * Issue #830: split a V8 .cpuprofile's self time into device load (MOS1
 * evaluation + MNA stamping), Newton step limiting / convergence tests, sparse
 * LU, GC, parse/compile and other, by frame name.
 *
 *   node benchmarks/performance/profile-breakdown.mjs <file.cpuprofile> [...]
 *
 * V8 inlines the MOS1 junction/channel equations into MOSFET.batchStamp, so
 * device evaluation and stamping cannot be separated from the profile alone;
 * they are reported together as "device load", like ngspice's "Matrix load
 * time" (CKTload: device evaluation and stamping).
 */
import { readFileSync } from 'node:fs';

const CATEGORIES = [
  ['device load (MOS1 eval + stamp)', /^(batchStamp|stamp|mos1BulkJunctions|mos1Channel|bulkJunction|pnjlim|recordMos1Load|evaluateBulkJunctions|evaluateChannel|stampStaticDevices|stampDynamicDevices|buildCompanionSystem|stampG|stampB|stampC|clear|applyNodeHolds|stampPrevB|stampTransientCharge|evaluateCharges|meyerHalfCapacitances)$/],
  ['step limit + convergence tests', /^(limitNewtonStep|batchNewtonStepScale|mos1NewtonStepScale|gateStepScale|fetlim|applyDeviceStepLimits|convergenceTest|limitedLastStamp|isConverged|isRoundingFloorCycle|stepLimitersFor)$/],
  ['sparse LU', /^(factorize|refactorWithPivots|solve|analyzePattern|amdOrdering|sortInt32Prefix|matchesFactoredInput|recordFactoredInput|applySupernode|lockTopology|getCscMatrix|.*[Ss]upernode.*)$/],
  ['garbage collector', /^\(garbage collector\)$/],
  ['parse + compile', /^(parseAsync|parseNetlist|tokenizeLine|tokenizeNetlist|compile|collectStatements|parseDevice|preprocessSteps|extractControlBlocks|resolveNode|addCanonical)$/],
];

for (const file of process.argv.slice(2)) {
  const profile = JSON.parse(readFileSync(file, 'utf8'));
  const byId = new Map(profile.nodes.map(node => [node.id, node]));
  const totals = new Map();
  let total = 0;
  profile.samples.forEach((id, index) => {
    const us = profile.timeDeltas[index] ?? 0;
    const name = byId.get(id).callFrame.functionName || '(anonymous)';
    const category = CATEGORIES.find(([, pattern]) => pattern.test(name))?.[0] ?? 'other (Newton loop, idle, runtime)';
    totals.set(category, (totals.get(category) ?? 0) + us);
    total += us;
  });
  console.log(`${file}: ${(total / 1000).toFixed(1)} ms sampled`);
  for (const [category, us] of [...totals].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${(us / 1000).toFixed(1).padStart(9)} ms ${(100 * us / total).toFixed(1).padStart(5)}%  ${category}`);
  }
}
