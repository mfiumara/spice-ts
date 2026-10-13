import { readFileSync } from 'node:fs';
import { parse, simulate } from '../../packages/core/src/index.js';
const [mode, path] = process.argv.slice(2);
const text = readFileSync(path, 'utf8');
try {
  const result = mode === 'parse' ? parse(text) : await simulate(text);
  console.log(JSON.stringify({ status: 'success', error: null, analyses: mode === 'parse' ? null : Object.keys(result) }));
} catch (error) {
  const e = error as Error;
  console.log(JSON.stringify({ status: /unsupported|not implemented|unknown model/i.test(e.message) ? 'unsupported' : 'failed', name: e.name, error: e.message.slice(0, 4096) }));
}
