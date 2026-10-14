import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { staticVerdict, stripTerminalNewline, DECK_EXTENSIONS } from '../corpus-h/lib.js';

async function main() {
const root = 'benchmarks/corpus/corpus-k';
const source = process.argv[2] ?? 'current';
const checkout = `${root}/.upstream-${source}`;
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim();
const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', revision], { cwd: checkout, encoding: 'utf8' }).trim().split('\n');
const existing = new Set<string>();
for (const corpus of await readdir('benchmarks/corpus')) {
  if (corpus === 'corpus-k') continue;
  let files;
  try { files = await readdir(`benchmarks/corpus/${corpus}/fixtures`, { recursive: true, withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
  for (const file of files.filter(f => f.isFile())) {
    const bytes = await readFile(resolve(file.parentPath, file.name));
    existing.add(hash(bytes)); existing.add(hash(stripTerminalNewline(bytes)));
  }
}
const candidates = [];
for (const path of paths.filter(p => p.startsWith(source === 'xyce' ? 'Netlists/' : 'examples/') && DECK_EXTENSIONS.test(p))) {
  const bytes = execFileSync('git', ['show', `${revision}:${path}`], { cwd: checkout, maxBuffer: 64 * 1024 * 1024 });
  const verdict = staticVerdict(bytes, path, new Set(paths));
  const reason = existing.has(hash(bytes)) || existing.has(hash(stripTerminalNewline(bytes))) ? 'already-in-corpus' : verdict.reason;
  candidates.push({ path, sha256: hash(bytes), bytes: bytes.length, reason, verdict });
}
await writeFile(`${root}/survey-${source}.json`, `{\n  "revision": ${JSON.stringify(revision)},\n  "candidates": [\n${candidates.map(c => '    ' + JSON.stringify(c)).join(',\n')}\n  ]\n}\n`);
console.log(JSON.stringify(candidates.filter(c => c.reason === null), null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
