// Diagnostic ring reductions. No fixture, tolerance or phase alignment changes.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { runNgspicePacked, runBoundedSimulatePacked, MATCH_RULE } from '../../benchmarks/corpus/corpus-f/outcomes.js';
import { unpackExecution } from '../../benchmarks/corpus/corpus-f/packed.js';

async function main() {
  const original = readFileSync('evidence/996/repro/ring.cir', 'utf8');
  const manifest = JSON.parse(spawnSync('git', ['show', 'e05f5f1748bb7aaada478e9c3378ec4dfb45e17c:benchmarks/corpus/corpus-k/manifest.json'], { encoding: 'utf8' }).stdout);
  const circuit = manifest.circuits.find((c: { id: string }) => c.id === 'k-15');
  if (createHash('sha256').update(original).digest('hex') !== circuit.sha256) throw new Error('original fixture hash mismatch');
  const version = spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).stdout;
  if (!/ngspice-47\b/.test(version)) throw new Error('ngspice-47 required');
  const label = process.argv[2] ?? 'baseline';
  mkdirSync('evidence/1003/runs', { recursive: true });
  for (const stages of (process.argv[3] ?? '17,15,11,7').split(',').map(Number)) {
    let deck = original;
    if (stages !== 17) {
      deck = original.split(/^vdd/im)[0] + 'VDD 1 0 3\n';
      for (let stage = 1; stage <= stages; stage++) {
        const gate = stage + 1, drain = stage === stages ? 2 : stage + 2;
        for (const [type, rail] of [['p', 1], ['n', 0]]) deck += `M${type}${stage} ${drain} ${gate} ${rail} ${rail} ${type}enh l=1.25u w=5u ad=5p pd=6u as=5p ps=6u\n`;
      }
      deck += `C1 ${stages + 1} 0 .1p\n.ic ` + Array.from({ length: stages }, (_, i) => `v(${i + 2})=${i % 2 === 0 ? 2 : 0}`).join(' ') + '\n.tran .1ns 100ns\n.end\n';
    }
    if (label === 'baseline' && stages === 15) writeFileSync('evidence/1003/ring-15.cir', deck);
    const ng = await runNgspicePacked(Buffer.from(deck), circuit);
    const spice = await runBoundedSimulatePacked(Buffer.from(deck), { ...circuit, category: 'corpus-k', ngspice: { expectedStatus: 'pass' }, spiceTs: { expectedStatus: 'pass' } });
    const result = { stages, label, base: spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(), version, fixtureSha256: circuit.sha256, matchRule: MATCH_RULE, deck, ngspice: { ...ng, execution: unpackExecution(ng.execution) }, spiceTs: unpackExecution(spice) };
    writeFileSync(`evidence/1003/runs/${label}-${stages}.json.gz`, gzipSync(JSON.stringify(result) + '\n'));
    console.log(label, stages, ng.status, spice.status);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
