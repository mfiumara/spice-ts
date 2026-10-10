import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { createHash } from 'node:crypto';
import { BUCK_BOOST_FULL_NETLIST, buckBoostNetlist } from './buck-boost-fixture.mjs';
import { runBenchmark } from './buck-boost.js';

const hasNgspice = spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).status === 0;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('buck-boost resource benchmark', () => {
  it('keeps the full benchmark at 5 ms with Gear-2 declared in the shared deck', () => {
    assert.match(BUCK_BOOST_FULL_NETLIST, /^\.options method=gear$/m);
    assert.match(BUCK_BOOST_FULL_NETLIST, /^\.tran 50n 5m$/m);
    assert.equal(BUCK_BOOST_FULL_NETLIST, buckBoostNetlist('full'));
  });

  it('runs a deterministic CI-safe smoke twice with one identical netlist', { skip: !hasNgspice, timeout: 120_000 }, async () => {
    const report = await runBenchmark({ mode: 'smoke', repetitions: 2 });
    assert.equal(report.circuit.stopTimeSeconds, 50e-6);
    assert.equal(report.circuit.netlistSha256, sha256(buckBoostNetlist('smoke')));

    for (const engine of [report.engines.spiceTs, report.engines.ngspice]) {
      assert.equal(engine.runs.length, 2);
      assert.equal(engine.runs[0].netlistSha256, report.circuit.netlistSha256);
      assert.equal(engine.runs[1].netlistSha256, report.circuit.netlistSha256);
      assert.deepEqual(engine.runs[0].output, engine.runs[1].output);
      assert.equal(engine.runs[0].steps.accepted, engine.runs[1].steps.accepted);
      assert.ok(engine.runs.every(run => run.wallMs > 0 && run.peakRssMiB > 0));
    }
  });
});
