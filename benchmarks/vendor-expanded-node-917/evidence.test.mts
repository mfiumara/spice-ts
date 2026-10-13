// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parse } from '../../packages/core/src/parser/index.js';
const here='benchmarks/vendor-expanded-node-917/';
const inputs=JSON.parse(readFileSync(here+'inputs.json','utf8'));
const originals=JSON.parse(readFileSync(here+'receipts.json','utf8'));
const reductions=JSON.parse(readFileSync(here+'reductions.json','utf8'));
// Expand content-addressed proof references for assertions; no live vendor fetch.
for(const receipt of [...originals.receipts,...reductions.receipts]){
  const native=receipt.native;
  if(!native.details)continue;
  for(const factor of native.factors)for(const key of ['witness','commonModePairs','incidentTopology','diagonalSlots','missingNodeDiagonals']){
    if(factor[key+'Id'])factor[key]=native.details[factor[key+'Id']];
  }
}
const source=JSON.parse(readFileSync(here+'source.json','utf8'));
const budget=JSON.parse(readFileSync(here+'child-budget.json','utf8'));
const sha=(text:Buffer)=>createHash('sha256').update(text).digest('hex');

test('identical relocated originals/includes; 141 reference rows and native losses are preserved',()=>{
  assert.equal(originals.baseline,'f807cd8a3368d344a3a21a9ee17ea52a84bfa748');
  assert.equal(originals.configuration,'set ngbehavior=ltps\nset filetype=ascii\n');
  assert.equal(inputs.archiveHash,'08bc98ee42e423a77fd8260505e0f04ee81f427643cc5e63fb1a9d1d73a99e37');
  assert.deepEqual(inputs.decks.map((d:any)=>d.sourceHash),[
    '72f59a88a9ddb4a8dabf4905e7590fdf9d5a51b8c427c60cc5d9e4dd5a722da4',
    '119bec477c8d001d63198fce478ac7f2dc08c4f3c86321d9a5efa9cf54f58723']);
  assert.equal(originals.receipts.length,2);
  for(const r of originals.receipts){
    const input=inputs.decks.find((d:any)=>d.name===r.name);
    assert.equal(r.inputHashBefore,input.localHash);assert.equal(r.inputHashAfter,input.localHash);
    assert.deepEqual(r.includes,input.includes);
    assert.equal(r.native.status,'failure');assert.equal(r.native.terminalPivot,2);
    assert.equal(r.native.process.exit,0);assert.equal(r.reference.process.exit,0);
    assert.equal(r.reference.acRows,141);assert.equal(r.reference.ltpsConfirmed,true);
    assert.equal(r.reference.xspicePresent,true);assert.equal(r.reference.solver,'SPARSE 1.3');
    assert.equal(r.reference.warnings.dynamicGminCompleted,true);
    assert.equal(r.reference.warnings.transientRecovery,false);
    assert.equal(r.maxError,null);assert.equal(r.rmsError,null);
  }
});

test('later dynamic-node-gmin failures are distinct from initial passive pivot2',()=>{
  for(const [i,r]of originals.receipts.entries()){
    const factors=r.native.factors;
    assert.equal(factors.length,33);
    assert.deepEqual(factors.reduce((a:any,f:any)=>(a[f.phase]=(a[f.phase]??0)+1,a),{}),
      {'plain-newton':1,'dynamic-node-gmin':9,'true-device-gmin':9,'source-stepping':14});
    assert.equal(factors[0].pivot.originalColumn,2);
    assert.deepEqual(factors[0].witness.support.map((s:any)=>s.index),[1,2]);
    for(const f of factors){
      assert.equal(f.nonfinite,0);assert.equal(f.rhsNonfinite,0);assert.equal(f.state.nonfinite,0);
      assert.equal(f.state.nodesZero,true);assert.equal(f.state.branchesZero,true);
      assert.equal(f.time,0);assert.equal(f.dt,0);
      if(f.phase!=='dynamic-node-gmin')continue;
      assert.equal(f.pivot.originalColumn,i===0?229:232);
      assert.equal(f.pivot.eliminationStep,i===0?129:135);
      assert.equal(f.pivot.kind,'node');assert.equal(f.pivot.unpivotedWorkspaceMax,0);
      assert.equal(f.witness.verified,true);assert.equal(f.witness.maxResidual,0);
      assert.equal(f.witness.firstRejectedStep,f.pivot.eliminationStep);
      assert.deepEqual(f.witness.support.map((s:any)=>[s.index,s.value]),i===0?[[228,1],[229,1]]:[[231,1],[232,1]]);
      assert.deepEqual(f.diagonalSlots.map((d:any)=>d.slot),[-1,-1]);
      assert.equal(f.diagonalSlots[0].keywordAsNode,'table');assert.equal(f.diagonalSlots[1].nameContainsBrace,true);
      assert.equal(f.incidentTopology.length,1);assert.equal(f.incidentTopology[0].type,'VCCS');
      const pair=f.commonModePairs.find((p:any)=>p.supports.some((s:any)=>s.keywordAsNode==='table')&&p.supports.some((s:any)=>s.index===f.pivot.originalColumn));
      assert.ok(pair);assert.equal(pair.maxResidual,0);
    }
  }
  const a=originals.receipts[0].native.factors[1],b=originals.receipts[1].native.factors[1];
  assert.equal(a.pivot.identityHash,b.pivot.identityHash);
  assert.notEqual(a.pivot.permutationHash,b.pivot.permutationHash);
});

