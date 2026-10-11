import { evaluateExpression } from './expression.js';
import { substituteBehavioralParameters } from './behavioral-expression.js';
import { parseNumber } from './tokenizer.js';
import { CycleError, ParseError } from '../errors.js';
import type { IncludeResolver } from '../types.js';
import type { ProtocolExecutionGuard } from '../protocol/execution-guard.js';

const MAX_DEPTH = 64;

/**
 * Preprocess a SPICE netlist: resolve `.include`/`.lib` directives,
 * evaluate `.param` definitions, and substitute `{expression}` tokens.
 *
 * This is called internally by {@link parseAsync} but can be used
 * standalone when you need the fully-expanded netlist text.
 *
 * @param netlist - Raw SPICE netlist text
 * @param resolver - Async function that returns file contents given a path;
 *   required if the netlist contains `.include` or `.lib` directives
 * @returns The preprocessed netlist with all includes inlined and expressions evaluated
 * @throws {@link ParseError} if include depth exceeds 64, resolver is missing,
 *   or a `{expression}` references an undefined or circular `.param`
 * @throws {@link CycleError} if includes form a circular dependency
 */
export async function preprocess(
  netlist: string,
  resolver?: IncludeResolver,
  guard?: ProtocolExecutionGuard,
): Promise<string> {
  return preprocessLines(netlist, resolver, guard, 0);
}

/**
 * @internal Preprocess a netlist fragment that starts `lineOffset` lines into the
 * original netlist (e.g. the body after a title line), so ParseError line
 * numbers refer to the caller's netlist.
 */
export async function preprocessLines(
  netlist: string,
  resolver: IncludeResolver | undefined,
  guard: ProtocolExecutionGuard | undefined,
  lineOffset: number,
): Promise<string> {
  const definitions = new Map<string, ParamDefinition>();
  const statements: PendingStatement[] = [];
  await collectStatements(netlist, resolver, new Set(), [], 0, definitions, statements, guard, lineOffset);
  // ngspice collects every top-level `.param` before substituting, so a
  // parameter may be used before its definition and the last definition wins.
  const temperatureSweep = statements.find(isTemperatureSweep);
  const scopes = createParamScopes(definitions, temperatureSweep, circuitTemperature(statements));
  return statements.map(statement => statement.substitute
    ? substituteStatement(statement, scopes)
    : statement.text).join('\n');
}

interface ParamDefinition {
  expression: string;
  line: number;
  context: string;
  /** A `"..."` string/vector value, which spice-ts cannot evaluate to a number. */
  stringValue?: boolean;
}

interface PendingStatement {
  text: string;
  substitute: boolean;
  line: number;
  /** A line inside a top-level `.control` block. */
  control?: boolean;
}

/**
 * Variable records for the expression evaluator. `numparam` also defines
 * TEMPER for `{...}`/`'...'` expressions; `params` holds only `.param` names
 * and is used for B-cards, whose ASRC expressions evaluate `temper` themselves.
 */
interface ParamScopes {
  params: Record<string, number>;
  numparam: Record<string, number>;
}

/** ngspice's default circuit temperature in Celsius. */
const DEFAULT_CIRCUIT_TEMPERATURE_CELSIUS = 27;
const TEMPER = 'TEMPER';

const OPTIONS_CARD = /^\s*\.opt(?:ion|ions)?(?:\s|$)/i;
const OPTIONS_TEMP_FIELD = /(?:^|\s)temp\s*=\s*([^\s=]+)/gi;

/**
 * Circuit temperature that TEMPER reads: the last `TEMP=` field of the
 * top-level `.options` cards (as the parser applies them), else 27 C. `.temp`
 * cards are rejected by the parser. An unparsable value is left to the
 * `.options` parser to report.
 */
