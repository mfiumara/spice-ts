// Sabotage run for issue #369: apply one mutation at a time to tokenizer.ts,
// run the tokenizer tests, record the result, always restore the original.
// Every mutation must make at least one test fail (exit code 1).
// Usage: node benchmarks/results/issue-369/sabotage.mjs "$PWD" <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const root = process.argv[2];
const file = `${root}/packages/core/src/parser/tokenizer.ts`;
const original = readFileSync(file, 'utf8');
const mutations = {
  'nan-scale-after-exponent-accepted': ['    if (!isNaN(val)) return val;\n', '    return val;\n'],
  'mil-treated-as-milli': ["lower === 'mil'", "lower === 'mix'"],
  'meg-treated-as-milli': ["(lower === 'meg' ? 'e6' :", "(lower === 'mex' ? 'e6' :"],
  'embedded-drops-sign': ['/^([+-]?\\d+)(meg|[tgkmunpfa])(\\d+)[a-z]*$/i', '/^[+-]?(\\d+)(meg|[tgkmunpfa])(\\d+)[a-z]*$/i'],
  'equals-whitespace-kept': ["text.includes('=') ?", 'false ?'],
  'ascii-only-whitespace': ['/[()]|[^\\s(),]+/g', '/[()]|[^ \\t\\r(),]+/g'],
  'comma-emits-token': ['/[()]|[^\\s(),]+/g', '/[(),]|[^\\s(),]+/g'],
  'no-double-slash-comment': ["const slashes = line.indexOf('//');", 'const slashes = -1;'],
  'continuation-not-merged': ["if (trimmed.startsWith('+') && pendingText !== undefined)", 'if (false)'],
  'end-case-sensitive': ["trimmed.toUpperCase() === '.END'", "trimmed === '.END'"],
  'end-length-guard-off-by-one': ['trimmed.length <= 4', 'trimmed.length < 4'],
};
const results = {};
try {
  for (const [name, [from, to]] of Object.entries(mutations)) {
    if (original.split(from).length !== 2) throw new Error(`mutation anchor not unique: ${name}`);
    writeFileSync(file, original.replace(from, () => to));
    const run = spawnSync('pnpm', ['-C', 'packages/core', 'exec', 'vitest', 'run', 'src/parser/tokenizer.test.ts'], { cwd: root, encoding: 'utf8' });
    const summary = (run.stdout + run.stderr).split('\n').find(line => /Tests\s+\d/.test(line))?.trim();
    results[name] = { exitCode: run.status, summary };
    console.log(name, run.status, summary);
  }
} finally {
  writeFileSync(file, original);
}
writeFileSync(process.argv[3], `${JSON.stringify(results, null, 2)}\n`);
