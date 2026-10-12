import fs from 'node:fs';
const [,, file, ...names] = process.argv;
const p = JSON.parse(fs.readFileSync(file,'utf8'));
const byId = new Map(p.nodes.map(n=>[n.id,n]));
const parent = new Map();
for (const n of p.nodes) for (const c of n.children??[]) parent.set(c,n.id);
const dt = new Map(); // sample time per node
for (let i=0;i<p.samples.length;i++){ dt.set(p.samples[i],(dt.get(p.samples[i])??0)+(p.timeDeltas[i]??0)); }
for (const name of names){
  const agg=new Map();
  for (const n of p.nodes){ if(n.callFrame.functionName!==name) continue;
    const t=(dt.get(n.id)??0)/1000; let chain=[]; let q=parent.get(n.id);
    for(let d=0;d<3&&q!==undefined;d++){ const pn=byId.get(q); chain.push(pn.callFrame.functionName+':'+pn.callFrame.lineNumber); q=parent.get(q);}
    const k=chain.join(' < '); agg.set(k,(agg.get(k)??0)+t);}
  console.log('##',name); [...agg].sort((a,b)=>b[1]-a[1]).slice(0,8).forEach(([k,t])=>console.log(t.toFixed(1).padStart(8),'ms',k));
}
