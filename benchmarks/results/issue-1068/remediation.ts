import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { simulate } from '../../../packages/core/src/simulate.js';

// Usage: spice-heavy pnpm exec tsx benchmarks/results/issue-1068/remediation.ts before|after
// Identical input bytes for both engines, including control commands ignored by spice-ts.
async function main(): Promise<void> {
  const phase = process.argv[2];
  if (phase !== 'before' && phase !== 'after') throw new Error('Expected before|after');
  const rows = [];
  for (const [name, source] of [['mos6', 'vd'], ['hfet1', 'vg']]) {
    const fixture = readFileSync(new URL(`./${name}.cir`, import.meta.url), 'utf8');
    for (const option of ['1e-9', '0', 'default']) {
      const input = fixture.replace('.options gmin=1e-9\n', option === 'default' ? '' : `.options gmin=${option}\n`)
        .replace('.end', `.control\nset numdgt=17\nop\nprint i(${source})\nquit\n.endc\n.end`);
      const output = execFileSync('ngspice', ['-b'], { input, encoding: 'utf8' });
      const match = output.match(new RegExp(`i\\(${source}\\)\\s*=\\s*([-+eE.0-9]+)`));
      if (!match) throw new Error(output);
      const native = Number(match[1]);
      const own = (await simulate(input)).dc!.current(source);
      rows.push({ name, option, source, native, spiceTs: own, absoluteError: Math.abs(own - native), input, nativeOutput: output });
      console.log(JSON.stringify({ name, option, native, spiceTs: own }));
    }
  }
  writeFileSync(new URL(`./remediation-${phase}.json`, import.meta.url), JSON.stringify({
    baseline: 'b844a17c8cabc5917ca0627c6e3ba4908c85783b',
    ngspiceVersion: execFileSync('ngspice', ['--version'], { encoding: 'utf8' }), rows,
  }, null, 2) + '\n');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
