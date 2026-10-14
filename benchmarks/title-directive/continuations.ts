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
const decks = {
  resistor: `Original
V1 in 0 1
R1 in 0
.title replacement {not_a_parameter}
+ 1k
.title another replacement
+ m=2
.op
.control
op
print v(in) i(v1)
quit
.endc
.end`,
  undefinedParameter: `Original
.title replacement
+ continued {missing}
V1 in 0 1
R1 in 0 1k
.op
.control
op
print v(in) i(v1)
quit
.endc
.end`,
};
const directory = mkdtempSync(join(tmpdir(), 'title-continuations-'));
const cases = [];
try {
  for (const [name, input] of Object.entries(decks)) {
    const path = join(directory, `${name}.cir`);
    writeFileSync(path, input);
    const reference = spawnSync('ngspice', ['-b', path], { encoding: 'utf8', timeout: 19000 });
    let spiceTs;
    try {
      const result = await simulate(input);
      spiceTs = { status: 'success', currentV1: result.dc!.current('V1') };
    } catch (error) {
      spiceTs = { status: 'error', diagnostic: String(error) };
    }
    if (name === 'resistor') {
      if (reference.status !== 0 || !/i\(v1\)\s*=\s*-2\.0+e-03/.test(reference.stdout)) {
        throw new Error(`Unexpected ngspice resistor result: ${reference.stdout} ${reference.stderr}`);
      }
      if (phase === 'after' && (spiceTs.status !== 'success' || Math.abs(spiceTs.currentV1! + 0.002) > 1e-12)) {
        throw new Error(`Unexpected spice-ts resistor result: ${JSON.stringify(spiceTs)}`);
      }
      if (phase === 'before' && spiceTs.status !== 'error') throw new Error('Expected before input loss');
    } else {
      if (reference.status !== 1 || !/Undefined parameter \[missing\]/i.test(reference.stderr)) {
        throw new Error(`Unexpected ngspice parameter result: ${reference.stdout} ${reference.stderr}`);
      }
      if (spiceTs.status !== (phase === 'before' ? 'success' : 'error')) throw new Error('Unexpected parameter behavior');
    }
    cases.push({ name, input, sha256: createHash('sha256').update(input).digest('hex'),
      ngspice: { exitCode: reference.status, stdout: reference.stdout.replaceAll(directory, '<scratch>'),
        stderr: reference.stderr.replaceAll(directory, '<scratch>') }, spiceTs });
  }
  const receipt = { phase, head: spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(),
    node: process.version, ngspice: 'ngspice-47', command: `spice-heavy pnpm exec tsx benchmarks/title-directive/continuations.ts ${phase}`,
    policy: 'Identical input bytes for both engines; synthetic regression, not a speed claim', cases };
  writeFileSync(`benchmarks/title-directive/continuations-${phase}.json`, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
}
main().catch(error => { console.error(error); process.exitCode = 1; });
