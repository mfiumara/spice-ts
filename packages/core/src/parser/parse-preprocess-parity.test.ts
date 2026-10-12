import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse, parseAsync, parseTitleless, parseTitlelessAsync } from './index.js';
import { ParseError } from '../errors.js';
import { simulate } from '../simulate.js';

// #510: parse() and simulate() (via parseAsync) must run the same .param
// preprocessing, so a deck simulate() accepts also parses with parse().

const corpus = resolve(__dirname, '../../../../benchmarks/corpus');
const CITED_DECKS = [
  'corpus-f/fixtures/examples/various/alterparam.sp',
  'corpus-f/fixtures/examples/memristor/memristor.sp',
  'corpus-e/fixtures/tests/d_trln.ac.ckt',
];

type Outcome = { ok: true; circuit: unknown } | { ok: false; name: string; message: string; line?: number };

function describeOutcome(run: () => unknown): Outcome {
  try {
    return { ok: true, circuit: run() };
  } catch (error) {
    const e = error as Error & { line?: number };
    return { ok: false, name: e.constructor.name, message: e.message, line: e.line };
  }
}

async function describeAsyncOutcome(run: () => Promise<unknown>): Promise<Outcome> {
  try {
    return { ok: true, circuit: await run() };
  } catch (error) {
    const e = error as Error & { line?: number };
    return { ok: false, name: e.constructor.name, message: e.message, line: e.line };
  }
}

describe('parse() runs the .param preprocessor that simulate() uses (#510)', () => {
  const issueDeck = 'test\n.param vv = 1\nR1 1 0 {vv}\nV1 1 0 1\n.op\n.end\n';

  it('parses the issue deck and substitutes the parameter', async () => {
    const circuit = parse(issueDeck);
    const result = await simulate(circuit);
    // ngspice-47 on the identical deck: v1#branch = -1.00000e+00
    expect(result.dc?.current('V1')).toBeCloseTo(-1, 12);
  });

  it('parseTitleless() also expands .param', async () => {
    const circuit = parseTitleless('.param vv = 2\nR1 1 0 {vv}\nV1 1 0 1\n.op\n');
    const result = await simulate(circuit);
    expect(result.dc?.current('V1')).toBeCloseTo(-0.5, 12);
  });

  it('builds the same circuit as parseAsync() for a .param deck', async () => {
    const deck = 'test\n.param r = 2k c = {r/2e9}\n.func half(x) = {x/2}\nR1 1 0 {half(r)}\nC1 1 0 {c}\nV1 1 0 1\n.op\n.end\n';
    expect(parse(deck)).toEqual(await parseAsync(deck));
    expect(parseTitleless(deck.slice(deck.indexOf('\n') + 1)))
      .toEqual(await parseTitlelessAsync(deck.slice(deck.indexOf('\n') + 1)));
  });

  it.each(CITED_DECKS)('agrees with parseAsync() on %s', async (deck) => {
    const text = readFileSync(resolve(corpus, deck), 'utf8');
    const sync = describeOutcome(() => parse(text));
    const async = await describeAsyncOutcome(() => parseAsync(text));
    expect(sync).toEqual(async);
    if (!sync.ok) expect(sync.message).not.toMatch(/Unsupported dot command: '\.param'/);
  });

  it.each([
    // [card, ngspice-47 v1#branch for R1 = {x} driven by 1 V]
    ['.param x = 1 + 2', -3.33333e-1],
    ['.param x = 1+2 ; trailing comment', -3.33333e-1],
    ['.param x = 1 + 2 y = 3', -1],
    ['.param x = 2 y = 3', -0.5],
  ])('evaluates %s like ngspice-47', async (card, ngspice) => {
    const circuit = parse(`test\n${card}\nR1 1 0 {x}\nV1 1 0 1\n.op\n.end\n`);
    const result = await simulate(circuit);
    expect(result.dc?.current('V1')).toBeCloseTo(ngspice, 6);
  });

  it.each(['.param x = 1 +', '.param x = 1 2', '.param x = (1'])(
    'reports invalid %s as a ParseError at its card, as ngspice-47 rejects it',
    (card) => {
      let error: unknown;
      try {
        parse(`test\n${card}\nR1 1 0 {x}\nV1 1 0 1\n.op\n.end\n`);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ParseError);
      expect((error as ParseError).line).toBe(2);
      expect((error as ParseError).context).toBe(card);
    },
  );

  it('asks for parseAsync() when the deck has .include', () => {
    expect(() => parse('test\n.include models.lib\nR1 1 0 1\n.op\n.end\n'))
      .toThrow(/\.include directive requires a resolver/);
  });
});
