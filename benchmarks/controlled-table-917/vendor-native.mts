// SPDX-License-Identifier: MIT
// Never print vendor identifiers, expressions, error messages or model bodies.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import { simulate } from '../../packages/core/src/simulate.js';
import { ParseError, SingularMatrixError } from '../../packages/core/src/errors.js';

const deck = readFileSync(process.argv[2], 'utf8');
const paths = [...deck.matchAll(/^\s*\.include\s+"([^"]+)"/gim)].map(m => m[1]);
const started = performance.now();
let receipt: Record<string, unknown>;
try {
  const result = await simulate(deck, {
    resolveInclude: async name => {
      const path = paths.find(p => basename(p).toLowerCase() === basename(name.replaceAll('\\', '/')).toLowerCase());
      if (!path) throw new Error('Missing include');
      return readFileSync(path, 'utf8');
    },
  });
  receipt = { status: 'success', acRows: result.ac?.frequencies.length ?? null };
} catch (error) {
  receipt = {
    status: error instanceof ParseError ? 'unsupported' : 'failure',
    errorName: (error as Error).name,
    terminalPivot: error instanceof SingularMatrixError ? error.pivotIndex : null,
    tableUnsupported: error instanceof ParseError && /TABLE.*not supported/.test(error.message),
    contextHash: error instanceof ParseError ? createHash('sha256').update(error.context).digest('hex') : null,
  };
}
console.log(JSON.stringify({ ...receipt, milliseconds: performance.now() - started, factors: [] }));
