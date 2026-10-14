// EvidenceReceipt = fixed matrix verification + corpus multiset equality.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { verify } from '../../linear-10k-verify.mjs';

const base = fileURLToPath(new URL('.', import.meta.url));
export const load = name => JSON.parse(readFileSync(base + name, 'utf8'));
export const rows = name => readFileSync(base + name, 'utf8').trim().split('\n').map(JSON.parse);
export function matrix(name) {
  return verify(rows(name + '/receipts.jsonl'), load(name + '/prepared.json'), load(name + '/budget.json'));
}
export function corpus(suffix = '') {
  const control = rows('corpus-control' + suffix + '.jsonl').map(JSON.stringify).sort();
  const candidate = rows('corpus-candidate' + suffix + '.jsonl').map(JSON.stringify).sort();
  if (JSON.stringify(control) !== JSON.stringify(candidate)) throw new Error('parser corpus state drift');
  return {
    successfulParses: control.length,
    uniqueStates: new Set(control).size,
    sha256: createHash('sha256').update(control.join('\n')).digest('hex'),
  };
}
