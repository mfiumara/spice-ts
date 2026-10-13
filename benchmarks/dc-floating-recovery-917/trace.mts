// SPDX-License-Identifier: MIT
// Observational wrappers only; no vendor expressions or full matrices exported.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { simulate } from '../../packages/core/src/simulate.js';
import { MNAAssembler } from '../../packages/core/src/mna/assembler.js';
import { GilbertPeierlsSolver } from '../../packages/core/src/solver/gilbert-peierls.js';
import type { CscMatrix } from '../../packages/core/src/solver/csc-matrix.js';
type FactorReceipt = { sourceScale: number; deviceGmin: number; nonfinite: number; error: string | null };
const oldGet = MNAAssembler.prototype.getSparseSolver;
const oldFactor = GilbertPeierlsSolver.prototype.factorize;
let assembler: MNAAssembler;
let factors: FactorReceipt[] = [];
MNAAssembler.prototype.getSparseSolver = function () { assembler = this; return oldGet.call(this); };
GilbertPeierlsSolver.prototype.factorize = function (matrix: CscMatrix) {
  const receipt: FactorReceipt = {sourceScale:assembler.sourceScale,deviceGmin:assembler.deviceGmin,nonfinite:Array.from(matrix.values).filter(v=>!Number.isFinite(v)).length,error:null};
  factors.push(receipt);
  try { return oldFactor.call(this,matrix); }
  catch(error) { receipt.error = (error as Error).message.replace(/\(nodes: XU461.*$/, '(nodes: <expanded behavioral node redacted>)'); throw error; }
};
const receipts = [];
try {
  for (const name of ['base_159.cir','variant_159.cir']) {
    const deck = resolve('.receipt-882/ngspice/784',name);
    const text = readFileSync(deck,'utf8');
    const paths = [...text.matchAll(/^\s*\.include\s+"([^"]+)"/gim)].map(m=>m[1]);
    factors=[];
    let error: string | null = null;
    const start=performance.now();
    try { await simulate(text,{resolveInclude:async (name:string)=> {
      const path=paths.find(p=>basename(p).toLowerCase()===basename(name.replaceAll('\\','/')).toLowerCase());
      if(!path)throw new Error('Missing include');
      return readFileSync(path,'utf8');
    }}); }
    catch(e) { error=(e as Error).message.replace(/\(nodes: XU461.*$/, '(nodes: <expanded behavioral node redacted>)'); }
    receipts.push({name,sha256:createHash('sha256').update(text).digest('hex'),milliseconds:performance.now()-start,error,factors,maxError:null,rmsError:null});
  }
} finally { MNAAssembler.prototype.getSparseSolver=oldGet; GilbertPeierlsSolver.prototype.factorize=oldFactor; }
writeFileSync('benchmarks/dc-floating-recovery-917/trace.json',JSON.stringify(receipts,null,2)+'\n');
console.log(receipts.map(r=>({name:r.name,error:r.error,attempts:r.factors.length,distinctErrors:[...new Set(r.factors.map(f=>f.error))]})));