function circuitTemperature(statements: PendingStatement[]): number {
  let temperature = DEFAULT_CIRCUIT_TEMPERATURE_CELSIUS;
  for (const statement of statements) {
    if (statement.control || !OPTIONS_CARD.test(statement.text)) continue;
    const text = statement.text.slice(0, commentStart(statement.text));
    for (const match of text.matchAll(OPTIONS_TEMP_FIELD)) {
      try {
        temperature = parseNumber(match[1]);
      } catch {
        // reported by the .options parser
      }
    }
  }
  return temperature;
}

/** `.step [lin|dec|oct] [param] temp ...` or `.dc temp ...`; control blocks sweep with `dc temp ...`. */
const TEMPERATURE_SWEEP = /^\s*(?:\.step\s+(?:(?:lin|dec|oct)\s+)?(?:param\s+)?temp\b|\.dc\s+temp\b)/i;
const CONTROL_TEMPERATURE_SWEEP = /^\s*dc\s+temp\b/i;

function isTemperatureSweep(statement: PendingStatement): boolean {
  return (statement.control ? CONTROL_TEMPERATURE_SWEEP : TEMPERATURE_SWEEP).test(statement.text);
}

/**
 * Lazily evaluates `.param` definitions on first use, in dependency order.
 * Returned as variable records so the expression evaluator can look names up.
 */
function createParamScopes(
  definitions: Map<string, ParamDefinition>,
  temperatureSweep: PendingStatement | undefined,
  temperature: number,
): ParamScopes {
  const values = new Map<string, number>();
  const resolving: string[] = [];
  const isParam = (key: string | symbol): key is string => typeof key === 'string' && definitions.has(key);
  const params: Record<string, number> = new Proxy({}, {
    has: (_target, key) => isParam(key),
    get: (_target, key) => (isParam(key) ? resolve(key) : undefined),
  });
  const isTemper = (key: string | symbol) => key === TEMPER && !definitions.has(TEMPER);
  const numparam: Record<string, number> = new Proxy({}, {
    has: (_target, key) => isParam(key) || isTemper(key),
    get: (_target, key) => {
      if (isTemper(key)) return temper();
      return isParam(key) ? resolve(key) : undefined;
    },
  });

  function temper(): number {
    if (temperatureSweep !== undefined) {
      throw new Error(
        'TEMPER-dependent expressions are not supported with a temperature sweep '
        + `(.step TEMP or dc TEMP, line ${temperatureSweep.line}): spice-ts evaluates parameter `
        + `expressions once, at the ${temperature} C circuit temperature`,
      );
    }
    return temperature;
  }

  function resolve(name: string): number {
    const known = values.get(name);
    if (known !== undefined) return known;
    const definition = definitions.get(name)!;
    if (definition.stringValue) {
      throw new ParseError(
        `String-valued .param '${name}' is not supported: spice-ts parameters are numbers `
        + '(ngspice string and vector parameters are not implemented)',
        definition.line,
        definition.context,
      );
    }
    if (resolving.includes(name)) {
      const cycle = [...resolving.slice(resolving.indexOf(name)), name].join(' -> ');
      throw new ParseError(`Circular .param dependency: ${cycle}`, definition.line, definition.context);
    }
    resolving.push(name);
    try {
      const value = evaluateParamExpression(definition, numparam);
      values.set(name, value);
      return value;
    } finally {
      resolving.pop();
    }
  }

  return { params, numparam };
}

function evaluateParamExpression(definition: ParamDefinition, scope: Record<string, number>): number {
  try {
    return evaluateExpression(definition.expression, scope);
  } catch (error) {
    if (error instanceof ParseError) throw error;
    // A bare SPICE number (e.g. `1meg`) is not an expression; anything else
    // that fails to evaluate is reported at the `.param` definition.
    try {
      return parseNumber(definition.expression);
    } catch {
      throw toParseError(error, definition.line, definition.context);
    }
  }
}

