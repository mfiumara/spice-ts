/** Original MIT self-decks plus unchanged corpus, using the existing #812 adapter.
 * Run after pnpm build: spice-heavy pnpm exec tsx benchmarks/results/issue-812-ngbehavior/verify.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const output = resolve(process.argv[2] ?? 'scratch-ngbehavior/self-check');
mkdirSync(output, { recursive: true });
const adapter = resolve('benchmarks/corpus/ngspice-bugs/refresh.ts');
const rows: unknown[] = [];
for (const mode of ['', 'ps', 'lt', 'psa', 'mc']) {
  for (const negative of [false, true]) {
    const name = `${mode || 'native'}-${negative ? 'negative' : 'positive'}`;
    const text = `Original ngbehavior check\n${mode ? `.options ngbehavior=${mode}` : ''}\nVa a 0 0\nB1 y 0 v=3+sqrt(v(a)${negative ? '-4' : '+4'})\nR1 y 0 1k\n.op\n.end\n`;
    const path = resolve(output, `${name}.cir`);
    const receipt = resolve(output, `${name}.json`);
    writeFileSync(path, text);
    const run = spawnSync(process.execPath, ['--import', 'tsx', adapter, '--child', path, receipt], { encoding: 'utf8', timeout: 60_000 });
    if (run.status !== 0) throw new Error(`${name}: ${run.stderr}`);
    const report = JSON.parse(readFileSync(receipt, 'utf8'));
    if (negative) {
      if (!report.spiceTs.error?.includes('-4 out of range for sqrt') || !report.ngspice.error?.includes('-4 out of range for sqrt')) throw new Error(`${name}: rejection mismatch`);
    } else {
      if (report.status !== 'compared') throw new Error(`${name}: comparison failed`);
      for (const signal of Object.values(report.metrics.signals) as Array<{ absoluteError: { max: number; rms: number } }>) {
        if (signal.absoluteError.max !== 0 || signal.absoluteError.rms !== 0) throw new Error(`${name}: nonzero error`);
      }
    }
    rows.push({ name, sha256: createHash('sha256').update(text).digest('hex'), report });
  }
}
writeFileSync(resolve(output, 'report.json'), JSON.stringify(rows, null, 2) + '\n');
console.log(`Verified ${rows.length} self-decks. Full reports in ${output}`);
