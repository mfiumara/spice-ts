// Summarise the #830 A/B JSONL and ngspice-47 acct logs.
import { readFileSync, readdirSync } from 'node:fs';
const T = process.env.TMPDIR ?? '/tmp';
const rows = readFileSync(`${T}/830-ab.jsonl`, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const median = v => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
for (const n of [10000, 50000]) {
  const by = b => rows.filter(r => r.nodes === n && r.build === b).map(r => r.ms);
  const base = by('base'), branch = by('branch'), ng = by('ngspice-47');
  const pairs = base.map((b, i) => b / branch[i]).filter(Number.isFinite);
  const hashes = new Set(rows.filter(r => r.nodes === n && r.sha256).map(r => r.sha256));
  console.log(`${n}: base med ${median(base).toFixed(0)} [${base.join(', ')}]; branch med ${median(branch).toFixed(0)} [${branch.join(', ')}]; speedup med ${median(base) / median(branch)} pairs ${pairs.map(p => p.toFixed(2)).join(' ')}; ngspice med ${median(ng).toFixed(0)} [${ng.join(', ')}]; distinct hashes ${hashes.size}`);
  const acct = { total: [], analysis: [], load: [], reorder: [], factor: [], solve: [], iters: [] };
  for (const f of readdirSync(`${T}/830-ng`).filter(f => f.startsWith(`out-${n}-`))) {
    const t = readFileSync(`${T}/830-ng/${f}`, 'utf8');
    const g = re => Number(re.exec(t)?.[1]);
    acct.total.push(g(/Total elapsed time \(seconds\) = ([\d.]+)/));
    acct.analysis.push(g(/Total analysis time \(seconds\) = ([\d.]+)/));
    acct.load.push(g(/Matrix load time = ([\d.]+)/));
    acct.reorder.push(g(/Matrix reorder time = ([\d.]+)/));
    acct.factor.push(g(/Matrix factor time = ([\d.]+)/));
    acct.solve.push(g(/Matrix solve time = ([\d.]+)/));
    acct.iters.push(g(/Total iterations = (\d+)/));
  }
  console.log('  ngspice acct medians (s):', Object.fromEntries(Object.entries(acct).map(([k, v]) => [k, median(v)])), 'samples', acct.total.length);
}
