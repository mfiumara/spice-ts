import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse as parseDeck, parseTitleless as parse } from './index.js';
import { ParseError } from '../errors.js';
import { simulate } from '../simulate.js';

/*
 * Residual ngspice-47 `.options` fields after #494 (#612).
 *
 * NOMOD: spiceif.c if_option sets ft_nomod, read only by dotcards.c to skip
 *   com_showmod in the printed (non-terse) operating-point report. Output only.
 * XTRTOL: inp.c inp_dodeck turns every .options field into a circuit variable;
 *   cktdojob.c then uses `xtrtol` (cp_getvar CP_NUM, so truncated to int)
 *   instead of 1 as trtol when 'A' devices are present and trtol > 1.
 * SEED: accepted on main since #501 (TRNOISE/TRRANDOM); pinned here for the
 *   rand_numb_test.cir line.
 */

const fixture = (path: string): string => readFileSync(
  new URL(`../../../../benchmarks/corpus/corpus-f/fixtures/${path}`, import.meta.url), 'utf8',
);

const xspiceCards = ['v1 in 0 sin(0 1 1k)', 'r1 in out 1k', 'c1 out 0 1u', 'a1 out g gain1',
  '.model gain1 gain(gain=2)', 'rg g 0 1k'];
const xspiceDeck = (options: string): string =>
  ['xtrtol probe', ...xspiceCards, options, '.tran 0.1m 3m', '.end'].join('\n');

describe('ngspice-47 residual .options (#612)', () => {
  it('accepts output-only NOMOD without changing simulation options', () => {
    expect(parse('.options nomod\n.op').simulationOptions).toEqual({});
    expect(parse('.options NOACCT NOINIT NOMOD NOPAGE\n.op').simulationOptions).toEqual({});
  });

  it('uses XTRTOL instead of 1 as trtol when A devices are present (cktdojob.c)', () => {
    expect(parseDeck(xspiceDeck('.options xtrtol=7')).compile().simulationOptions.trtol).toBe(7);
    expect(parseDeck(xspiceDeck('.options xtrtol=3')).compile().simulationOptions.trtol).toBe(3);
    // cp_getvar(..., CP_NUM, ...) truncates a real value: 2.6 -> 2.
    expect(parseDeck(xspiceDeck('.options XTRTOL=2.6')).compile().simulationOptions.trtol).toBe(2);
    expect(parseDeck(xspiceDeck('')).compile().simulationOptions.trtol).toBe(1);
  });

  it('leaves trtol alone without A devices or when trtol is not above 1', () => {
    expect(parse('.options xtrtol=3\nV1 1 0 1\nR1 1 0 1k\n.op').compile().simulationOptions.trtol).toBeUndefined();
    expect(parseDeck(xspiceDeck('.options trtol=1 xtrtol=3')).compile().simulationOptions.trtol).toBe(1);
  });

  it('round-trips XTRTOL through toNetlist', () => {
    const circuit = parseDeck(xspiceDeck('.options xtrtol=3'));
    expect(parseDeck(circuit.toNetlist()).compile().simulationOptions.trtol).toBe(3);
  });

  it('runs the A-device transient with the XTRTOL trtol', async () => {
    const reduced = await simulate(xspiceDeck(''));
    const relaxed = await simulate(xspiceDeck('.options xtrtol=7'));
    // ngspice-47: 70 points with trtol 1, 63 with xtrtol=7 on this deck.
    expect(relaxed.transient!.time.length).toBeLessThan(reduced.transient!.time.length);
  });

  it.each(['xtrtol', 'xtrtol=0.5', 'xtrtol=0', 'xtrtol=-2', 'xtrtol=abc'])('rejects %s', option => {
    // ngspice-47 runs trtol 0 into "incomplete or empty netlist" and ignores
    // non-numeric values; neither is reproduced, so both are refused.
    expect(() => parseDeck(xspiceDeck(`.options ${option}`))).toThrow();
  });

  it('accepts seed=N (wired to the TRNOISE/TRRANDOM streams by #501) but not seed=random', () => {
    expect(parse('.options seed=55\n.op').simulationOptions).toEqual({ seed: 55 });
    expect(() => parse('.options seed=random\n.op')).toThrow(ParseError);
  });

  // simulate() stops both decks earlier (a misplaced second '.endc' in
  // ro_nand_digi.cir, agauss() in rand_numb_test.cir), so the decks' own
  // .options lines are checked directly.
  const optionLine = (path: string, pattern: RegExp): string =>
    fixture(path).split(/\r?\n/).find(line => pattern.test(line))!;

  it('accepts the unchanged .OPTIONS line of ro_nand_digi.cir', () => {
    const line = optionLine('examples/xspice/various/ro_nand_digi.cir', /^\.OPTIONS /);
    expect(line).toBe('.OPTIONS NOACCT NOINIT NOMOD NOPAGE METHOD=gear XTRTOL=7');
    const circuit = parse(`${line}\n.op`);
    expect(circuit.simulationOptions).toEqual({ integrationMethod: 'gear2' });
    expect(circuit.xspiceTrtol).toBe(7);
  });

  it('accepts the unchanged .option seed line of rand_numb_test.cir', () => {
    const line = optionLine('examples/Monte_Carlo/rand_numb_test.cir', /^\.option seed = 55/);
    expect(parse(`${line}\n.op`).simulationOptions).toEqual({ seed: 55 });
  });
});
