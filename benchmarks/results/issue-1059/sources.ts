import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const revision = '66d67caff2f10e4d6a36d2e59898cc52d661b98d';
const directory = resolve(here, 'licenses/xyce');
mkdirSync(directory, { recursive: true });
for (const file of ['GPL-3.0.txt', 'README.md']) {
  writeFileSync(resolve(directory, file), execFileSync('git', ['show', `${revision}:benchmarks/corpus/corpus-l/licenses/xyce/${file}`]));
}
console.log('Retained corpus-l upstream README licence grant and GPL text.');
