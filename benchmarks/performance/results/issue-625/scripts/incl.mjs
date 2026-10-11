import fs from 'node:fs';
const [,, file, ...names] = process.argv;
const p = JSON.parse(fs.readFileSync(file,'utf8'));
const byId = new Map(p.nodes.map(n=>[n.id,n]));
const self = new Map();
for (let i=0;i<p.samples.length;i++) self.set(p.samples[i],(self.get(p.samples[i])??0)+(p.timeDeltas[i]??0));
const total=[...self.values()].reduce((a,b)=>a+b,0);
function incl(id){const n=byId.get(id);let t=self.get(id)??0;for(const c of n.children??[])t+=incl(c);return t;}
for (const name of names){ let t=0; const seen=(id,inside)=>{const n=byId.get(id);const hit=n.callFrame.functionName===name&&!inside; if(hit)t+=incl(id); for(const c of n.children??[]) seen(c, inside||n.callFrame.functionName===name);}; seen(p.nodes[0].id,false);
 console.log(name.padEnd(24),(t/1000).toFixed(1).padStart(8),'ms',(100*t/total).toFixed(1).padStart(5)+'%');}
console.log('total'.padEnd(24),(total/1000).toFixed(1).padStart(8),'ms');
