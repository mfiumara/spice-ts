#!/usr/bin/env node
/**
 * Issue #842: split a V8 .cpuprofile's self time by phase (parse/compile, DC
 * operating point, transient stepping) and, within each phase, by the
 * categories the issue asks for: device load, sparse LU, integration history +
 * LTE/timestep control, Newton control + convergence tests, result recording,
 * GC and other.
 *
 *   node breakdown.mjs [--table] <file.cpuprofile> [...]
 *
 * --table prints one markdown row per profile: each category's share of the
 * sampled time summed over phases, and the transient phase's share.
 *
 * Phase comes from the sample's stack: a frame named attemptStep /
 * advanceSolution / stampPrevB / chargeTruncationTimestep / checkLTE (or any
 * frame below them) is transient, newtonRaphson / solveDCOperatingPoint is DC.
 * GC samples have no JS stack and are reported as their own phase.
 *
 * V8 inlines the MOS1 junction and channel equations into MOSFET.batchStamp,
 * so evaluation and stamping are one category ("device load"), like ngspice's
 * "Matrix load time" (CKTload).
 */
import { readFileSync } from 'node:fs';

const CATEGORIES = [
  ['device load', /^(batchStamp|stamp|mos1BulkJunctions|mos1Channel|bulkJunction|pnjlim|recordMos1Load|evaluateBulkJunctions|evaluateChannel|stampStaticDevices|stampDynamicDevices|buildCompanionSystem|stampG|stampB|stampC|clear|applyNodeHolds|stampTransientCharge|evaluateCharges|meyerHalfCapacitances|stampDynamic|batchFor|programFor|getStampContext)$/],
  ['sparse LU', /^(factorize|refactorWithPivots|solve|solveLinearized|analyzePattern|amdOrdering|sortInt32Prefix|matchesFactoredInput|recordFactoredInput|applySupernode|lockTopology|getCscMatrix|getSparseSolver|columnSingletonsFirst|.*[Ss]upernode.*)$/],
  ['history + LTE/timestep control', /^(stampPrevB|checkLTE|lteChecked|chargeTruncationTimestep|truncateTransientStep|truncationTimestepAll|timestep|evaluate|begin|accept|acceptTransientStep|acceptAll|orderAfterAcceptedStep|selectStep|nextBreakTarget|stepIntegration)$/],
  ['Newton control + convergence tests', /^(attemptStep|newtonRaphson|convergenceTest|limitedLastStamp|isConvergedTransient|isConverged|observeTransientNewton|beginTransientNewton|limitNewtonStep|batchNewtonStepScale|mos1NewtonStepScale|applyDeviceStepLimits|stepLimitersFor|isRoundingFloorCycle|isIterationInvariant|nonlinearTerminalNodes|selfLimitingDevices|convergenceTestedDevices)$/],
  ['result recording', /^(record|flush|buildStep|solveTransient|advanceSolution)$/],
  ['garbage collector', /^\(garbage collector\)$/],
];
const PHASES = [
  ['transient', /^(attemptStep|advanceSolution|stampPrevB|chargeTruncationTimestep|checkLTE|acceptTransientStep|record|flush)$/],
  ['DC operating point', /^(newtonRaphson|solveDCOperatingPoint|initDC)$/],
  ['parse + compile', /^(parseAsync|parseNetlist|compile|collectStatements|tokenizeNetlist)$/],
];

const table = process.argv.includes('--table');
const COLUMNS = ['device load', 'sparse LU', 'history + LTE/timestep control', 'Newton control + convergence tests', 'result recording', 'garbage collector', 'other'];
if (table) {
  console.log(`| profile | sampled ms | transient phase | ${COLUMNS.join(' | ')} |`);
  console.log(`|${'---|'.repeat(COLUMNS.length + 3)}`);
}
for (const file of process.argv.slice(2).filter(arg => arg !== '--table')) {
  const profile = JSON.parse(readFileSync(file, 'utf8'));
  const byId = new Map(profile.nodes.map(node => [node.id, node]));
  const parent = new Map();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  const phaseOf = new Map();
  const phase = id => {
    if (phaseOf.has(id)) return phaseOf.get(id);
    const name = byId.get(id).callFrame.functionName;
    const own = PHASES.find(([, pattern]) => pattern.test(name))?.[0];
    const result = own ?? (parent.has(id) ? phase(parent.get(id)) : 'other');
    phaseOf.set(id, result);
    return result;
  };
  const totals = new Map();
  const phaseTotals = new Map();
  let total = 0;
  profile.samples.forEach((id, index) => {
    const us = profile.timeDeltas[index] ?? 0;
    const name = byId.get(id).callFrame.functionName || '(anonymous)';
    const category = CATEGORIES.find(([, pattern]) => pattern.test(name))?.[0] ?? 'other';
    const p = category === 'garbage collector' ? 'GC' : phase(id);
    const key = `${p}\t${category}`;
    totals.set(key, (totals.get(key) ?? 0) + us);
    phaseTotals.set(p, (phaseTotals.get(p) ?? 0) + us);
    total += us;
  });
  if (table) {
    // parse + compile frames fall in the 'other' category.
    const byCategory = new Map();
    for (const [key, us] of totals) {
      const category = key.split('\t')[1];
      byCategory.set(category, (byCategory.get(category) ?? 0) + us);
    }
    const pct = us => `${(100 * (us ?? 0) / total).toFixed(1)}%`;
    console.log(`| ${file.split('/').pop().replace('.cpuprofile', '')} | ${(total / 1000).toFixed(0)} | ${pct(phaseTotals.get('transient'))} | ${COLUMNS.map(c => pct(byCategory.get(c))).join(' | ')} |`);
    continue;
  }
  console.log(`${file.split('/').pop()}: ${(total / 1000).toFixed(1)} ms sampled`);
  for (const [p, pus] of [...phaseTotals].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${p}: ${(pus / 1000).toFixed(1)} ms ${(100 * pus / total).toFixed(1)}%`);
    for (const [key, us] of [...totals].filter(([k]) => k.startsWith(`${p}\t`)).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${(us / 1000).toFixed(1).padStart(9)} ms ${(100 * us / total).toFixed(1).padStart(5)}%  ${key.split('\t')[1]}`);
    }
  }
}
