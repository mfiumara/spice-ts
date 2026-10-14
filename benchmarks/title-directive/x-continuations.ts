import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simulate } from '../../packages/core/src/simulate.js';

async function main() {
  const phase = process.argv[2];
  if (phase !== 'before' && phase !== 'after') throw new Error('Expected before or after');
  const version = spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).stdout;
  if (!/ngspice-47\b/.test(version)) throw new Error('Requires ngspice-47');
  const directory = mkdtempSync(join(tmpdir(), 'title-x-continuations-'));
  const cases = [];
  try {
    for (const nested of [false, true]) {
      for (const [name, assignment] of [
        ['numeric', 'r=\n.title metadata\n+ 2k'],
        ['bare', 'r=\n.TiTlE metadata {missing}\n+ seed*2'],
        ['braced', 'r={seed\n.title metadata\n+ *2}'],
        ['quoted', "r='seed\n.title metadata\n+ *2'"],
      ]) {
        const call = `X1 in load ${assignment}`;
        const input = `Original
.param seed=1k
.subckt load a params: r=1k
R1 a 0 {r}
.ends
V1 in 0 1
${nested ? `.subckt caller in params: seed=1k\n${call}\n.ends\nXouter in caller` : call}
.op
.control
op
show all
print v(in) i(v1)
quit
.endc
.end`;
        const path = join(directory, `${nested}-${name}.cir`);
        writeFileSync(path, input);
        const reference = spawnSync('ngspice', ['-b', path], { encoding: 'utf8', timeout: 19000 });
        if (reference.status !== 0 || !/i\(v1\)\s*=\s*-5\.0+e-04/.test(reference.stdout)
          || !/resistance\s+2000/.test(reference.stdout)) {
          throw new Error(`Unexpected ngspice result: ${reference.stdout} ${reference.stderr}`);
        }
        let spiceTs;
        try {
          const result = await simulate(input);
          spiceTs = { status: 'success', currentV1: result.dc!.current('V1') };
        } catch (error) {
          spiceTs = { status: 'error', diagnostic: String(error) };
        }
        if (phase === 'before' && spiceTs.status !== 'error') throw new Error('Expected before failure');
        if (phase === 'after' && (spiceTs.status !== 'success' || Math.abs(spiceTs.currentV1! + 0.0005) > 1e-12)) {
          throw new Error(`Unexpected spice-ts result: ${JSON.stringify(spiceTs)}`);
        }
        cases.push({ name, nested, input, sha256: createHash('sha256').update(input).digest('hex'),
          ngspice: { exitCode: reference.status, stdout: reference.stdout.replaceAll(directory, '<scratch>'),
            stderr: reference.stderr.replaceAll(directory, '<scratch>') }, spiceTs });
      }
    }
    const receipt = { phase, head: spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(),
      node: process.version, ngspice: 'ngspice-47', command: `spice-heavy pnpm exec tsx benchmarks/title-directive/x-continuations.ts ${phase}`,
      policy: 'Identical bytes, original MIT semantic probes; no speed claim. Before is the uncommitted main merge, after includes the bounded scanner fix.', cases };
    writeFileSync(`benchmarks/title-directive/x-continuations-${phase}.json`, JSON.stringify(receipt, null, 2) + '\n');
    console.log(`${phase}: ${cases.length} ngspice comparisons verified`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