function substituteStatement(statement: PendingStatement, scopes: ParamScopes): string {
  const preserveOutputFunctions = /^\.PRINT(?:\s|$)/i.test(statement.text.trim());
  try {
    const behavioralResistor = behavioralResistorAsBSource(statement.text);
    const text = behavioralResistor ?? statement.text;
    if (/^\s*b/i.test(text)) {
      // B-cards: `'...'`, `{...}` and bare `.param` names are substituted by
      // the B-card front end; `temper` stays a live ASRC variable.
      const substituted = substituteExpressions(text, scopes.params, preserveOutputFunctions);
      return substituteBehavioralParameters(substituted, scopes.params);
    }
    return substituteExpressions(quotedExpressionsAsBraces(text), scopes.numparam, preserveOutputFunctions);
  } catch (error) {
    if (error instanceof ParseError) throw error;
    throw toParseError(error, statement.line, statement.text.trim());
  }
}

/** Start of an end-of-line comment (`;`, `$` or `//`), as the tokenizer strips them. */
function commentStart(line: string): number {
  const starts = [line.indexOf(';'), line.indexOf('$'), line.indexOf('//')].filter(index => index >= 0);
  return starts.length === 0 ? line.length : Math.min(...starts);
}

/**
 * ngspice numparam treats a single-quoted value as a brace expression:
 * `v1 1 0 '2--3'` is `v1 1 0 {2--3}`. Comments after the card are left alone.
 */
function quotedExpressionsAsBraces(line: string): string {
  if (!line.includes("'") || /^\s*\.title\b/i.test(line)) return line;
  const end = commentStart(line);
  return line.slice(0, end).replace(/'([^']*)'/g, '{$1}') + line.slice(end);
}

/**
 * Subcircuit bodies are expanded later by the circuit builder, whose tokenizer
 * splits on whitespace and evaluates only `{expr}` tokens. Rewrite `'expr'` as
 * `{expr}` and drop the whitespace inside brace expressions so each stays one
 * token (`R1 in out 'rint1 * 2'` -> `R1 in out {rint1*2}`). B-cards, comments
 * and dot commands other than `.param`/`.model` are left unchanged.
 */
function compactSubcircuitExpressions(line: string): string {
  const trimmed = line.trim();
  if (trimmed === '' || trimmed.startsWith('*') || /^b/i.test(trimmed)) return line;
  if (trimmed.startsWith('.') && !/^\.(?:param|model)\b/i.test(trimmed)) return line;
  if (!line.includes("'") && !line.includes('{')) return line;
  const end = commentStart(line);
  const compact = (expression: string) => `{${expression.replace(/\s+/g, '')}}`;
  return line.slice(0, end)
    .replace(/'([^']*)'/g, (_match, expression: string) => compact(expression))
    .replace(/\{([^{}]*)\}/g, (_match, expression: string) => compact(expression))
    + line.slice(end);
}

const BEHAVIORAL_RESISTOR = /^\s*(r\S*)\s+(\S+)\s+(\S+)\s+(?:r\s*=\s*)?(?:\{([^{}]*)\}|'([^']*)')\s*(.*)$/i;
const NODE_DEPENDENCE = /\b[vi]\s*\(/i;
const BEHAVIORAL_RESISTOR_PARAMETER = /^(tc1|tc2)=(\S+)$/i;

/**
 * ngspice (inpcom.c) turns a resistor whose value expression reads node
 * voltages or branch currents into an ASRC:
 * `Rxxx n1 n2 R={expr} tc1=a` -> `bRxxx n1 n2 i = v(n1, n2)/(expr) tc1=a reciproctc=1`.
 * Returns the B-card, or undefined when the line is not such a resistor.
 */
function behavioralResistorAsBSource(line: string): string | undefined {
  const card = BEHAVIORAL_RESISTOR.exec(line.slice(0, commentStart(line)));
  if (!card) return undefined;
  const [, name, positive, negative, braced, quoted, rest] = card;
  const expression = (braced ?? quoted).trim();
  if (!NODE_DEPENDENCE.test(expression)) return undefined;
  const parameters = rest.replace(/\s*=\s*/g, '=').trim().split(/\s+/).filter(Boolean);
  for (const parameter of parameters) {
    if (!BEHAVIORAL_RESISTOR_PARAMETER.test(parameter)) {
      throw new Error(
        `Unsupported parameter '${parameter}' on behavioral resistor '${name}': a resistor whose value `
        + 'depends on v() or i() is simulated as an ngspice B-source, which carries only tc1= and tc2=',
      );
    }
  }
  const coefficients = parameters.map(parameter => ` ${parameter}`).join('');
  return `b${name} ${positive} ${negative} i = v(${positive}, ${negative})/(${expression})${coefficients} reciproctc=1`;
}

function toParseError(error: unknown, line: number, context: string): ParseError {
  const message = (error as Error).message
    .replace(/^Undefined variable '([^']*)'$/, "Undefined parameter '$1'");
  return new ParseError(message, line, context);
}

