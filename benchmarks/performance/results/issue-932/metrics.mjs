// Offline receipt schema: child rows contain independently completed cold/warm phases.
import assert from 'node:assert/strict';

export function validate(rows) {
  assert.equal(rows.length, 72, 'fixed 72-child plan');
  const keys = new Set();
  let wall = 0;
  for (const row of rows) {
    const key = [row.mode,row.circuit,row.size,row.repeat,row.variant].join('/');
    assert(!keys.has(key), 'duplicate child'); keys.add(key);
    assert(['isolate','simulate'].includes(row.mode));
    assert([1000,10000,50000].includes(row.size));
    assert([0,1,2].includes(row.repeat));
    assert(['ok','timeout','failed','budget-skipped'].includes(row.status));
    assert(row.childWallMs >= 0 && row.childWallMs <= 46000, 'deadline plus measured cleanup overhead');
    wall += row.childWallMs;
    if (row.pid) {
      assert(Number.isInteger(row.pid) && row.pid > 0);
      assert.equal(row.processGroupGone, true);
    }
    if (row.status === 'ok') { assert.equal(row.exit, 0); assert.equal(row.phases.length, 2); }
    if (row.status === 'timeout') assert.equal(row.exit, -9);
    const phases = new Set();
    for (const p of row.phases) {
      assert(['cold','warm'].includes(p.phase)); assert(!phases.has(p.phase)); phases.add(p.phase);
      if (p.phase === 'warm') assert(phases.has('cold'));
      if (row.mode === 'isolate') {
        assert.equal(p.numericFactorizations, 1); assert.equal(p.pivotReuseFactorizations, 0);
        assert(p.finalUCapacity > p.initialUCapacity && p.usedU > p.initialUCapacity, 'dynamic U growth');
        for (const name of ['factorMs','solveMs']) assert(Number.isFinite(p[name]) && p[name] >= 0);
        if (row.variant === 'diagnostic') {
          const r = p.regions; assert(r);
          assert.equal(r.calls, p.supernodalUpdates);
          for (const name of ['touchesMs','triangularMs','rowsMs','touchesCpuUs','triangularCpuUs','rowsCpuUs']) assert(Number.isFinite(r[name]) && r[name] >= 0, name);
          assert(r.touchesMs + r.triangularMs + r.rowsMs <= p.factorMs, 'wall boundary');
          assert(r.touchesCpuUs + r.triangularCpuUs + r.rowsCpuUs <= p.factorCpu.user + p.factorCpu.system, 'CPU boundary');
        } else assert.equal(p.regions, null);
      } else {
        assert(Number.isFinite(p.simulateMs) && p.simulateMs >= 0);
        assert(p.vectors > 0 && p.values >= p.vectors);
      }
    }
  }
  assert(wall <= 900000, 'actual cumulative child wall budget');
  for (const mode of ['isolate','simulate']) for (const size of [1000,10000,50000]) for (const repeat of [0,1,2]) {
    const circuits = mode === 'isolate' ? ['resistor-mesh-op'] : ['rc-ladder-tran','resistor-mesh-op','cmos-inverter-chain-tran'];
    const variants = mode === 'isolate' ? ['baseline','diagnostic'] : ['baseline','control'];
    for (const circuit of circuits) for (const variant of variants) assert(keys.has([mode,circuit,size,repeat,variant].join('/')), 'complete fixed plan');
  }
  for (const row of rows.filter(r => r.variant === 'baseline')) {
    const other = rows.find(r => r.mode === row.mode && r.circuit === row.circuit && r.size === row.size && r.repeat === row.repeat && r.variant !== 'baseline');
    assert(other, 'paired child');
    for (const p of row.phases) {
      const q = other.phases.find(v => v.phase === p.phase); if (!q) continue;
      const fields = row.mode === 'isolate' ? ['factorSha256','solutionSha256','matrixSha256','rhsSha256','factorNonzeros','supernodalUpdates','initialUCapacity','finalUCapacity','usedU'] : ['outputSha256','deckSha256','vectors','values','actualNodes'];
      for (const field of fields) assert.equal(p[field],q[field],field);
      if (row.mode === 'simulate') assert.deepEqual(p.convergence,q.convergence);
    }
  }
}

const stats = values => {
  const sorted = values.toSorted((a,b) => a-b), n = sorted.length;
  return { count:n, median:n ? (sorted[Math.floor((n-1)/2)] + sorted[Math.floor(n/2)]) / 2 : null, min:n ? sorted[0] : null, max:n ? sorted[n-1] : null };
};
export function summarize(rows) {
  validate(rows);
  const groups = [];
  for (const row of rows) for (const phase of ['cold','warm']) {
    let group = groups.find(g => g.mode === row.mode && g.circuit === row.circuit && g.size === row.size && g.variant === row.variant && g.phase === phase);
    if (!group) { group = {mode:row.mode,circuit:row.circuit,size:row.size,variant:row.variant,phase,scheduled:0,completed:0,samples:[],metrics:{}}; groups.push(group); }
    group.scheduled++;
    const p = row.phases.find(p => p.phase === phase);
    if (p) { group.samples.push(p); group.completed++; }
  }
  for (const g of groups) {
    const names = g.mode === 'isolate' ? ['factorMs','solveMs'] : ['simulateMs'];
    for (const name of names) g.metrics[name] = stats(g.samples.map(p => p[name]));
    g.metrics.peakRssMiB = stats(g.samples.map(p => p.endMemory.peakRssMiB));
    if (g.mode === 'isolate') g.metrics.factorCpuMs = stats(g.samples.map(p => (p.factorCpu.user + p.factorCpu.system) / 1000));
    if (g.variant === 'diagnostic') for (const section of ['touches','triangular','rows']) {
      g.metrics[section+'Ms'] = stats(g.samples.map(p => p.regions[section+'Ms']));
      g.metrics[section+'CpuMs'] = stats(g.samples.map(p => p.regions[section+'CpuUs'] / 1000));
    }
    delete g.samples;
  }
  let isolatedBitIdenticalPairs = 0, controlBitIdenticalPairs = 0;
  for (const r of rows.filter(r => r.variant === 'baseline')) {
    const other = rows.find(q => q.mode === r.mode && q.circuit === r.circuit && q.size === r.size && q.repeat === r.repeat && q.variant !== 'baseline');
    for (const p of r.phases) if (other.phases.some(q => q.phase === p.phase)) {
      if (r.mode === 'isolate') isolatedBitIdenticalPairs++; else controlBitIdenticalPairs++;
    }
  }
  return { statusCounts:Object.fromEntries(['ok','timeout','failed','budget-skipped'].map(s => [s,rows.filter(r => r.status === s).length])), actualChildWallSeconds:rows.reduce((s,r) => s+r.childWallMs,0)/1000, isolatedBitIdenticalPairs, controlBitIdenticalPairs, groups };
}
