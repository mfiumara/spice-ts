// usage: node tree.mjs <cpuprofile> <rootFn> <depth> <minMs>
import { readFileSync } from 'node:fs';
const [file, root, depthArg, minArg] = process.argv.slice(2);
const p = JSON.parse(readFileSync(file, 'utf8'));
const dt = (p.endTime - p.startTime) / p.samples.length / 1000;
const byId = new Map(p.nodes.map(n => [n.id, n]));
const self = new Map();
for (const s of p.samples) self.set(s, (self.get(s) ?? 0) + 1);
const incl = new Map();
function inc(n) { if (incl.has(n.id)) return incl.get(n.id); let t = self.get(n.id) ?? 0; for (const c of n.children ?? []) t += inc(byId.get(c)); incl.set(n.id, t); return t; }
// merge by name per level
function show(nodes, d, indent) {
  if (d < 0) return;
  const g = new Map();
  for (const n of nodes) {
    const k = n.callFrame.functionName || '(anon)';
    const e = g.get(k) ?? { t: 0, kids: [] , self: 0};
    e.t += inc(n); e.self += self.get(n.id) ?? 0; e.kids.push(...(n.children ?? []).map(c => byId.get(c)));
    g.set(k, e);
  }
  for (const [k, e] of [...g].sort((a, b) => b[1].t - a[1].t)) {
    if (e.t * dt < Number(minArg)) continue;
    console.log(`${indent}${k} ${(e.t * dt).toFixed(0)}ms (self ${(e.self * dt).toFixed(0)})`);
    show(e.kids, d - 1, indent + '  ');
  }
}
const roots = p.nodes.filter(n => n.callFrame.functionName === root);
// take outermost only
const inner = new Set(); for (const r of roots) { const st=[...(r.children??[])]; while (st.length){const c=byId.get(st.pop()); if (c.callFrame.functionName===root) inner.add(c.id); st.push(...(c.children??[]));} }
show(roots.filter(r => !inner.has(r.id)), Number(depthArg), '');
