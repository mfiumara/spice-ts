// SPDX-License-Identifier: MIT
import { readFileSync, writeFileSync } from 'node:fs';
const here = 'benchmarks/dc-floating-recovery-917/';
const comparison = JSON.parse(readFileSync(here + 'comparison.json','utf8'));
const native = JSON.parse(readFileSync(here + 'native-probes.json','utf8'));
const reference = JSON.parse(readFileSync(here + 'reference-probes.json','utf8'));
const probeDeltas = [false,true].map(small => {
  const n = native.find((r: {small:boolean;useInitialConditions:boolean})=>r.small===small&&!r.useInitialConditions);
  const r = reference.receipts.find((r:{name:string})=>r.name===(small?'op-small':'op'));
  const values = r.raw.split('Values:\n')[1].trim().split('\n').map((line:string)=>Number(line.trim().split(/\s+/).at(-1)));
  const expected = Object.fromEntries(['in','a','b'].map((name,i)=>[name,values[i]]));
  const deltas = n.nodeNames.map((name:string,i:number)=>({name,native:n.solution[i],reference:expected[name],absoluteError:Math.abs(n.solution[i]-expected[name])}));
  return {name:small?'1n/2n control':'1u/2u reduction',steps:n.steps,time:n.time,deltas,
    maxAbsoluteError:Math.max(...deltas.map((d:{absoluteError:number})=>d.absoluteError)),
    rmsAbsoluteError:Math.sqrt(deltas.reduce((s:number,d:{absoluteError:number})=>s+d.absoluteError*d.absoluteError,0)/deltas.length)};
});
const receipts = comparison.receipts.map((r:any)=>({name:r.name,sha256:r.deckHashBefore,identicalInput:r.deckHashBefore===r.deckHashAfter&&JSON.stringify(r.includesBefore)===JSON.stringify(r.includesAfter),
  before:r.native.before.status,after:r.native.after.status,nativeBeforeMs:r.native.before.milliseconds,nativeAfterMs:r.native.after.milliseconds,
  referenceExit:r.reference.exit,referenceAcRows:r.reference.acRows,referenceMs:r.reference.milliseconds,maxError:r.maxError,rmsError:r.rmsError,comparedValues:r.comparedValues}));
writeFileSync(here+'summary.json',JSON.stringify({baseline:comparison.baseline,runtimeCaveat:'Single shared-host runs, not a speed claim. Native timings include parse/compile/analysis; reference includes startup/raw I/O.',receipts,probeDeltas},null,2)+'\n');
console.log({receipts,probeDeltas});
