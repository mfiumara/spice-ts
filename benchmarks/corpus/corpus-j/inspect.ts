import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { staticVerdict, stripTerminalNewline } from '../corpus-h/lib.js';

const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
async function main(): Promise<void> {
const hashes = new Set<string>();
for (const corpus of await readdir('benchmarks/corpus')) {
  if (corpus === 'corpus-j') continue;
  try {
    const root = resolve('benchmarks/corpus', corpus, 'fixtures');
    for (const file of await readdir(root, { recursive: true, withFileTypes: true })) {
      if (!file.isFile()) continue;
      const bytes = await readFile(resolve(file.parentPath, file.name));
      hashes.add(hash(bytes)); hashes.add(hash(stripTerminalNewline(bytes)));
    }
  } catch { /* Some corpus directories have no fixtures. */ }
}
const checkout = process.argv[2];
const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim().split('\n');
const files = new Set(paths);
for (const path of paths.filter(path => /\.(cir|ckt|sp|net|spice)$/i.test(path))) {
  const bytes = execFileSync('git', ['show', `HEAD:${path}`], { cwd: checkout });
  const verdict = staticVerdict(bytes, path, files);
  if (hashes.has(hash(bytes)) || hashes.has(hash(stripTerminalNewline(bytes)))) continue;
  console.log(JSON.stringify({ path, sha256: hash(bytes), verdict }));
}
}
main().catch(error => { console.error(error); process.exitCode = 1; });
