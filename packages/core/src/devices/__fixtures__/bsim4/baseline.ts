// Capture unchanged-input failures without refreshing any corpus outcome file.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate } from '../../../index.js';

interface CorpusReceipt {
  fixtures: Array<{
    id: string;
    sourcePath: string;
    sha256: string;
    gapBucket: string;
    spiceTs: { status: string; firstErrorLine?: string };
    ngspice: { status: string };
  }>;
}

interface FailureReceipt {
  corpus: string;
  id: string;
  path: string;
  sha256: string;
  recordedNgspiceStatus: string;
  status: string;
  errorName: string | null;
  errorCode: unknown;
  message: string | null;
  comparedSignals: number;
  maxAbsError: null;
  rmsError: null;
}

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../../../..');
const fixtures: FailureReceipt[] = [];
for (const corpus of ['f', 'g']) {
  const directory = `benchmarks/corpus/corpus-${corpus}`;
  const recorded = JSON.parse(readFileSync(resolve(root, directory, 'outcomes.json'), 'utf8')) as CorpusReceipt;
  const selected = recorded.fixtures.filter((row) => row.gapBucket === 'model: BSIM4 (LEVEL=14/54)');
  if (selected.length !== (corpus === 'f' ? 3 : 1)) throw new Error('BSIM4 receipt inventory changed');
  for (const row of selected) {
    const sourcePath = corpus === 'g' ? row.sourcePath.replace(/^Netlists\//, '') : row.sourcePath;
    const path = `${directory}/fixtures/${sourcePath}`;
    const input = readFileSync(resolve(root, path), 'utf8');
    const sha256 = createHash('sha256').update(input).digest('hex');
    if (sha256 !== row.sha256) throw new Error(`Original bytes changed: ${path}`);
    let status = 'success';
    let errorName: string | null = null;
    let errorCode: unknown = null;
    let message: string | null = null;
    try {
      await simulate(input);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      errorName = error.name;
      errorCode = 'code' in error ? error.code : null;
      status = errorCode === 'UNSUPPORTED_MODEL_LEVEL' ? 'unsupported' : 'failed';
      message = error.message;
    }
    fixtures.push({ corpus, id: row.id, path, sha256, recordedNgspiceStatus: row.ngspice.status,
      status, errorName, errorCode, message, comparedSignals: 0, maxAbsError: null, rmsError: null });
  }
}
const output = process.argv[2] ?? resolve(here, 'baseline.json');
writeFileSync(output, JSON.stringify({ schemaVersion: 1,
  sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  command: 'pnpm exec tsx packages/core/src/devices/__fixtures__/bsim4/baseline.ts',
  note: 'Fresh spice-ts run on unchanged inputs. Native statuses are historical outcomes, not new executions. No numerical comparison exists.',
  fixtures,
}, null, 2) + '\n');
console.log(JSON.stringify(fixtures, null, 2));
