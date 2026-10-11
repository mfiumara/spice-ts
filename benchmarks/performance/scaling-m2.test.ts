import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { M2_CIRCUITS, cmosInverterChainTran, m2Netlist, rcLadderTran, resistorMeshOp } from './scaling-m2-fixture.mjs';
import { ngspiceProbeValue, sha256, statistics } from './scaling-m2.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * SHA-256 of every deck published in results/scaling-m2.json (#426) and recorded in
 * benchmarks/SOURCES.md (#480): [circuit, requested nodes, emitted nodes, sha256].
 * A generator change must re-measure and update all three together.
 */
const PINNED_DECKS: Array<[string, number, number, string]> = [
  ['rc-ladder-tran', 1000, 1000, '0944ed6b76f64f56c8e04b48919f1e12b9de19df4e5a08708c4be314fa7a91b7'],
  ['rc-ladder-tran', 10000, 10000, 'eb21933fd99fcbc32276816a4f389ba216dcdddc29683551a67f606f352dfca7'],
  ['rc-ladder-tran', 50000, 50000, '2fd0c2090d17dddf80980eb3391440a3e4f99e1a77d1158360ffedc4246a7ada'],
  ['resistor-mesh-op', 1000, 1024, '6c6d5adb109cdde9ac844c3346135f4e7ffc352626b2f3c430598c0ebd9d8d40'],
  ['resistor-mesh-op', 10000, 10000, 'c88e6076daf2523437e3da014d7a3c329f679a7405f789530c5c805f447ed0dc'],
  ['resistor-mesh-op', 50000, 50176, 'f81ed198f7ba67068138846b12fe93b9ec957e6bb3a89300d2c7c50e30d47329'],
  ['cmos-inverter-chain-tran', 1000, 1000, '1a9866593c778a9fa26e23c1916c7b00b1bdb1adc2e7a246d9e3f4aa4f1ca1e1'],
  ['cmos-inverter-chain-tran', 10000, 10000, '2ce663326238609299d8628016b1211632f1474e9d40b6c39747fff964999a18'],
  ['cmos-inverter-chain-tran', 50000, 50000, 'd680f1054eb14002980a7a65eb68a5dddae8063a871050fde025e8f5080bc543'],
];

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

  it('pins every published deck hash to the generator, the receipt and benchmarks/SOURCES.md (#480)', () => {
    const report = JSON.parse(readFileSync(resolve(here, 'results/scaling-m2.json'), 'utf8')) as {
      rows: Array<{ circuit: string; requestedNodes: number; actualNodes: number; netlistSha256: string }>;
    };
    const sources = readFileSync(resolve(here, '../SOURCES.md'), 'utf8');
    const published = new Map(report.rows.map(row => [`${row.circuit}@${row.requestedNodes}`, row]));
    assert.equal(published.size, PINNED_DECKS.length);
    for (const [circuit, nodes, actualNodes, hash] of PINNED_DECKS) {
      const deck = m2Netlist(circuit, nodes);
      assert.equal(sha256(deck.netlist), hash, `${circuit} ${nodes}: generator output drifted from the pinned deck`);
      assert.equal(deck.actualNodes, actualNodes);
      const row = published.get(`${circuit}@${nodes}`);
      assert.equal(row?.netlistSha256, hash, `${circuit} ${nodes}: results/scaling-m2.json hash differs from the pin`);
      assert.equal(row?.actualNodes, actualNodes);
      const sourcesRow = new RegExp(`^\\| \`${circuit}\` \\| ${nodes} \\| ${actualNodes} \\| \`${hash}\` \\|`, 'm');
      assert.match(sources, sourcesRow, `${circuit} ${nodes}: benchmarks/SOURCES.md is missing the pinned deck row`);
    }
  });

  it('reports median and nearest-rank p95', () => {
    assert.deepEqual(statistics([5, 1, 4, 2, 3, 6, 7, 8, 9, 10]), { min: 1, median: 5.5, p95: 10, max: 10 });
  });
});
