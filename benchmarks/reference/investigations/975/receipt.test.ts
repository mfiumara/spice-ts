import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { alignAndMeasure } from '../../../comparison-harness.js';
const dir='benchmarks/reference/investigations/975';
const ac=JSON.parse(readFileSync(`${dir}/ac.json`,'utf8'));
const op=JSON.parse(readFileSync(`${dir}/baseline-op.json`,'utf8'));
const adm=JSON.parse(readFileSync(`${dir}/admittance.json`,'utf8'));
test('saved canonical and AC projection bytes match the mutual-948 manifest',()=>{
  for(const [p,h] of [[ac.hashes.canonicalPath,ac.hashes.canonicalSha256], ...ac.hashes.projections.slice(0,1).flatMap((p:any)=>[[p.sharedInputPath,p.sharedInputSha256],[p.xyceInputPath,p.xyceInputSha256]])]) {
    assert.equal(createHash('sha256').update(readFileSync(p)).digest('hex'),h);
  }
  assert.equal(ac.baseline.sha256,ac.hashes.projections[0].sharedInputSha256);
});
test('three engine comparisons can be recomputed from the saved complex AC samples',()=>{
  for(const [name,row] of Object.entries(ac) as [string,any][]) {
    if(name==='hashes') continue;
    for(const [pair,a,b] of [['ts-ng','ts','ng'],['ng-xy','ng','xy'],['ts-xy','ts','xy']]) {
      if(!row[a]||!row[b]) continue;
      assert.equal(row[a].status,'success'); assert.equal(row[b].status,'success');
      assert.deepEqual(alignAndMeasure(row[a].series,row[b].series,Object.keys(row[a].series.signals)),row.metrics[pair]);
    }
  }
});
test('native Xyce reports VAF=0 for bare VA 50, and 50 for explicit assignment',()=>{
  for(const [name,value] of [['baseline',0],['explicit-vaf',50]] as const) {
    const [header,data]=readFileSync(`${dir}/${name}-xy-op.csv`,'utf8').trim().split('\n').map(s=>s.split(','));
    assert.equal(Number(data[header.indexOf('{QNL:VAF}')]),value);
  }
  assert.deepEqual(ac['explicit-vaf'].metrics['ng-xy'],ac['va-equals'].metrics['ng-xy']);
  assert.deepEqual(ac.baseline.metrics['ng-xy'],ac['vaf-space'].metrics['ng-xy']);
});
test('all eleven BJTs have separate three-engine OP and matched-OP admittance rows',()=>{
  assert.equal(op.ts.length,11);
  assert.equal(adm.table.length,66);
  for(let index=1;index<=11;index++) {
    const rows=adm.table.filter((r:any)=>r.q===`q${index}`);
    assert.deepEqual(rows.map((r:any)=>r.engine),['ng','xy','ts','matched-ng','matched-xy','matched-ts']);
    for(const r of rows) for(const k of ['vbe','vce','gm','gpi','go','Cpi','Cmu']) assert.ok(Number.isFinite(r[k]));
    const ng=rows.find((r:any)=>r.engine==='matched-ng'), ts=rows.find((r:any)=>r.engine==='matched-ts');
    for(const k of ['gm','gpi','go','Cpi','Cmu']) assert.ok(Math.abs(ts[k]-ng[k])<1e-9*Math.abs(ng[k]),`${index} ${k}`);
  }
});
