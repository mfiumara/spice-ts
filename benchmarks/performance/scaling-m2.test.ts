import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { M2_CIRCUITS, cmosInverterChainTran, m2Netlist, rcLadderTran, resistorMeshOp } from './scaling-m2-fixture.mjs';
import { ngspiceProbeValue, sha256, statistics } from './scaling-m2.js';

describe('issue #426 M2 scaling fixtures', () => {
  it('is deterministic: every circuit/size yields one byte-identical deck', () => {
    for (const circuit of M2_CIRCUITS) {
      for (const nodes of [1000, 10000, 50000]) {
        assert.equal(sha256(m2Netlist(circuit, nodes).netlist), sha256(m2Netlist(circuit, nodes).netlist));
      }
    }
  });

  it('emits the requested node counts (mesh rounds up to a square)', () => {
    const countNodes = (netlist: string): number => {
      const nodes = new Set<string>();
      for (const line of netlist.split('\n')) {
        if (!/^[RCVM]/i.test(line)) continue;
        const tokens = line.split(/\s+/);
        const terminals = /^M/i.test(line) ? tokens.slice(1, 5) : tokens.slice(1, 3);
        for (const node of terminals) if (node !== '0') nodes.add(node);
      }
      return nodes.size;
    };
    assert.equal(countNodes(rcLadderTran(1000).netlist), 1000);
    assert.equal(rcLadderTran(1000).actualNodes, 1000);
    assert.equal(countNodes(resistorMeshOp(1000).netlist), 1024);
    assert.equal(resistorMeshOp(1000).actualNodes, 1024);
    assert.equal(resistorMeshOp(50000).actualNodes, 224 * 224);
    assert.equal(countNodes(cmosInverterChainTran(1000).netlist), 1000);
  });

  it('keeps ngspice acct output and a printable probe in every transient deck', () => {
    for (const circuit of M2_CIRCUITS) {
      const { netlist, probe } = m2Netlist(circuit, 1000);
      assert.match(netlist, /^\.options acct$/m);
      if (/^\.tran /m.test(netlist)) assert.ok(netlist.includes(`.print tran v(${probe})`));
      assert.doesNotMatch(netlist, /klu|sparse/i, 'solver choice must stay outside the shared deck');
    }
  });

  it('parses ngspice probe values from .print tran tables and .op listings', () => {
    const tran = 'Index   time            v(n10)\n0\t0.000000e+00\t0.000000e+00\t\n119\t1.000000e-07\t1.683766e-01\t\n';
    assert.equal(ngspiceProbeValue(tran, 'n10', true), 0.1683766);
    const op = '\tn31_30                           1.9e-01\n\tn31_31                           1.821397e-01\n';
    assert.equal(ngspiceProbeValue(op, 'n31_31', false), 0.1821397);
  });

  it('reports median and nearest-rank p95', () => {
    assert.deepEqual(statistics([5, 1, 4, 2, 3, 6, 7, 8, 9, 10]), { min: 1, median: 5.5, p95: 10, max: 10 });
  });
});
