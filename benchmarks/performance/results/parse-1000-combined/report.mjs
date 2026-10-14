// Report uses every retained round, never retries or trims shared-host outliers.
import { writeFileSync } from 'node:fs';
import { matrix, corpus, rows } from './evidence.mjs';

const suffix = process.argv.includes('--refreshed') ? '-refreshed' : '';
const baseline = matrix('baseline' + suffix);
const comparison = matrix('comparison' + suffix);
const cells = rows('comparison' + suffix + '/receipts.jsonl');
const f = value => value.toFixed(3);
const stat = value => `${f(value.median)} / ${f(value.iqr)}`;
const lines = [
  '# Combined parse preparation comparison', '',
  'Ten interleaved cold rounds. Times in ms, median / IQR. No samples removed.', '',
  '| Deck | Before parse | Candidate parse | Reduction | IQR disjoint | Before cold wall | Candidate cold wall | Wall reduction | Before / native | Candidate / native |',
  '|---|---:|---:|---:|---|---:|---:|---:|---:|---:|',
];
for (const [key, modes] of Object.entries(comparison.summary)) {
  const gate = comparison.comparison[key];
  lines.push(`| ${key} | ${stat(modes.control.parse)} | ${stat(modes.candidate.parse)} | ${f(100 * gate.reduction)}% | ${gate.nonOverlappingIQR} | ${stat(modes.control.wall)} | ${stat(modes.candidate.wall)} | ${f(100 * (1 - modes.candidate.wall.median / modes.control.wall.median))}% | ${f(gate.beforeWallLoss)}x | ${f(gate.candidateWallLoss)}x |`);
}
lines.push('', `Gate met: ${comparison.thresholdMet}. Native ratios are cold TS wall including equality/output hashing divided by direct ngspice wall including raw emission, not native superiority claims.`, '',
  '## Shared-host losses and spread', '',
  'Median cold-wall losses, when present, are negative reductions in the table above. Individual rotating-round cells also lose. Paired counts below are descriptive, not a paired causal estimate.', '',
  '| Deck | Rounds with candidate cold wall slower | Before worst wall | Candidate worst wall | Worst-wall change |',
  '|---|---:|---:|---:|---:|');
for (const [key, modes] of Object.entries(comparison.summary)) {
  const [circuit, size] = [key.slice(0, key.lastIndexOf('-')), Number(key.slice(key.lastIndexOf('-') + 1))];
  const group = cells.filter(row => row.circuit === circuit && row.size === size);
  const losses = group.filter(row => row.mode === 'candidate' && row.boundaries.wall > group.find(before => before.mode === 'control' && before.round === row.round).boundaries.wall).length;
  lines.push(`| ${key} | ${losses}/10 | ${f(modes.control.wall.max)} | ${f(modes.candidate.wall.max)} | ${f(modes.candidate.wall.max - modes.control.wall.max)} ms |`);
}
lines.push('', '## Current baseline exclusive attribution', '',
  'Instrumented built copies only. Instrumentation overhead is retained, not subtracted from uninstrumented gate measurements.', '',
  '| Phase | RC10k | Mesh10k |', '|---|---:|---:|');
for (const phase of ['parse', 'preprocess', 'numparam.braceBareParameters', 'numparam.substituteStatement', 'tokenize', 'cardParse', 'assembly', 'parseResidual']) {
  lines.push(`| ${phase} | ${stat(baseline.summary['rc-ladder-tran'].instrumented[phase])} | ${stat(baseline.summary['resistor-mesh-op'].instrumented[phase])} |`);
}
lines.push('', 'Corpus equality: ' + JSON.stringify(corpus(suffix)), '');
writeFileSync(new URL('./table' + suffix + '.md', import.meta.url), lines.join('\n'));
console.log(lines.join('\n'));
