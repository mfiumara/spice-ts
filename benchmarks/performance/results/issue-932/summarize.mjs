import { readFileSync, writeFileSync } from 'node:fs';
import { summarize } from './metrics.mjs';
const rows = readFileSync(new URL('./samples.jsonl', import.meta.url), 'utf8').trim().split('\n').map(JSON.parse);
const summary = summarize(rows);
writeFileSync(new URL('./summary.json', import.meta.url), JSON.stringify(summary,null,2)+'\n');
const display = s => s.count ? `${s.median.toFixed(3)} [${s.min.toFixed(3)},${s.max.toFixed(3)}] (${s.count})` : 'no completed samples';
const lines = [JSON.stringify({statusCounts:summary.statusCounts,actualChildWallSeconds:summary.actualChildWallSeconds,isolatedBitIdenticalPairs:summary.isolatedBitIdenticalPairs,controlBitIdenticalPairs:summary.controlBitIdenticalPairs})];
for (const g of summary.groups) {
  lines.push([g.mode,g.circuit,g.size,g.variant,g.phase,`${g.completed}/${g.scheduled}`,Object.entries(g.metrics).map(([key,s]) => `${key}=${display(s)}`).join('; ')].join(' | '));
}
writeFileSync(new URL('./summary.txt', import.meta.url),lines.join('\n')+'\n');
console.log(lines.join('\n'));
