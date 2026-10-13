// SPDX-License-Identifier: MIT
// Runtime-only observations. No vendor names, expressions or matrices leave this worker.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { parseAsync } from '../../packages/core/src/parser/index.js';
import { simulate } from '../../packages/core/src/simulate.js';
import { MNAAssembler } from '../../packages/core/src/mna/assembler.js';
import { GilbertPeierlsSolver } from '../../packages/core/src/solver/gilbert-peierls.js';
import { SingularMatrixError } from '../../packages/core/src/errors.js';
import type { CscMatrix } from '../../packages/core/src/solver/csc-matrix.js';

const hash = (data: string | ArrayBufferView) => createHash('sha256').update(typeof data === 'string' ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength)).digest('hex');
const deck = readFileSync(process.argv[2], 'utf8');
const paths = [...deck.matchAll(/^\s*\.include\s+"([^"]+)"/gim)].map(m => m[1]);
const circuit = await parseAsync(deck, async name => {
  const path = paths.find(p => basename(p).toLowerCase() === basename(name.replaceAll('\\', '/')).toLowerCase());
  if (!path) throw new Error('Missing include');
  return readFileSync(path, 'utf8');
});
const compiled = circuit.compile();
function commonModePairs(matrix:CscMatrix) {
  const missing=Array.from(assembler.diagIdx.subarray(0,assembler.numNodes)).flatMap((slot,index)=>slot<0?[index]:[]);
  const pairs=[];
  for(let i=0;i<missing.length;i++)for(let j=i+1;j<missing.length;j++) {
    const left=missing[i],right=missing[j];
    const residual=new Float64Array(matrix.size);
    let nonzero=false;
    for(const col of [left,right])for(let p=matrix.colPtr[col];p<matrix.colPtr[col+1];p++) {
      residual[matrix.rowIdx[p]]+=matrix.values[p];
      if(matrix.values[p]!==0)nonzero=true;
    }
    if(!nonzero||!residual.every(x=>x===0))continue;
    const supports=[left,right].map(index=>({index,identityHash:hash(compiled.nodeNames[index]),keywordAsNode:/(?:^|\.)(table)$/i.exec(compiled.nodeNames[index])?.[1].toLowerCase()??null,expressionAsNode:/[{}]/.test(compiled.nodeNames[index]),diagonalSlot:assembler.diagIdx[index]}));
    const incident=compiled.devices.flatMap((d,index)=>d.nodes.some(n=>n===left||n===right)?[{deviceIndex:index,type:d.constructor.name,terminalNodes:d.nodes.slice(0,2),controlNodes:d.nodes.slice(2),identityHash:hash(d.name)}]:[]);
    pairs.push({supports,incident,maxResidual:0,verified:true});
  }
  return pairs;
}
// TypeScript private fields are inspected only in this diagnosis process.
type Internals = {colPerm:Int32Array;rowPref:Int32Array;perm:Int32Array;pinv:Int32Array;workspace:Float64Array};

/** Independent dense partial-pivot elimination, in the observed Q order.
 * Stop at first rejected column and back substitute a candidate right-null vector.
 * It is evidence only if A*z independently verifies, not a replacement solver.
 */
function witness(matrix:CscMatrix, order:Int32Array) {
  const n=matrix.size;
  const a=Array.from({length:n},()=>new Float64Array(n));
  for(let k=0;k<n;k++) for(let p=matrix.colPtr[order[k]];p<matrix.colPtr[order[k]+1];p++) a[matrix.rowIdx[p]][k]=matrix.values[p];
  let stop=n, candidateMax=0;
  for(let k=0;k<n;k++) {
    let row=k;
    for(let r=k+1;r<n;r++) if(Math.abs(a[r][k])>Math.abs(a[row][k]))row=r;
    candidateMax=Math.abs(a[row][k]);
    if(candidateMax<1e-18){stop=k;break;}
    [a[k],a[row]]=[a[row],a[k]];
    for(let r=k+1;r<n;r++) {
      const f=a[r][k]/a[k][k];
      if(f===0)continue;
      for(let c=k+1;c<n;c++)a[r][c]-=f*a[k][c];
      a[r][k]=0;
    }
  }
  if(stop===n)return {firstRejectedStep:null,candidateMax,verified:false,support:[]};
  const q=new Float64Array(n);q[stop]=1;
  for(let r=stop-1;r>=0;r--) {
    let sum=0;for(let c=r+1;c<=stop;c++)sum+=a[r][c]*q[c];
    q[r]=-sum/a[r][r];
  }
  const z=new Float64Array(n);for(let k=0;k<n;k++)z[order[k]]=q[k];
  const norm=Math.max(...z.map(Math.abs));for(let k=0;k<n;k++)z[k]/=norm;
  // Only publish a simple signed common-mode witness if rounding to 0/+-1 verifies EXACTLY.
  const simple=Float64Array.from(z,x=>Math.round(x));
  const residual=new Float64Array(n);
  for(let c=0;c<n;c++)for(let p=matrix.colPtr[c];p<matrix.colPtr[c+1];p++)residual[matrix.rowIdx[p]]+=matrix.values[p]*simple[c];
  const maxResidual=Math.max(...residual.map(Math.abs));
  const support=Array.from(simple).flatMap((value,index)=>value===0?[]:[{index,value,kind:index<compiled.nodeCount?'node':'branch',identityHash:hash(index<compiled.nodeCount?compiled.nodeNames[index]:compiled.branchNames[index-compiled.nodeCount])}]);
  return {firstRejectedStep:stop,originalColumn:order[stop],candidateMax,maxResidual,verified:maxResidual===0&&support.length>0,support};
}

