// SPDX-License-Identifier: MIT
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve, basename } from 'node:path';
const [entry, deck] = process.argv.slice(2);
const { simulate } = await import(pathToFileURL(resolve(entry)).href);
const includes = [...readFileSync(deck, 'utf8').matchAll(/^\s*\.include\s+"([^"]+)"/gim)].map(m => m[1]);
const start = performance.now();
try {
  const result = await simulate(readFileSync(deck, 'utf8'), { resolveInclude: async (name: string) => {
    const path = includes.find(p => basename(p).toLowerCase() === basename(name.replaceAll('\\', '/')).toLowerCase());
    if (!path) throw new Error('Missing include');
    return readFileSync(path, 'utf8');
  } });
  console.log(JSON.stringify({ status: 'success', milliseconds: performance.now()-start, dc: result.dc ? Object.fromEntries(result.dc.voltages) : null,
    ac: result.ac ? { frequencies: result.ac.frequencies, voltages: Object.fromEntries(result.ac.voltages) } : null }));
} catch (error) {
  console.log(JSON.stringify({ status: 'failure', milliseconds: performance.now()-start,
    error: (error as Error).message.replace(/\(nodes: XU461.*$/, '(nodes: <expanded behavioral node redacted>)'), maxError: null, rmsError: null }));
}