async function collectStatements(
  netlist: string,
  resolver: IncludeResolver | undefined,
  visited: Set<string>,
  chain: string[],
  depth: number,
  definitions: Map<string, ParamDefinition>,
  statements: PendingStatement[],
  guard?: ProtocolExecutionGuard,
  lineOffset = 0,
): Promise<void> {
  guard?.maximum('maxIncludeDepth', depth, 'parse');
  if (depth > MAX_DEPTH) {
    throw new ParseError(`Include depth limit exceeded (${MAX_DEPTH})`, 0, '');
  }

  const lines = netlist.split('\n');
  let inSubckt = 0;
  let inControl = false;

  for (const [index, line] of lines.entries()) {
    guard?.checkpoint('parse:line');
    const lineNumber = index + 1 + lineOffset;
    const trimmed = line.trim();
    const upper = trimmed.toUpperCase();
    const passThrough = () => statements.push({ text: line, substitute: false, line: lineNumber });

    // Comments are metadata, not expression-bearing netlist statements.
    if (trimmed.startsWith('*')) {
      passThrough();
      continue;
    }

    // Track .subckt nesting — don't evaluate params inside subcircuits
    if (upper.startsWith('.SUBCKT ')) {
      inSubckt++;
      passThrough();
      continue;
    }
    if (upper.startsWith('.ENDS')) {
      inSubckt--;
      passThrough();
      continue;
    }

    // Inside a subcircuit — expressions are evaluated per instance later
    if (inSubckt > 0) {
      statements.push({ text: compactSubcircuitExpressions(line), substitute: false, line: lineNumber });
      continue;
    }

    // ngspice control language is not numparam input: `{$var}` and quotes
    // belong to the control interpreter.
    if (inControl) {
      if (upper.startsWith('.ENDC')) inControl = false;
      statements.push({ text: line, substitute: false, line: lineNumber, control: true });
      continue;
    }
    if (upper === '.CONTROL' || upper.startsWith('.CONTROL ')) {
      inControl = true;
      passThrough();
      continue;
    }

    // .param at top level
    if (upper.startsWith('.PARAM ')) {
      const paramContent = trimmed.slice(7).trim();
      const assignments = paramContent.matchAll(/([A-Za-z_]\w*)\s*=\s*(\{[^}]+\}|'[^']*'|"[^"]*"|\S+)/g);
      for (const assignment of assignments) {
        const name = assignment[1].toUpperCase();
        const value = assignment[2];
        const delimited = value.length >= 2
          && ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith("'") && value.endsWith("'")));
        definitions.set(name, {
          expression: delimited ? value.slice(1, -1) : value,
          line: lineNumber,
          context: trimmed,
          ...(value.startsWith('"') ? { stringValue: true } : {}),
        });
      }
      continue;
    }

    // .include directive
    if (upper.startsWith('.INCLUDE ')) {
      if (!resolver) {
        throw new ParseError(
          '.include directive requires a resolver. Use parseAsync() with a resolveInclude option.',
          0, trimmed,
        );
      }
      let path = trimmed.slice(9).trim();
      if ((path.startsWith("'") && path.endsWith("'")) ||
          (path.startsWith('"') && path.endsWith('"'))) {
        path = path.slice(1, -1);
      }
      if (visited.has(path)) {
        throw new CycleError([...chain, path]);
      }
      visited.add(path);
      const content = await resolver(path);
      await collectStatements(
        content, resolver, visited, [...chain, path], depth + 1, definitions, statements, guard,
      );
      visited.delete(path);
      continue;
    }

    // .lib <filename> <section> — fetch file and extract section
    if (upper.startsWith('.LIB ')) {
      const libTokens = trimmed.slice(5).trim().split(/\s+/);
      if (libTokens.length >= 2) {
        if (!resolver) {
          throw new ParseError(
            '.lib directive with file requires a resolver. Use parseAsync() with a resolveInclude option.',
            0, trimmed,
          );
        }
        let filePath = libTokens.slice(0, -1).join(' ');
        const section = libTokens[libTokens.length - 1];
        if ((filePath.startsWith("'") && filePath.endsWith("'")) ||
            (filePath.startsWith('"') && filePath.endsWith('"'))) {
          filePath = filePath.slice(1, -1);
        }
        const visitKey = `${filePath}:${section}`;
        if (visited.has(visitKey)) {
          throw new CycleError([...chain, visitKey]);
        }
        visited.add(visitKey);
        const content = await resolver(filePath);
        const extracted = extractLibSection(content, section);
        await collectStatements(
          extracted, resolver, visited, [...chain, visitKey], depth + 1, definitions, statements, guard,
        );
        visited.delete(visitKey);
        continue;
      }
      continue;
    }

    // .endl — skip (handled by extractLibSection)
    if (upper.startsWith('.ENDL')) {
      continue;
    }

    statements.push({ text: line, substitute: true, line: lineNumber });
  }
}

