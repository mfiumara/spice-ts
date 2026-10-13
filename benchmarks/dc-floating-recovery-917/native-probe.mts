// SPDX-License-Identifier: MIT
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from '../../packages/core/src/parser/index.js';
import { resolveOptions } from '../../packages/core/src/types.js';
import { createDriverFromCompiled } from '../../packages/core/src/analysis/transient-driver.js';
const receipts = [];
for (const small of [false, true]) {
  const text = readFileSync('benchmarks/vendor-singular-917/floating-rc.cir', 'utf8');
  const c = parse(small ? text.replace('1u','1n').replace('2u','2n') : text).compile();
  for (const useInitialConditions of [true, false]) {
    const start = performance.now();
    const d = createDriverFromCompiled(c, resolveOptions(), {stopTime:1e-5, timestep:1e-7,maxTimestep:1e-7,initialSolution:new Float64Array(c.nodeCount+c.branchCount),useInitialConditions});
    let steps = 0;
    try {
      while (!d.isDone && steps < 10000) {d.advanceSolution(); steps++;}
      receipts.push({small,useInitialConditions,steps,done:d.isDone,time:d.simTime,ms:performance.now()-start,solution:Array.from(d.currentSolution()),nodeNames:c.nodeNames});
    } catch(e) { receipts.push({small,useInitialConditions,steps,error:(e as Error).message}); }
    finally {d.dispose();}
  }
}
writeFileSync('benchmarks/dc-floating-recovery-917/native-probes.json',JSON.stringify(receipts,null,2)+'\n');
console.log(receipts);
