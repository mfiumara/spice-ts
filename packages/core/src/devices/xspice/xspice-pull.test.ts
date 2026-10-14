import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { simulate } from '../../simulate.js';
import { parseXspiceInstance, parseXspiceModelCard } from '../../parser/xspice-parser.js';
import { buildXspiceEventNetwork, prepareXspiceInstance } from './compile.js';
import { PULL_DECKS } from './xspice-pull.fixtures.js';

describe('XSPICE resistive pull models (#812)', () => {
  it('accumulates default and custom LOAD only at INIT, including resets and backup', () => {
    const prepared = [
      ['a1 d pd', '.model pd d_pulldown'],
      ['a2 d pu', '.model pu d_pullup (load=7p)'],
    ].map(([instance, model]) => prepareXspiceInstance(
      parseXspiceInstance(instance, 1), parseXspiceModelCard(model, 2), false, '0',
    ));
    expect(prepared[0].params.get('load')).toEqual([1e-12]);
    expect(prepared[1].params.get('load')).toEqual([7e-12]);
    const { network } = buildXspiceEventNetwork(prepared)!;
    for (let run = 0; run < 2; run++) {
      network.operatingPoint(() => {});
      expect(network.nodeLoads().get('d')).toBeCloseTo(8e-12, 24);
      network.beginTransient(() => {}, 0);
      network.processEvents(1e-9, 0);
      network.backup(0);
      network.acceptStep(1e-9, true);
      network.resetTransient();
      expect(network.nodeLoads().get('d')).toBeCloseTo(8e-12, 24);
    }
  });
  it('drives ZERO with RESISTIVE strength with no inputs', async () => {
    const result = (await simulate(PULL_DECKS.down)).transient!;
    expect(result.digital('d')).toEqual([{ time: 0, state: '0', strength: 'r' }]);
  });

  it('loses to opposing STRONG drivers in either direction', async () => {
    const result = (await simulate(PULL_DECKS.strong)).transient!;
    expect(result.digital('d')).toEqual([{ time: 0, state: '1', strength: 's' }]);
    expect(result.digital('u')).toEqual([{ time: 0, state: '0', strength: 's' }]);
  });

  it('holds a dac_bridge at out_high throughout transient and operating point', async () => {
    const result = await simulate(PULL_DECKS.dac);
    expect(result.transient!.digital('d')).toEqual([{ time: 0, state: '1', strength: 'r' }]);
    for (const value of result.transient!.voltage('out')) expect(value).toBeCloseTo(3.3, 12);
    expect((await simulate(PULL_DECKS.dac.replace('.tran 1n 10n', '.op'))).dc!.voltage('out')).toBeCloseTo(3.3, 12);
  });

  it('resolves equal-strength conflict to U and preserves strength on inversion', async () => {
    const result = (await simulate(PULL_DECKS.conflict)).transient!;
    expect(result.digital('d')).toEqual([{ time: 0, state: 'U', strength: 'r' }]);
    expect(result.digital('inv')).toEqual([{ time: 0, state: '1', strength: 'r' }]);
  });

  it('runs both hash-pinned unchanged ticket 398 variants', async () => {
    for (const [file, hash] of [
      ['original.cir', '55ff9242f460e0b2967fc9a45c4a9057fdfe1988227d1e6d17746e2858065000'],
      ['original_cards.cir', '90ece1a650bf263896f8ea0307bd674c8038d08877b0f00912b737419e10089f'],
    ]) {
      const bytes = readFileSync(new URL(`../../../../../benchmarks/corpus/ngspice-bugs/tickets/398/${file}`, import.meta.url));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash);
      const result = (await simulate(bytes.toString('utf8'))).transient!;
      expect(result.digital('zero')).toEqual([{ time: 0, state: '0', strength: 'r' }]);
      expect(result.digital('up')).toEqual([{ time: 0, state: '1', strength: 'r' }]);
      expect(result.time.length).toBe(59);
      for (const value of result.voltage('vss')) expect(value).toBeCloseTo(3.3, 12);
    }
  });
});
