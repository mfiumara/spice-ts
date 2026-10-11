import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse as parseDeck, parseTitleless as parse } from './index.js';
import { simulate, simulateStream } from '../simulate.js';
import { InvalidCircuitError } from '../errors.js';
import { createTransientSim } from '../analysis/transient-driver.js';

const deck = 'Options regression\nV1 out 0 10\nR1 out 0 1k\n.tran 0.1m 2m\n';

describe('ngspice-47 compatibility options (#494)', () => {
  it.each([
    'examples/cider/mos/charge.cir', 'examples/cider/mos/pass.cir',
    'examples/cider/serial/charge.cir', 'examples/cider/serial/pass.cir',
    'examples/digital/compare/adder_bip.cir', 'examples/digital/compare/adder_mos.cir',
    'examples/Monte_Carlo/rand_numb_test.cir', 'examples/mos/adder_mos.cir',
    'examples/plot/inv-chain-pyplot.cir', 'examples/vdmos/soa_chk.sp',
    'examples/xspice/original-examples/supply_ramping.deck', 'examples/xspice/various/ro_nand_digi.cir',
  ])('advances the unchanged issue fixture %s beyond the named options', path => {
    const input = readFileSync(new URL(`../../../../benchmarks/corpus/corpus-f/fixtures/${path}`, import.meta.url), 'utf8');
    try {
      parseDeck(input);
    } catch (error) {
      expect(String(error)).not.toMatch(/Unsupported \.options field: '(?:noinit|bypass|warn|maxwarns|ramptime|seedinfo)'/i);
    }
  });

  it.each(['noinit', 'seedinfo', 'NOINIT SEEDINFO', 'warn=1 maxwarns=6'])('accepts diagnostic-only %s', option => {
    expect(parse(`.options ${option}\n.op`).simulationOptions).toEqual({});
  });

  it.each(['warn=no', 'maxwarns=1.5', 'bypass=1.5', 'ramptime=-1', 'ramptime=NaN'])('rejects invalid %s', option => {
    expect(() => parse(`.options ${option}\n.op`)).toThrow();
  });

  it('preserves bypass and ramptime through compilation and serialization', () => {
    const circuit = parse('.options bypass=1 ramptime=1m\nV1 out 0 10\n.op');
    expect(circuit.simulationOptions).toEqual({ bypass: 1, rampTime: 0.001 });
    expect(circuit.compile().simulationOptions).toEqual(circuit.simulationOptions);
    expect(parse(circuit.toNetlist()).simulationOptions).toEqual(circuit.simulationOptions);
  });

  it('does not turn noinit into UIC or ramp ordinary independent sources', async () => {
    const result = await simulate(`${deck}.options noinit ramptime=1m\n`);
    expect(result.transient!.time.length).toBeGreaterThan(1);
    for (const value of result.transient!.voltage('out')) expect(value).toBeCloseTo(10, 10);
  });

  it('reports that the native solver does not use nonlinear bypass', async () => {
    const result = await simulate(`${deck}.options bypass=1\n`);
    expect(result.warnings).toContainEqual(expect.objectContaining({ type: 'option', message: expect.stringContaining('bypass') }));
  });

  it('does not warn when an explicit API zero overrides a bypass request', async () => {
    const result = await simulate(`${deck}.options bypass=1\n`, { bypass: 0 });
    expect(result.warnings).not.toContainEqual(expect.objectContaining({ type: 'option' }));
  });

  it.each([-1, NaN, Infinity])('rejects invalid API rampTime %s', async rampTime => {
    await expect(simulate(deck, { rampTime })).rejects.toBeInstanceOf(InvalidCircuitError);
    await expect(createTransientSim(deck, { rampTime })).rejects.toBeInstanceOf(InvalidCircuitError);
  });

  it('uses the same ramptime breakpoint in batch and streaming analyses', async () => {
    const input = `${deck}.options ramptime=0.731m\n`;
    const batch = await simulate(input);
    const times: number[] = [];
    for await (const point of simulateStream(input)) {
      if ('time' in point) times.push(point.time);
    }
    expect(times).toEqual(batch.transient!.time);
    expect(times).toContain(0.000731);
  });

  it('lands on ramptime and restores it on reset', async () => {
    const sim = await createTransientSim(`${deck}.options ramptime=0.731m\n`);
    for (let run = 0; run < 2; run++) {
      const times: number[] = [];
      while (!sim.isDone) times.push(sim.advance().time);
      expect(times).toContain(0.000731);
      sim.reset();
    }
    sim.dispose();
  });

  it('keeps the finite ramptime breakpoint in open-ended simulations', async () => {
    const sim = await createTransientSim('Open-ended\nV1 out 0 10\nR1 out 0 1k\n.op', {
      timestep: 0.0001, rampTime: 0.000731,
    });
    for (let run = 0; run < 2; run++) {
      expect(sim.advanceUntil(0.001).map(point => point.time)).toContain(0.000731);
      sim.reset();
    }
    sim.dispose();
  });

  it('lets explicit API ramptime override the deck', async () => {
    const sim = await createTransientSim(`${deck}.options ramptime=0.731m\n`, { rampTime: 0.000913 });
    const times: number[] = [];
    while (!sim.isDone) times.push(sim.advance().time);
    expect(times).toContain(0.000913);
    sim.dispose();
  });
});
