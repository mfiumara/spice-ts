// Cold parse-only receipt. Full wall/output identity comes from worker.mjs.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [directory, mode, size] = process.argv.slice(2);
const totals = {}, calls = {}, stack = [];
globalThis.__rc1k = {
  enter(key) { const span = { key, start: process.hrtime.bigint(), children: 0n }; stack.push(span); return span; },
  leave(span) {
    const elapsed = process.hrtime.bigint() - span.start;
    if (stack.pop() !== span) throw new Error('unbalanced instrumentation');
    totals[span.key] = (totals[span.key] ?? 0) + Number(elapsed - span.children) / 1e6;
    calls[span.key] = (calls[span.key] ?? 0) + 1;
    if (stack.length) stack.at(-1).children += elapsed;
  },
};
const core = await import(pathToFileURL(resolve(directory, mode, 'index.js')).href);
const text = readFileSync(join(directory, `cmos-inverter-chain-tran-${size}.cir`), 'utf8');
const start = process.hrtime.bigint();
const circuit = await core.parseAsync(text);
const parse = Number(process.hrtime.bigint() - start) / 1e6;
const parseSha256 = createHash('sha256').update(JSON.stringify(circuit, (_key, value) =>
  value instanceof Map ? { map: [...value] } : value instanceof Set ? { set: [...value] } : value)).digest('hex');
console.log(JSON.stringify({ parseOnly: true, parse, parseSha256, deckSha256: createHash('sha256').update(text).digest('hex'), totals, calls }));
