// CorpusReceipt = {inputSha256, parseSha256}; benchmark-only, no timings.
import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
(globalThis as typeof globalThis & { __parseCorpus?: (text: string, state: unknown) => void }).__parseCorpus = (text, state) => {
  const serialized = JSON.stringify(state, (_key, value) =>
    value instanceof Map ? { map: [...value] } : value instanceof Set ? { set: [...value] } : value);
  appendFileSync(process.env.PARSE_CORPUS_RECEIPT!, JSON.stringify({ inputSha256: hash(text), parseSha256: hash(serialized) }) + '\n');
};
