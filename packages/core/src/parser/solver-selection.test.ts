import { describe, expect, it } from 'vitest';
import { ParseError } from '../errors.js';
import { parse, parseTitleless } from './index.js';
import { isNgspiceOptionField, splitXyceOptionPackage } from './xyce-option-packages.js';
import { simulate } from '../simulate.js';

const circuit = 'V1 in 0 DC 0 AC 1 PULSE(0 1 0 1n 1n 1u 2u)\nR1 in out 1k\nC1 out 0 1n';
const deck = (option: string, analysis = '.op') => `solver hints\n${circuit}\n${option}\n${analysis}\n.end`;

describe('solver-selection hints (#812)', () => {
  it.each(['klu', 'sparse'] as const)('records %s with aliases, case and multi-field cards', solver => {
    for (const directive of ['.options', '.OpTiOn']) {
      const parsed = parse(deck(`${directive} reltol=1e-4 ${solver.toUpperCase()} abstol=1e-13`));
      expect(parsed.simulationOptions).toMatchObject({ solverSelection: solver, reltol: 1e-4, abstol: 1e-13 });
      expect(parsed.parseWarnings).toEqual([]);
    }
    expect(parseTitleless(`${circuit}\n.options ${solver}`).simulationOptions).toMatchObject({ solverSelection: solver });
    expect(isNgspiceOptionField(solver)).toBe(true);
    expect(splitXyceOptionPackage(['LINSOL', solver, 'TYPE=KLU']).fields).toEqual([solver]);
    expect(parse(deck(`.options LINSOL ${solver}`)).simulationOptions).toMatchObject({ solverSelection: solver });
  });

  it('keeps the last hint across and within cards', () => {
    expect(parse(deck('.options klu sparse\n.option klu')).simulationOptions).toMatchObject({ solverSelection: 'klu' });
    expect(parse(deck('.option sparse klu\n.options sparse')).simulationOptions).toMatchObject({ solverSelection: 'sparse' });
    expect(parse(deck('')).simulationOptions).not.toHaveProperty('solverSelection');
  });

  it.each(['klu=foo', 'sparse=foo', 'klu=', 'sparse=', 'klu=1', 'sparse=0'])('rejects malformed %s with structured ParseError', field => {
    const option = `.options ${field}`;
    try {
      parse(deck(option));
      expect.fail('expected ParseError');
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
      expect(error).toMatchObject({ line: 5, context: option });
    }
  });

  it.each([
    ['ac', '.ac lin 3 100 1000'],
    ['noise', '.noise v(out) V1 lin 3 100 1000'],
    ['poleZero', '.pz in 0 out 0 vol pz'],
    ['transient', '.tran 100n 3u'],
  ] as const)('does not alter %s numerical results', async (resultKey, analysis) => {
    const baseline = await simulate(deck('', analysis));
    expect(baseline[resultKey]).toBeDefined();
    for (const solver of ['klu', 'sparse']) {
      const selected = await simulate(deck(`.options ${solver}`, analysis));
      expect(selected[resultKey]).toEqual(baseline[resultKey]);
      expect(selected.dc).toEqual(baseline.dc);
      expect(selected.warnings).toEqual(baseline.warnings);
    }
  });
});