// Output vectors are evaluated after simulation, not as scalar parameters.
function substituteExpressions(
  line: string,
  params: Record<string, number>,
  preserveOutputFunctions = false,
): string {
  return line.replace(/\{([^}]+)\}/g, (match, expr: string) => {
    if (preserveOutputFunctions && isVoltageOrCurrentOutputExpression(expr)) return match;
    const value = evaluateExpression(expr, params);
    return formatNumber(value);
  });
}

function isVoltageOrCurrentOutputExpression(expression: string): boolean {
  const functions = [...expression.matchAll(/([A-Za-z_]\w*)\s*\(/g)]
    .map(match => match[1].toUpperCase());
  if (functions.length === 0 || functions.some(name => name !== 'V' && name !== 'I')) return false;
  const arithmetic = expression.replace(/\b[vi]\s*\([^()]*\)/gi, '0');
  return /^[\d.eE+\-*/()\s]+$/.test(arithmetic);
}

function formatNumber(value: number): string {
  // JavaScript's Number.toString() already produces exponential notation for very
  // small (< 5e-7) and very large (>= 1e21) values, and decimal strings otherwise.
  // This naturally satisfies all test expectations (e.g. 1e-7 → "1e-7",
  // 2e-6 → "0.000002", 1.8 → "1.8", 5 → "5").
  return value.toString();
}

function extractLibSection(content: string, section: string): string {
  const lines = content.split('\n');
  const output: string[] = [];
  let currentSection: string | null = null;
  const sectionUpper = section.toUpperCase();

  for (const line of lines) {
    const trimmed = line.trim();
    const upper = trimmed.toUpperCase();

    if (upper.startsWith('.LIB ')) {
      const tokens = trimmed.slice(5).trim().split(/\s+/);
      if (tokens.length === 1) {
        currentSection = tokens[0].toUpperCase();
        continue;
      }
      if (currentSection === null || currentSection === sectionUpper) {
        output.push(line);
      }
      continue;
    }

    if (upper.startsWith('.ENDL')) {
      currentSection = null;
      continue;
    }

    if (currentSection === null || currentSection === sectionUpper) {
      output.push(line);
    }
  }

  return output.join('\n');
}
