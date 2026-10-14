// Lossless archive of one completed matrix; native headers vary by timestamp.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const out = resolve(process.argv[2]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const rows = readFileSync(join(out, 'receipts.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const rawHashes = {};
mkdirSync(join(out, 'native-payloads'), { recursive: true });
for (const row of rows.filter(row => row.mode === 'ngspice' && row.status === 'ok')) {
  const path = join(out, row.id + '.raw');
  const raw = readFileSync(path);
  const marker = raw.indexOf(Buffer.from('Binary:\n'));
  if (marker < 0) throw new Error('missing binary marker');
  const payload = raw.subarray(marker + 8);
  const payloadHash = hash(payload);
  if (payloadHash !== row.worker.evidence.output.outputSha256) throw new Error('payload drift');
  rawHashes[row.id] = hash(raw);
  writeFileSync(join(out, row.id + '.header.gz'), gzipSync(raw.subarray(0, marker + 8)));
  const payloadPath = join(out, 'native-payloads', payloadHash + '.bin.gz');
  if (!existsSync(payloadPath)) writeFileSync(payloadPath, gzipSync(payload));
  unlinkSync(path);
}
writeFileSync(join(out, 'native-raw-sha256.json'), JSON.stringify(rawHashes, null, 2) + '\n');
function compress(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) compress(path);
    else if (/\.(?:txt|cir|js)$/.test(entry.name)) {
      writeFileSync(path + '.gz', gzipSync(readFileSync(path)));
      unlinkSync(path);
    }
  }
}
compress(out);
console.log('Archived native raws and compressed text/bundles without discarding bytes.');
