// Issue #842: summarise the A/B JSONL files (median, range, paired speedup,
// distinct digests per deck) and the ngspice-47 acct logs.
//
//   node summary.mjs <ab.jsonl>... [--ng <dir>]
import { readFileSync, readdirSync } from 'node:fs';

const args = process.argv.slice(2);
const ngIndex = args.indexOf('--ng');
const ngDir = ngIndex >= 0 ? args[ngIndex + 1] : undefined;
const files = ngIndex >= 0 ? args.slice(0, ngIndex) : args;
const rows = files.flatMap(file => readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line)));
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const range = values => `${Math.min(...values).toFixed(0)}-${Math.max(...values).toFixed(0)}`;

console.log('| deck | nodes | base median (range) ms | branch median (range) ms | speedup (median of pairs, range) | ngspice-47 wall median (range) ms | n | digests |');
console.log('|---|---|---|---|---|---|---|---|');
const decks = [...new Set(rows.map(r => `${r.circuit}\t${r.nodes}`))];
for (const key of decks) {
  const [circuit, nodesText] = key.split('\t');
  const nodes = Number(nodesText);
  const pick = build => rows.filter(r => r.circuit === circuit && r.nodes === nodes && r.build === build);
  const base = pick('base');
  const branch = pick('branch');
  const ng = pick('ngspice-47');
  const pairs = base.map(b => {
    const partner = branch.find(r => r.round === b.round);
    return partner ? b.ms / partner.ms : NaN;
  }).filter(Number.isFinite);
  const digests = new Set([...base, ...branch].map(r => r.sha256));
  const cell = list => (list.length ? `${median(list.map(r => r.ms)).toFixed(0)} (${range(list.map(r => r.ms))})` : 'n/a');
  console.log(`| ${circuit} | ${nodes} | ${cell(base)} | ${cell(branch)} | ${median(pairs).toFixed(3)}x (${Math.min(...pairs).toFixed(3)}-${Math.max(...pairs).toFixed(3)}) | ${cell(ng)} | ${base.length}/${branch.length}/${ng.length} | ${digests.size === 1 ? `identical ${[...digests][0].slice(0, 12)}` : `DIFFER (${digests.size})`} |`);
}

if (ngDir) {
  console.log('\nngspice-47 `.options acct` medians (s):');
  const groups = new Map();
  for (const file of readdirSync(ngDir).filter(f => /-\d+-\d+\.(log|acct\.txt)$/.test(f))) {
    const deck = file.replace(/-\d+\.(log|acct\.txt)$/, '');
    const text = readFileSync(`${ngDir}/${file}`, 'utf8');
    const value = re => Number(re.exec(text)?.[1]);
    const group = groups.get(deck) ?? [];
    group.push({
      elapsed: value(/Total elapsed time \(seconds\) = ([\d.]+)/),
      analysis: value(/Total analysis time \(seconds\) = ([\d.]+)/),
      load: value(/Matrix load time = ([\d.]+)/),
      reorder: value(/Matrix reorder time = ([\d.]+)/),
      factor: value(/Matrix factor time = ([\d.]+)/),
      solve: value(/Matrix solve time = ([\d.]+)/),
      iterations: value(/Total iterations = (\d+)/),
      tranIterations: value(/Transient iterations = (\d+)/),
      timepoints: value(/Transient timepoints = (\d+)/),
      tranAnalysis: value(/Transient analysis time = ([\d.]+)/),
      tranLoad: value(/Transient load time = ([\d.]+)/),
      tranFactor: value(/Transient factor time = ([\d.]+)/),
      tranSolve: value(/Transient solve time = ([\d.]+)/),
      tranTrunc: value(/Transient trunc time = ([\d.]+)/),
    });
    groups.set(deck, group);
  }
  for (const [deck, group] of [...groups].sort()) {
    const summary = Object.fromEntries(Object.keys(group[0]).map(k => [k, median(group.map(g => g[k]))]));
    console.log(`  ${deck} (${group.length} runs):`, JSON.stringify(summary));
  }
}
