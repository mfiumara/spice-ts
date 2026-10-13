import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';
import { parse } from './index.js';

// #843: ngspice-47 inp_check_syntax (src/frontend/inpcom.c) turns a card whose
// first non-blank character is one of `=[]?()&%$"!:,\f` into a `*` comment
// and warns once per deck. Expected values are ngspice-47 -b runs of the same
// decks (Homebrew, macOS arm64).

const UNUSUAL = ['=', '[', ']', '?', '(', ')', '&', '%', '$', '"', '!', ':', ',', '\f'];
const WARNING = /^Unusual leading characters like ':' or others out of '= \[\] \? \(\) & % \$"!:,\\f' in netlist or included files, will be replaced with '\*'/;

function parseWarnings(result: { warnings: readonly { type: string; message: string }[] }): string[] {
  return result.warnings.filter(warning => warning.type === 'parse').map(warning => warning.message);
}

describe('cards with unusual leading characters are comments like ngspice-47 (#843)', () => {
  it('runs the issue #843 deck: a MicroCap label in an included library', async () => {
    // ngspice-47: warning "check line  :newmosfets", v(1) = 1.000000e+00.
    const result = await simulate(`colon label
.include lib.inc
V1 1 0 1
R1 1 0 1k
.op
.end
`, { resolveInclude: async () => '* lib\n:NewMosfets\n.model dd d\n' });
    expect(result.dc!.voltage('1')).toBeCloseTo(1, 12);
    const warnings = parseWarnings(result).filter(message => message.startsWith('Unusual leading'));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(WARNING);
    expect(warnings[0]).toContain(':NewMosfets');
    expect(warnings[0]).toContain('line 2 of lib.inc');
  });

  it('quotes the dropped card without its CRLF line ending', async () => {
    // The vendor libraries of the ngspice-bugs decks use CRLF line endings.
    const result = await simulate('t\r\nV1 1 0 1\r\n:NewMosfets\r\nR1 1 0 1k\r\n.op\r\n.end\r\n');
    expect(result.dc!.voltage('1')).toBeCloseTo(1, 12);
    const warnings = parseWarnings(result).filter(message => message.startsWith('Unusual leading'));
    expect(warnings).toEqual([expect.stringContaining("check line ':NewMosfets' (line 3)")]);
  });

  it.each(UNUSUAL.map(ch => [JSON.stringify(ch), ch]))('drops a card starting with %s', async (_label, ch) => {
    // ngspice-47 warns "like '<ch>'" for each of these and prints v(1) = 1.
    const result = await simulate(`t\nV1 1 0 1\n${ch}NewMosfets abc\nR1 1 0 1k\n.op\n.end\n`);
    expect(result.dc!.voltage('1')).toBeCloseTo(1, 12);
    const warnings = parseWarnings(result).filter(message => message.startsWith('Unusual leading'));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(`like '${ch}'`);
    expect(warnings[0]).toContain('(line 3)');
  });

  it('skips leading blanks, warns only once per deck and drops label lines inside .subckt', async () => {
    // ngspice-47: one warning ("check line  :a"), v(1) = 1.
    const result = await simulate(`t
V1 1 0 1
  :a
\t:b
.subckt s a
:lab
R9 a 0 1k
.ends
X1 1 s
.op
.end
`);
    expect(result.dc!.voltage('1')).toBeCloseTo(1, 12);
    expect(result.dc!.current('V1')).toBeCloseTo(-1e-3, 15);
    const warnings = parseWarnings(result).filter(message => message.startsWith('Unusual leading'));
    expect(warnings).toEqual([expect.stringContaining("check line ':a' (line 3)")]);
  });

  it('drops the + continuations joined to a dropped card', async () => {
    // ngspice-47: "check line  :x  r3 2 0 1k"; R3 is gone, so v(2) = 1.
    const result = await simulate(`t
V1 1 0 1
R2 1 2 1k
:x
+ R3 2 0 1k
.op
.end
`);
    expect(result.dc!.voltage('2')).toBeCloseTo(1, 9);
    expect(parseWarnings(result).filter(message => message.startsWith('Unusual leading'))).toHaveLength(1);
  });

  it('keeps leading ; and # comments silent and still rejects other leading characters', async () => {
    // ngspice-47: `;x` and `#x` are comments without a warning; `^x` and `@x`
    // are errors ("unknown device type" / "incomplete or empty netlist").
    const result = await simulate('t\nV1 1 0 1\n;x\n#x\nR1 1 0 1k\n.op\n.end\n');
    expect(result.dc!.voltage('1')).toBeCloseTo(1, 12);
    expect(parseWarnings(result).filter(message => message.startsWith('Unusual leading'))).toEqual([]);
    expect(() => parse('t\nV1 1 0 1\n^x\nR1 1 0 1k\n.op\n')).toThrow();
    expect(() => parse('t\nV1 1 0 1\n@x\nR1 1 0 1k\n.op\n')).toThrow();
  });

  it('records the warning from parse() as a structured circuit parse warning', () => {
    const circuit = parse('t\nV1 1 0 1\n:label\nR1 1 0 1k\n.op\n');
    expect(circuit.parseWarnings.filter(message => message.startsWith('Unusual leading'))).toHaveLength(1);
  });
});
