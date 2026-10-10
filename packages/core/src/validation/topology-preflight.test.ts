import { describe, expect, it } from 'vitest';
import { parseTitleless } from '../parser/index.js';
import { TopologyPreflightError, preflightTopology } from './topology-preflight.js';

interface TopologyCase {
  name: string;
  source: string;
  kind: TopologyPreflightError['kind'];
  involvedNodes: string[];
  sourcePaths: string[];
}

const INVALID_CASES: TopologyCase[] = [
  {
    name: 'floating connected component',
    source: 'R1 a b 1k\n.op',
    kind: 'FLOATING_COMPONENT',
    involvedNodes: ['a', 'b'],
    sourcePaths: ['/compiled/devices/R1'],
  },
  {
    name: 'nodes without a DC reference path',
    source: 'V1 in 0 1\nC1 in sense 1u\nI1 sense 0 1m\n.op',
    kind: 'NO_DC_REFERENCE',
    involvedNodes: ['sense'],
    sourcePaths: ['/compiled/devices/C1', '/compiled/devices/I1'],
  },
  {
    name: 'ideal voltage-source/inductor loop',
    source: 'V1 a 0 1\nL1 a b 1m\nV2 b 0 2\n.op',
    kind: 'IDEAL_SOURCE_LOOP',
    involvedNodes: ['0', 'a', 'b'],
    sourcePaths: ['/compiled/devices/L1', '/compiled/devices/V1', '/compiled/devices/V2'],
  },
];

describe('deterministic topology preflight', () => {
  it.each(INVALID_CASES)('detects $name', ({ source, kind, involvedNodes, sourcePaths }) => {
    const compiled = parseTitleless(source).compile();

    expect(() => preflightTopology(compiled)).toThrowError(TopologyPreflightError);
    try {
      preflightTopology(compiled);
    } catch (error) {
      expect(error).toMatchObject({ kind, involvedNodes, sourcePaths });
    }
  });

  it('accepts valid disconnected subnetworks when each has a DC reference', () => {
    const compiled = parseTitleless([
      'V1 a 0 1',
      'R1 a 0 1k',
      'V2 b 0 2',
      'R2 b 0 2k',
      '.op',
    ].join('\n')).compile();

    expect(() => preflightTopology(compiled)).not.toThrow();
  });

  it('accepts DC conductance supplied by a VCCS', () => {
    const compiled = parseTitleless('G1 a 0 a 0 1m\nI1 a 0 1m\n.op').compile();

    expect(() => preflightTopology(compiled)).not.toThrow();
  });

  it('detects ideal controlled-voltage-source output loops', () => {
    const compiled = parseTitleless('V1 a 0 1\nE1 b 0 a 0 2\nV2 b 0 2\n.op').compile();

    try {
      preflightTopology(compiled);
      throw new Error('expected topology preflight to fail');
    } catch (error) {
      expect(error).toMatchObject({
        kind: 'IDEAL_SOURCE_LOOP',
        involvedNodes: ['0', 'b'],
        sourcePaths: ['/compiled/devices/E1', '/compiled/devices/V2'],
      });
    }
  });

  it.each([
    'C1 a 0 1u\nI1 a 0 1m\n.tran 1u 10u UIC',
    'V1 a 0 1\nL1 a 0 1m\n.tran 1u 10u UIC',
  ])('does not require a DC operating point for transient UIC: %s', source => {
    const compiled = parseTitleless(source).compile();

    expect(() => preflightTopology(compiled)).not.toThrow();
  });

  it('bounds and sorts diagnostic node and source paths', () => {
    const components = Array.from({ length: 40 }, (_, index) => `R${String(index).padStart(2, '0')} n${String(index).padStart(2, '0')} shared 1k`);
    const compiled = parseTitleless([...components.reverse(), '.op'].join('\n')).compile();

    try {
      preflightTopology(compiled);
      throw new Error('expected topology preflight to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(TopologyPreflightError);
      const topologyError = error as TopologyPreflightError;
      expect(topologyError.involvedNodes).toHaveLength(32);
      expect(topologyError.sourcePaths).toHaveLength(32);
      expect(topologyError.involvedNodes).toEqual([...topologyError.involvedNodes].sort());
      expect(topologyError.sourcePaths).toEqual([...topologyError.sourcePaths].sort());
    }
  });
});