test('MIT reduction specifically contains the later TABLE semantic gap; not just a passive island',()=>{
  for(const r of reductions.receipts){
    const bytes=readFileSync(here+r.name);
    assert.equal(r.hashBefore,sha(bytes));assert.equal(r.hashAfter,r.hashBefore);
    assert.equal(r.reference.process.exit,0);assert.equal(r.reference.acRows,21);
    if(r.name==='table-lowered.cir'){
      assert.equal(r.native.status,'success');assert.equal(r.native.authoredControl.acRows,21);
      continue;
    }
    assert.equal(r.native.status,'failure');
    const later=r.native.factors.filter((f:any)=>f.phase==='dynamic-node-gmin');
    if(r.name==='table.cir'){
      assert.equal(r.native.factors[0].phase,'plain-newton');
      assert.equal(r.native.factors[0].pivot.originalColumn,1);
      assert.equal(r.native.factors[1].phase,'dynamic-node-gmin');
      assert.equal(r.native.factors[1].pivot.originalColumn,4);
    }
    assert.equal(later.length,9);
    for(const f of later){
      const pair=f.commonModePairs.find((p:any)=>p.supports.some((s:any)=>s.keywordAsNode==='table'));
      assert.ok(pair);assert.equal(pair.verified,true);assert.equal(pair.maxResidual,0);
      assert.equal(pair.supports.some((s:any)=>s.expressionAsNode),true);
      assert.deepEqual(pair.supports.map((s:any)=>s.diagonalSlot),[-1,-1]);
      assert.equal(pair.incident.length,1);assert.equal(pair.incident[0].type,'VCCS');
    }
  }
  assert.equal(reductions.expectedParityRed.exit,1);
  const compiled=parse(readFileSync(here+'table-isolated.cir','utf8')).compile();
  assert.ok(compiled.nodeNames.some(name=>/\.TABLE$/i.test(name)),'known loss remains: no production fix in diagnosis');
  assert.ok(compiled.nodeNames.some(name=>/[{}]/.test(name)));
});

test('vendor receipts export only redacted topology/hash metadata, not expressions/names/full matrices',()=>{
  function visit(value:any){
    if(Array.isArray(value)){value.forEach(visit);return;}
    if(value&&typeof value==='object')for(const [key,v]of Object.entries(value)){
      assert.ok(!['expression','nodeNames','branchNames','values','rowIdx','colPtr','matrix','stack','log','name'].includes(key)||key==='name'&&typeof v==='string'&&['base_159.cir','variant_159.cir'].includes(v),`forbidden field ${key}`);
      visit(v);
    }
    if(typeof value==='string'){
      assert.ok(!/XU461|\b(?:if|v|i)\s*\(/i.test(value),'expanded vendor expression/name leaked');
    }
  }
  visit(originals.receipts);
});

test('source pin, actual child-wall budget and process exits are explicit',()=>{
  assert.equal(source.revision,'a80f6e3e95d51534905b1f23410a951802666656');
  assert.match(source.versions.ngspice,/ngspice-47/);
  assert.equal(source.files['src/spicelib/analysis/cktop.c'],'9f06d3ac7b6a8aa28bdb46f1af3157362c6ca4a2ecc701a388c990ac3a07eb5e');
  for(const digest of Object.values(source.files))assert.match(digest as string,/^[a-f0-9]{64}$/);
  for(const ledger of [originals.childBudget,budget]){
    assert.ok(ledger.reduce((sum:number,r:any)=>sum+r.wallSeconds,0)<=600);
    for(const r of ledger){assert.ok(r.limitSeconds<=30);assert.ok(r.wallSeconds<=30);assert.equal(typeof r.exit,'number');}
  }

});
