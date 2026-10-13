import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readdirSync } from 'node:fs';
const root = resolve('.');
// Optional core entry lets the same fixture runner measure a baseline worktree.
const corePath = process.argv[2] ?? 'packages/core/src/index.ts';
const { simulate } = await import(pathToFileURL(resolve(corePath)).href);
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(resolve(directory, entry.name)) : [resolve(directory, entry.name)]);
}
const receipts = [];
for (const [ticket, names] of [[784, ['base_159.cir', 'variant_159.cir']], [738, ['OP1177ARM_OPA818.cir']]] as const) {
  const dir = resolve(`benchmarks/corpus/ngspice-bugs/fetched/${ticket}/extracted`);
  const paths = files(dir);
  const resolver = async (name: string) => {
    const path = paths.find(path => basename(path).toLowerCase() === basename(name.replaceAll('\\', '/')).toLowerCase());
    if (!path) throw new Error(`Missing include ${name}`);
    return readFile(path, 'utf8');
  };
  for (const name of names) {
    const raw = await readFile(resolve(dir, name), 'utf8');
    const sourceHash = createHash('sha256').update(raw).digest('hex');
    // Only include path relocation; pass this identical local deck to both engines.
    const local = raw.replace(/"D:\/spice_lib\/([^"\r\n]+)"/gi, (_match, suffix: string) => {
      const path = paths.find(path => path.toLowerCase().endsWith(`/spice_lib/${suffix.toLowerCase()}`));
      if (!path) throw new Error(`Missing ngspice include ${suffix}`);
      return `"${path}"`;
    });
    const runDir = resolve('.receipt-882/ngspice', String(ticket));
    await mkdir(runDir, { recursive: true });
    await writeFile(resolve(runDir, name), local);
    const start = performance.now();
    try {
      const result = await simulate(local, { resolveInclude: resolver });
      receipts.push({ ticket, name, sourceHash, localHash: createHash('sha256').update(local).digest('hex'), status: 'success', milliseconds: performance.now() - start, analyses: Object.keys(result) });
    } catch (error) {
      receipts.push({ ticket, name, sourceHash, localHash: createHash('sha256').update(local).digest('hex'), status: 'unsupported', milliseconds: performance.now() - start, error: (error as Error).message, maxError: null, rmsError: null });
    }
  }
}
console.log(JSON.stringify({ engine: corePath, root, receipts }, null, 2));
