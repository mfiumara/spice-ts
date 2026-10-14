import { describe, expect, it } from 'vitest';
import { hashVectors, parseRaw, statistics, summarize, rederiveEpoch } from './rc1k-attribution-data.mjs';
import { instrument, residualTargets, targets } from './rc1k-attribution-prepare.mjs';
import { runInNewContext } from 'node:vm';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

function raw() {
  const header = Buffer.from('Title: test\nPlotname: Transient Analysis\nFlags: real\nNo. Variables: 3\nNo. Points: 2\nVariables:\n\t0\ttime\ttime\n\t1\tv(n0)\tvoltage\n\t2\ti(v1)\tcurrent\nBinary:\n');
  const values = Buffer.alloc(48);
  [0, 1, -2, 0.5, 3, -4].forEach((v, i) => values.writeDoubleLE(v, i * 8));
  return Buffer.concat([header, values]);
}

describe('RC1k offline attribution receipts', () => {
  it('reconciles the residual archive, disjoint spans, thresholds and hashes offline', () => {
    const archive = fileURLToPath(new URL('./results/rc1k-residual-969/', import.meta.url));
    type Receipt = {
      id: string; mode: string; certified: boolean; status: string;
      boundaries: Record<string, number>;
      before: { loadavg: number[] }; after: { processCount: number };
      worker: { evidence: { calls: Record<string, number>;
        output: { count: number; vectors: number; outputSha256: string };
        convergence: { transient: { newtonIterations: number } } } };
    };
    const receipts: Receipt[] = readFileSync(archive + 'receipts.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
    const saved = JSON.parse(readFileSync(archive + 'summary.json', 'utf8'));
    expect(receipts).toHaveLength(45);
    expect(new Set(receipts.map(r => r.id)).size).toBe(45);
    expect(receipts.every(r => r.certified && r.status === 'ok')).toBe(true);
    expect(readdirSync(archive).filter(n => n.endsWith('.native.json'))).toHaveLength(15);
    for (const mode of ['control', 'instrumented', 'ngspice']) {
      expect(receipts.filter(r => r.mode === mode)).toHaveLength(15);
    }
    const keys = [...new Set(Object.values(residualTargets))];
    const instrumented = receipts.filter(r => r.mode === 'instrumented');
    for (const row of instrumented) {
      const measured = keys.reduce((total, key) => total + row.boundaries[key], 0);
      expect(measured + row.boundaries.simulateResidual).toBeCloseTo(row.boundaries.simulate, 10);
      expect(row.boundaries.simulateResidual).toBeGreaterThanOrEqual(0);
      expect(Object.values(row.worker.evidence.calls).every(n => n > 0)).toBe(true);
    }
    for (const key of [...new Set(Object.entries(residualTargets).filter(([name]) => !(name in targets)).map(([, key]) => key)), 'simulateResidual']) {
      const values = instrumented.map(r => r.boundaries[key]);
      expect(saved.residual[key].milliseconds).toEqual(statistics(values));
      expect(saved.residual[key].percentOfSimulate).toEqual(statistics(instrumented.map(r => 100 * r.boundaries[key] / r.boundaries.simulate)));
      expect(saved.residual[key].observationsAtLeast20Percent).toBe(0);
    }
    for (const row of receipts) {
      expect(row.before.loadavg).toHaveLength(3);
      expect(row.after.processCount).toBeGreaterThan(0);
      expect(row.worker.evidence.output.count).toBe(120240);
      expect(row.worker.evidence.output.vectors).toBe(1002);
      if (row.mode !== 'ngspice') {
        expect(row.worker.evidence.output.outputSha256).toBe('6a650522805562c8018777ab78a344668d2fb12038fd6e4fcfd7cc3302c4e8a7');
        expect(row.worker.evidence.convergence.transient.newtonIterations).toBe(238);
      } else {
        expect(hashVectors(parseRaw(gunzipSync(readFileSync(archive + row.id + '.raw.gz'))))).toEqual(row.worker.evidence.output);
      }
    }
    for (const line of readFileSync(archive + 'SHA256SUMS', 'utf8').trim().split('\n')) {
      const [hash, name] = line.split('  ');
      expect(createHash('sha256').update(readFileSync(archive + name)).digest('hex')).toBe(hash);
    }
    const prepared = JSON.parse(readFileSync(archive + 'prepared.json', 'utf8'));
    expect(Object.values(prepared.counts).every(n => n === 1)).toBe(true);
    expect(prepared.targets).toEqual(residualTargets);
    for (const [name, hash] of Object.entries(prepared.hashes)) {
      expect(createHash('sha256').update(gunzipSync(readFileSync(archive + name + '.gz'))).digest('hex')).toBe(hash);
    }
  });
  it('supports optional residual spans without changing the default targets', () => {
    const source = 'function outer() { return inner(); } function inner() { return 7; } outer();';
    const counts = {};
    const events: string[] = [];
    const code = instrument(source, 'nested.js', counts, { outer: 'driver', inner: 'lte' });
    expect(runInNewContext(code, { __rc1k: {
      enter: (key: string) => { events.push(key); return key; },
      leave: (key: string) => events.push('leave:' + key),
    } })).toBe(7);
    expect(counts).toEqual({ outer: 1, inner: 1 });
    expect(events).toEqual(['driver', 'lte', 'leave:lte', 'leave:driver']);
    expect(instrument(source, 'nested.js', {})).toBe(source);
  });
  it('verifies every archived SHA256 and benchmark-only bundle snapshot', () => {
    const archive = fileURLToPath(new URL('./results/rc1k-cold-attribution-2026-10-14/', import.meta.url));
    for (const line of readFileSync(archive + 'SHA256SUMS', 'utf8').trim().split('\n')) {
      const [hash, name] = line.split('  ');
      expect(createHash('sha256').update(readFileSync(archive + name)).digest('hex')).toBe(hash);
    }
    const prepared = JSON.parse(readFileSync(archive + 'prepared.json', 'utf8'));
    for (const [name, hash] of Object.entries(prepared.hashes)) {
      const buffer = gunzipSync(readFileSync(archive + name + '.gz'));
      expect(createHash('sha256').update(buffer).digest('hex')).toBe(hash);
    }
    expect(Object.values(prepared.counts).every(count => count === 1)).toBe(true);
  });
  it('reconciles all 60 archived workload receipts and full-output hashes offline', () => {
    const archive = fileURLToPath(new URL('./results/rc1k-cold-attribution-2026-10-14/', import.meta.url));
    const receipts = readFileSync(archive + 'receipts.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
    expect(receipts).toHaveLength(45);
    expect(new Set(receipts.map(r => r.id)).size).toBe(45);
    expect(readdirSync(archive).filter(n => n.endsWith('.native.json'))).toHaveLength(15);
    for (const mode of ['control', 'instrumented', 'ngspice']) expect(receipts.filter(r => r.mode === mode)).toHaveLength(15);
    expect(receipts.filter(r => r.certified)).toHaveLength(44);
    expect(receipts.filter(r => r.certificationError).map(r => r.id)).toEqual(['01-control']);
    for (const receipt of receipts) {
      expect(receipt.before.processCount).toBeGreaterThan(0);
      expect(receipt.after.loadavg).toHaveLength(3);
      expect(receipt.worker.evidence.output.count).toBe(120240);
      expect(receipt.worker.evidence.output.vectors).toBe(1002);
      expect(receipt.worker.evidence.deckSha256).toBe('0944ed6b76f64f56c8e04b48919f1e12b9de19df4e5a08708c4be314fa7a91b7');
      if (receipt.mode !== 'ngspice') {
        expect(receipt.worker.evidence.output.outputSha256).toBe('6a650522805562c8018777ab78a344668d2fb12038fd6e4fcfd7cc3302c4e8a7');
        expect(receipt.worker.evidence.convergence.transient.newtonIterations).toBe(238);
      } else {
        const rawPath = archive + receipt.id + '.raw';
        const buffer = existsSync(rawPath) ? readFileSync(rawPath) : gunzipSync(readFileSync(rawPath + '.gz'));
        expect(hashVectors(parseRaw(buffer))).toEqual(receipt.worker.evidence.output);
        expect(receipt.worker.evidence.native.transientIterations).toBe(238);
      }
    }
    const computed = summarize(receipts.map(rederiveEpoch));
    const saved = JSON.parse(readFileSync(archive + 'summary.json', 'utf8'));
    for (const mode of ['control', 'instrumented', 'ngspice']) {
      for (const [key, stats] of Object.entries(computed[mode].boundaries)) expect(saved.summary[mode].boundaries[key]).toEqual(stats);
    }
  });
  it('uses the retained continuous epoch without erasing the original invalid flag', () => {
    const row = { status: 'invalid', certificationError: 'hrtime-epoch-disagreement',
      start: { continuous: 1000, monotonic: 500 }, end: { continuous: 1000.1, monotonic: 500.1 },
      worker: { firstNs: '1000020000000', doneNs: '1000090000000' }, boundaries: { wall: 100, exit: -499990 } };
    const corrected = rederiveEpoch(row);
    expect(corrected.boundaries.spawnFirstUserCode).toBeCloseTo(20);
    expect(corrected.boundaries.exit).toBeCloseTo(10);
    expect(corrected.status).toBe('invalid');
    expect(row.boundaries.exit).toBe(-499990);
    expect(() => rederiveEpoch({ ...row, end: { continuous: 1005, monotonic: 500.1 } })).toThrow();
  });
  it('AST marks preserve returns, throws, and nested brace syntax', () => {
    const counts = {};
    const events: string[] = [];
    const code = instrument('var Circuit = class { compile(fail) { const value = {x: "}"}; if (fail) throw Error("failure"); return value.x; } }; var output = new Circuit().compile(false);', 'test.js', counts);
    const context = { __rc1k: { enter: (name: string) => { events.push(name); return name; }, leave: () => events.push('leave') } };
    expect(runInNewContext(code + 'output;', context)).toBe('}');
    expect(events).toEqual(['compile', 'leave']);
    expect(counts).toEqual({ 'Circuit.compile': 1 });
    expect(() => runInNewContext(code + 'new Circuit().compile(true);', context)).toThrow('failure');
    expect(events.at(-1)).toBe('leave');
  });
  it('reports all samples with interpolated IQR and no trimming', () => {
    expect(statistics([100, 1, 3, 2, 4])).toEqual({ n: 5, min: 1, q1: 2, median: 3, q3: 4, iqr: 2, max: 100 });
  });
  it('rejects empty or corrupt timing distributions', () => {
    expect(() => statistics([])).toThrow();
    expect(() => statistics([1, NaN])).toThrow();
    expect(() => statistics([-1])).toThrow();
  });
  it('materializes every raw vector, including branch current', () => {
    const vectors = parseRaw(raw());
    expect(vectors.map(([name, values]) => [name, Array.from(values)])).toEqual([
      ['time', [0, 0.5]], ['tran-v:n0', [1, 3]], ['tran-i:V1', [-2, -4]],
    ]);
    expect(hashVectors(vectors)).toEqual(hashVectors([
      ['time', [0, 0.5]], ['tran-v:n0', [1, 3]], ['tran-i:V1', [-2, -4]],
    ]));
    expect(hashVectors(vectors).count).toBe(6);
  });
  it('hashes late values and currents, not just the probe', () => {
    const vectors = parseRaw(raw());
    const before = hashVectors(vectors).outputSha256;
    vectors[2][1][1] += 1;
    expect(hashVectors(vectors).outputSha256).not.toBe(before);
  });
  it('rejects truncated, non-real or incomplete raw output', () => {
    expect(() => parseRaw(raw().subarray(0, -1))).toThrow();
    expect(() => parseRaw(Buffer.from('Binary:\n'))).toThrow();
    expect(() => parseRaw(Buffer.from(raw().toString('latin1').replace('Flags: real', 'Flags: complex'), 'latin1'))).toThrow();
  });
  it('retains failed receipts and unavailable boundaries explicitly', () => {
    const summary = summarize([
      { mode: 'control', status: 'ok', boundaries: { wall: 10, parse: 3 } },
      { mode: 'control', status: 'failed', boundaries: { wall: 100 } },
      { mode: 'ngspice', status: 'ok', boundaries: { wall: 5, parse: null } },
    ]);
    expect(summary.control.attempted).toBe(2);
    expect(summary.control.failures).toBe(1);
    expect(summary.control.boundaries.wall.n).toBe(2);
    expect(summary.control.boundaries.parse.n).toBe(1);
    expect(summary.ngspice.boundaries.parse).toBeNull();
  });
});
