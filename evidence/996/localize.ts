// #996 localization only. Original inputs are verified against the pinned corpus.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { runNgspicePacked, runBoundedSimulatePacked, MATCH_RULE } from '../../benchmarks/corpus/corpus-f/outcomes.js';
import { unpackExecution } from '../../benchmarks/corpus/corpus-f/packed.js';

const revision = 'e05f5f1748bb7aaada478e9c3378ec4dfb45e17c';
function object(path: string): Buffer {
  const run = spawnSync('git', ['show', `${revision}:${path}`]);
  if (run.status !== 0) throw new Error(run.stderr.toString());
  return run.stdout;
}
const manifest = JSON.parse(object('benchmarks/corpus/corpus-k/manifest.json').toString());
async function main() {
if (!/ngspice-47\b/.test(spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).stdout)) throw new Error('ngspice-47 required');
await mkdir('evidence/996/runs', { recursive: true });
for (const id of ['k-5', 'k-10', 'k-15']) {
  const circuit = manifest.circuits.find((c: { id: string }) => c.id === id);
  const bytes = object(circuit.localPath);
  if (createHash('sha256').update(bytes).digest('hex') !== circuit.sha256) throw new Error('hash mismatch');
  const original = bytes.toString();
  const variants: Record<string, string> = {
    original,
    op: original.replace(/^\.tran.*$/gim, '.op'),
    tight: original.replace(/^\.end\s*$/im, '.options reltol=1e-6 abstol=1e-15 vntol=1e-9\n.end'),
    fine: original.replace(/^(\.tran\s+)(\S+)(\s+\S+).*$/gim, (_m, a, step, stop) => `${a}${step}${stop} 0 ${Number(step.replace(/ns?$/i, 'e-9')) / 10}`),
  };
  // Explicit diagnostics, not new headline benchmark inputs or tolerance tuning.
  if (id === 'k-15') variants['no-ic-op'] = variants.op.replace(/^\.ic.*$/gim, '* diagnostic removed .ic');
  if (id === 'k-15') variants.reduced = original.split(/^vdd/im)[0] + `
VDD 1 0 3
MP1 3 2 1 1 penh l=1.25u w=5u ad=5p pd=6u as=5p ps=6u
MN1 3 2 0 0 nenh l=1.25u w=5u ad=5p pd=6u as=5p ps=6u
MP2 4 3 1 1 penh l=1.25u w=5u ad=5p pd=6u as=5p ps=6u
MN2 4 3 0 0 nenh l=1.25u w=5u ad=5p pd=6u as=5p ps=6u
MP3 2 4 1 1 penh l=1.25u w=5u ad=5p pd=6u as=5p ps=6u
MN3 2 4 0 0 nenh l=1.25u w=5u ad=5p pd=6u as=5p ps=6u
C1 2 0 .1p
.ic v(2)=2 v(3)=0 v(4)=2
.tran .1ns 100ns
.end
`;
  if (id === 'k-10') variants.reduced = original.replace(/^\.model penh[\s\S]*?(?=^\*)/im, '');
  if (id === 'k-15') for (const stages of [3, 5, 9, 13]) {
    let reduced = original.split(/^vdd/im)[0] + 'VDD 1 0 3\n';
    for (let stage = 1; stage <= stages; stage++) {
      const gate = stage + 1, drain = stage === stages ? 2 : stage + 2;
      for (const [type, rail] of [['p', 1], ['n', 0]]) reduced += `M${type}${stage} ${drain} ${gate} ${rail} ${rail} ${type}enh l=1.25u w=5u ad=5p pd=6u as=5p ps=6u\n`;
    }
    variants[`stages-${stages}`] = reduced + `C1 ${stages+1} 0 .1p\n.ic ` + Array.from({length:stages}, (_,i) => `v(${i+2})=${i%2 === 0 ? 2 : 0}`).join(' ') + '\n.tran .1ns 100ns\n.end\n';
  }
  if (id === 'k-5') {
    variants.seeded = original.replace(/^\.end\s*$/im, '.nodeset v(xi10.10)=0 v(xi20.10)=0 v(xi30.13)=0 v(xi30.15)=0 v(xi40.13)=0 v(xi40.15)=0\n.end');
    variants['latch-op'] = original.split(/^\.subckt/im)[0] + `
VDD 1 0 5
M3 13 12 0 0 nenh l=3u w=7u as=28p ad=28p ps=22u pd=22u
M4 0 13 12 0 nenh l=3u w=7u as=28p ad=28p ps=22u pd=22u
M5 13 12 1 1 penh l=3u w=7u as=28p ad=28p ps=22u pd=22u
M6 1 13 12 1 penh l=3u w=7u as=28p ad=28p ps=22u pd=22u
.op
.end
`;
  }
  for (const [variant, deck] of Object.entries(variants)) {
    if (process.argv[2] && process.argv[2] !== `${id}-${variant}`) continue;
    const ng = await runNgspicePacked(Buffer.from(deck), circuit);
    const spice = await runBoundedSimulatePacked(Buffer.from(deck), { ...circuit, analyses: variant.endsWith('op') ? ['op'] : circuit.analyses, category: 'corpus-k', ngspice: { expectedStatus: 'pass' }, spiceTs: { expectedStatus: 'pass' } });
    const result = { id, variant, revision, sha256: circuit.sha256, base: spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(), command: 'spice-heavy pnpm exec tsx evidence/996/localize.ts', matchRule: MATCH_RULE, deck, ngspice: { ...ng, execution: unpackExecution(ng.execution) }, spiceTs: unpackExecution(spice) };
    if (variant !== 'original') for (const a of result.spiceTs.analyses) {
      const reference = result.ngspice.execution.analyses.find(b => b.type === a.type);
      if (reference) a.series.signals = Object.fromEntries(Object.entries(a.series.signals).filter(([name]) => name in reference.series.signals));
    }
    await writeFile(`evidence/996/runs/${id}-${variant}.json.gz`, gzipSync(JSON.stringify(result) + '\n'));
    console.log(id, variant, ng.status, spice.status, ng.execution.analyses.map(a => `${a.type}:${a.grid.length}`), spice.analyses.map(a => `${a.type}:${a.grid.length}`));
  }
}
}
main().catch(error => { console.error(error); process.exitCode = 1; });