let assembler:MNAAssembler;
const factors:unknown[]=[];
const oldGet=MNAAssembler.prototype.getSparseSolver;
const oldFactor=GilbertPeierlsSolver.prototype.factorize;
MNAAssembler.prototype.getSparseSolver=function(){assembler=this;return oldGet.call(this);};
GilbertPeierlsSolver.prototype.factorize=function(matrix:CscMatrix){
  const stack=new Error().stack??'';
  const phase=stack.includes('dynamicGminStepping')?'dynamic-node-gmin':stack.includes('trueGminStepping')?'true-device-gmin':stack.includes('sourceStepping')?'source-stepping':'plain-newton';
  const internal=this as unknown as Internals;
  const state={hash:hash(assembler.solution),nodesZero:assembler.solution.subarray(0,assembler.numNodes).every(x=>x===0),branchesZero:assembler.solution.subarray(assembler.numNodes).every(x=>x===0),nonfinite:assembler.solution.filter(x=>!Number.isFinite(x)).length};
  const receipt:Record<string,unknown>={attempt:factors.length,phase,sourceScale:assembler.sourceScale,deviceGmin:assembler.deviceGmin,time:assembler.time,dt:assembler.dt,state,
    matrixHash:hash(matrix.values),patternHash:hash(matrix.colPtr)+':'+hash(matrix.rowIdx),size:matrix.size,nnz:matrix.values.length,
    nonfinite:matrix.values.filter(x=>!Number.isFinite(x)).length,rhsNonfinite:assembler.b.filter(x=>!Number.isFinite(x)).length};
  factors.push(receipt);
  try{return oldFactor.call(this,matrix);}
  catch(error){
    if(!(error instanceof SingularMatrixError))throw error;
    receipt.commonModePairs=commonModePairs(matrix);
    const col=error.pivotIndex!;
    const step=internal.colPerm.indexOf(col);
    receipt.pivot={originalColumn:col,eliminationStep:step,preferredOriginalRow:internal.rowPref[step],remainingRows:internal.pinv.filter(x=>x<0).length,
      unpivotedWorkspaceMax:Math.max(...internal.workspace.filter((_,i)=>internal.pinv[i]<0).map(Math.abs)),
      kind:col<compiled.nodeCount?'node':'branch',identityHash:hash(col<compiled.nodeCount?compiled.nodeNames[col]:compiled.branchNames[col-compiled.nodeCount]),
      permutationHash:hash(internal.colPerm),completedRowPermutationHash:hash(internal.perm.subarray(0,step))};
    const proof=witness(matrix,internal.colPerm);receipt.witness=proof;
    if(proof.verified){
      const set=new Set(proof.support.map(s=>s.index));
      receipt.diagonalSlots=proof.support.map(s=>({index:s.index,slot:assembler.diagIdx[s.index],nameContainsBrace:/[{}]/.test(compiled.nodeNames[s.index]??''),nameContainsParenthesis:/[()]/.test(compiled.nodeNames[s.index]??''),keywordAsNode:/(?:^|\.)(value|table|vol|cur)$/i.exec(compiled.nodeNames[s.index]??'')?.[1].toLowerCase()??null}));
      receipt.missingNodeDiagonals=Array.from(assembler.diagIdx.subarray(0,assembler.numNodes)).flatMap((slot,index)=>slot<0?[index]:[]);
      receipt.incidentTopology=compiled.devices.flatMap((d,index)=>d.nodes.some(n=>set.has(n))||d.branches.some(b=>set.has(compiled.nodeCount+b))?[{
        deviceIndex:index,type:d.constructor.name,terminalNodes:d.nodes.slice(0,2),controlNodes:d.nodes.slice(2),branchColumns:d.branches.map(b=>compiled.nodeCount+b),identityHash:hash(d.name),
        ...(d.constructor.name==='VCCS'?{gainFinite:Number.isFinite((d as unknown as {gm:number}).gm),gainZero:(d as unknown as {gm:number}).gm===0}:{}),
      }]:[]);
    }
    throw error;
  }
};
const start=performance.now();
let status='success',terminalPivot:number|undefined;
let authoredControl:unknown=null;
try{
  const result=await simulate(circuit);
  if(basename(process.argv[2])==='table-lowered.cir')authoredControl={dc:result.dc?Object.fromEntries(result.dc.voltages):null,acRows:result.ac?.frequencies.length??null};
}catch(error){status='failure';if(error instanceof SingularMatrixError)terminalPivot=error.pivotIndex;}
finally{MNAAssembler.prototype.getSparseSolver=oldGet;GilbertPeierlsSolver.prototype.factorize=oldFactor;}
console.log(JSON.stringify({status,terminalPivot,milliseconds:performance.now()-start,nodeCount:compiled.nodeCount,branchCount:compiled.branchCount,factors,authoredControl}));
