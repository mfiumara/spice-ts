import { ParseError } from '../../errors.js';

/** One logical line of a `.control` block (continuations joined, comments stripped). */
export interface ControlSourceLine {
  /** 1-based line number of the first physical line in the caller's netlist. */
  lineNumber: number;
  /** Command text, trimmed, with `+` continuations appended. */
  text: string;
}

export interface ControlSourceBlock {
  /** Line number of the `.control` card. */
  startLine: number;
  lines: ControlSourceLine[];
}

/** A non-fatal deck-structure diagnostic found while extracting control blocks. */
export interface ControlSourceWarning {
  message: string;
  /** 1-based line number in the caller's netlist. */
  line: number;
}

export interface ExtractedControlBlocks {
  /** The netlist with every `.control` … `.endc` line blanked (line numbers preserved). */
  netlist: string;
  blocks: ControlSourceBlock[];
  /** Cards ngspice drops with a warning, such as a misplaced `.endc`. */
  warnings: ControlSourceWarning[];
}

/**
 * Cut the `.control` … `.endc` blocks out of a netlist before it is tokenized or
 * preprocessed. Control-language lines use `$name`, `{$name}` and `"..."`, which
 * the netlist tokenizer treats as comments and the `.param` preprocessor as
 * numparam expressions, so they must be read from the original text.
 *
 * Comments follow ngspice's input reader: whole-line `*` comments, and
 * end-of-line comments started by `;`, by `$` between whitespace, or by `//`
 * after whitespace (never inside double quotes).
 *
 * A `.endc` with no open `.control` is dropped with ngspice-47's
 * "misplaced .endc card" warning (src/frontend/inp.c, inp_spsource) and
 * reading continues.
 *
 * @param lineOffset - Number of lines before `netlist` in the caller's input
 * @throws {@link ParseError} for a nested or unterminated block
 */
export function extractControlBlocks(
  netlist: string,
  firstLineIsTitle: boolean,
  lineOffset = 0,
): ExtractedControlBlocks {
  const physical = netlist.split('\n');
  const blocks: ControlSourceBlock[] = [];
  const warnings: ControlSourceWarning[] = [];
  let current: ControlSourceBlock | null = null;
  let currentRaw = '';

  for (let index = 0; index < physical.length; index++) {
    if (index === 0 && firstLineIsTitle) continue;
    const raw = physical[index].replace(/\r$/, '');
    const lineNumber = index + 1 + lineOffset;
    const card = raw.trim().toLowerCase();
    const directive = /^\.(control|endc)(?=\s|$)/.exec(card)?.[1];

    if (current === null) {
      if (directive === 'endc') {
        warnings.push({ message: `misplaced .endc card (line ${lineNumber})`, line: lineNumber });
        physical[index] = '';
        continue;
      }
      if (directive !== 'control') continue;
      requireNoArguments(raw, lineNumber);
      current = { startLine: lineNumber, lines: [] };
      currentRaw = raw.trim();
      physical[index] = '';
      continue;
    }

    physical[index] = '';
    if (directive === 'control') {
      throw new ParseError("Nested '.control' blocks are not supported", lineNumber, raw.trim());
    }
    if (directive === 'endc') {
      requireNoArguments(raw, lineNumber);
      blocks.push(current);
      current = null;
      continue;
    }
    const text = stripControlComment(raw).trim();
    if (text === '' || text.startsWith('*')) continue;
    const previous = current.lines.at(-1);
    if (text.startsWith('+') && previous) {
      previous.text = `${previous.text} ${text.slice(1).trim()}`.trim();
      continue;
    }
    current.lines.push({ lineNumber, text });
  }

  if (current !== null) {
    throw new ParseError("Unterminated .control block: missing '.endc'", current.startLine, currentRaw);
  }
  return { netlist: physical.join('\n'), blocks, warnings };
}

function requireNoArguments(raw: string, lineNumber: number): void {
  const [directive, ...rest] = stripControlComment(raw).trim().split(/\s+/);
  if (rest.length > 0) {
    throw new ParseError(
      `Unsupported ${directive.toLowerCase()} arguments: '${rest.join(' ')}'`,
      lineNumber,
      raw.trim(),
    );
  }
}

/** Strip an ngspice end-of-line comment from one control-language line. */
export function stripControlComment(line: string): string {
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    const before = index === 0 || /\s/.test(line[index - 1]);
    if (character === ';') return line.slice(0, index);
    if (character === '$' && before && (index + 1 === line.length || /\s/.test(line[index + 1]))) {
      return line.slice(0, index);
    }
    if (character === '/' && line[index + 1] === '/' && before) return line.slice(0, index);
  }
  return line;
}
