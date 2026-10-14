import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { runNativeNgspice, type ClassicCircuit } from '../corpus/classic/report.js';
import { runNgspicePacked } from '../corpus/corpus-f/outcomes.js';
import { runControlReference } from '../corpus/corpus-f/control-vectors.js';
import { unpackExecution } from '../corpus/corpus-f/packed.js';
import type { CorpusFCircuit } from '../corpus/corpus-f/ingest.js';

for (const control of [false, true]) {
  test(`native ${control ? 'control' : 'dot-card'} DC adapters attach literal outer coordinates`, async () => {
    const input = Buffer.from(`authored nested DC adapter regression\nV1 a 0 0\nV2 b 0 0\nR1 a 0 1k\nR2 b 0 1k\n${control ? '.control\ndc V1 0 1 1 V2 0 1 1\n.endc' : '.dc V1 0 1 1 V2 0 1 1'}\n.end\n`);
    const circuit = { id: 'authored', localPath: 'authored.cir', analyses: ['dc'], unmappedAnalyses: [], sha256: createHash('sha256').update(input).digest('hex') } as unknown as ClassicCircuit & CorpusFCircuit;
    const executions = control
      ? [(await runControlReference(input, circuit)).execution]
      : [await runNativeNgspice(input, circuit), unpackExecution((await runNgspicePacked(input, circuit)).execution)];
    for (const execution of executions) {
      assert.equal(execution.status, 'success', execution.error);
      const dc = execution.analyses.find(plot => plot.type === 'dc');
      assert.ok(dc);
      assert.deepEqual(dc.series.grid, [0, 1, 0, 1]);
      assert.deepEqual(dc.series.secondaryGrid, [0, 0, 1, 1]);
    }
  });
}
