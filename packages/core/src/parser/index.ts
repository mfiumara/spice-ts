import { Circuit } from '../circuit.js';
import { ParseError } from '../errors.js';
import { tokenizeNetlist, parseNumber } from './tokenizer.js';
import { parseModelCard } from './model-parser.js';
import { parseSourceWaveform, parseInstanceParams } from './waveform-parser.js';
import { preprocess } from './preprocessor.js';
import type { IncludeResolver } from '../types.js';

export { parseSourceWaveform } from './waveform-parser.js';

/**
 * Parse a SPICE netlist string into a {@link Circuit} object.
 *
 * Handles device lines (R, C, L, V, I, D, Q, M, E, G, H, F, X),
 * dot commands (`.op`, `.dc`, `.tran`, `.ac`, `.model`, `.subckt`),
 * and subcircuit definitions. Does not resolve `.include` or `.lib`
 * directives -- use {@link parseAsync} for netlists with file includes.
 *
 * @param netlist - SPICE netlist text (may include line continuations with `+`)
 * @returns A {@link Circuit} ready for compilation and simulation
 * @throws {@link ParseError} if the netlist contains syntax errors or unknown device types
 * @example
 * ```ts
 * const circuit = parse(`
 *   V1 in 0 DC 5
 *   R1 in out 1k
 *   R2 out 0 1k
 *   .op
 * `);
 * const compiled = circuit.compile();
 * ```
 */
export function parse(netlist: string): Circuit {
  const lines = tokenizeNetlist(netlist);
  const circuit = new Circuit();

  let subcktCollector: { name: string; ports: string[]; params: Record<string, number>; body: string[]; depth: number } | null = null;

  for (const { tokens, lineNumber, raw } of lines) {
    if (tokens.length === 0) continue;
    const first = tokens[0].toUpperCase();

    try {
      // Inside a .subckt — collect raw lines until .ends
      if (subcktCollector !== null) {
        if (first === '.SUBCKT') {
          subcktCollector.depth++;
          subcktCollector.body.push(raw);
        } else if (first === '.ENDS') {
          if (subcktCollector.depth > 0) {
            subcktCollector.depth--;
            subcktCollector.body.push(raw);
          } else {
            circuit.addSubcircuit({
              name: subcktCollector.name,
              ports: subcktCollector.ports,
              params: subcktCollector.params,
              body: subcktCollector.body,
            });
            subcktCollector = null;
          }
        } else {
          subcktCollector.body.push(raw);
        }
        continue;
      }

      if (first === '.SUBCKT') {
        const subcktName = tokens[1];
        const ports: string[] = [];
        const params: Record<string, number> = {};
        for (let i = 2; i < tokens.length; i++) {
          const eqIdx = tokens[i].indexOf('=');
          if (eqIdx > 0) {
            params[tokens[i].slice(0, eqIdx).toUpperCase()] = parseNumber(tokens[i].slice(eqIdx + 1));
          } else {
            ports.push(tokens[i]);
          }
        }
        subcktCollector = { name: subcktName, ports, params, body: [], depth: 0 };
        continue;
      }

      if (first.startsWith('.')) {
        parseDotCommand(circuit, tokens, lineNumber);
      } else {
        parseDevice(circuit, tokens, lineNumber);
      }
    } catch (e) {
      if (e instanceof ParseError) throw e;
      throw new ParseError((e as Error).message, lineNumber, raw);
    }
  }

  return circuit;
}

/**
 * Parse a SPICE netlist with async resolution of `.include` and `.lib` directives.
 *
 * Preprocesses the netlist first (resolving includes, `.param` substitution,
 * expression evaluation), then delegates to {@link parse}.
 *
 * @param netlist - SPICE netlist text, possibly containing `.include`/`.lib` directives
 * @param resolver - Async function that returns file contents given a path
 * @returns A {@link Circuit} ready for compilation and simulation
 * @throws {@link ParseError} if the netlist contains syntax errors
 * @throws {@link CycleError} if `.include`/`.lib` directives form a circular dependency
 * @example
 * ```ts
 * const circuit = await parseAsync(netlist, async (path) => {
 *   return await fs.readFile(path, 'utf-8');
 * });
 * ```
 */
export async function parseAsync(
  netlist: string,
  resolver?: IncludeResolver,
): Promise<Circuit> {
  const preprocessed = await preprocess(netlist, resolver);
  return parse(preprocessed);
}

function parseDotCommand(circuit: Circuit, tokens: string[], lineNumber: number): void {
  const cmd = tokens[0].toUpperCase();

  switch (cmd) {
    case '.OP':
      circuit.addAnalysis('op');
      break;
    case '.DC': {
      const source = tokens[1];
      const start = parseNumber(tokens[2]);
      const stop = parseNumber(tokens[3]);
      const step = parseNumber(tokens[4]);
      circuit.addAnalysis('dc', { source, start, stop, step });
      break;
    }
    case '.TRAN': {
      const timestep = parseNumber(tokens[1]);
      const stopTime = parseNumber(tokens[2]);
      const startTime = tokens[3] ? parseNumber(tokens[3]) : undefined;
      const maxTimestep = tokens[4] ? parseNumber(tokens[4]) : undefined;
      circuit.addAnalysis('tran', { timestep, stopTime, startTime, maxTimestep });
      break;
    }
    case '.AC': {
      const variation = tokens[1].toLowerCase() as 'dec' | 'oct' | 'lin';
      const points = parseInt(tokens[2], 10);
      const startFreq = parseNumber(tokens[3]);
      const stopFreq = parseNumber(tokens[4]);
      circuit.addAnalysis('ac', { variation, points, startFreq, stopFreq });
      break;
    }
    case '.MODEL':
      circuit.addModel(parseModelCard(tokens, lineNumber));
      break;
    case '.INCLUDE':
      throw new ParseError(
        '.include directive requires async parsing. Use parseAsync() with a resolveInclude option.',
        lineNumber, tokens.join(' '),
      );
    case '.LIB':
      if (tokens.length >= 3) {
        throw new ParseError(
          '.lib directive with file requires async parsing. Use parseAsync() with a resolveInclude option.',
          lineNumber, tokens.join(' '),
        );
      }
      break;
    default:
      break;
  }
}

function parseDevice(circuit: Circuit, tokens: string[], lineNumber: number): void {
  const name = tokens[0];
  const type = name[0].toUpperCase();

  switch (type) {
    case 'R': {
      const value = parseNumber(tokens[3]);
      circuit.addResistor(name, tokens[1], tokens[2], value);
      break;
    }
    case 'C': {
      const value = parseNumber(tokens[3]);
      circuit.addCapacitor(name, tokens[1], tokens[2], value);
      break;
    }
    case 'L': {
      const value = parseNumber(tokens[3]);
      circuit.addInductor(name, tokens[1], tokens[2], value);
      break;
    }
    case 'V': {
      const waveform = parseSourceWaveform(tokens, 3);
      circuit.addVoltageSource(name, tokens[1], tokens[2], waveform);
      break;
    }
    case 'I': {
      const waveform = parseSourceWaveform(tokens, 3);
      circuit.addCurrentSource(name, tokens[1], tokens[2], waveform);
      break;
    }
    case 'D':
      circuit.addDiode(name, tokens[1], tokens[2], tokens[3]);
      break;
    case 'Q':
      circuit.addBJT(name, tokens[1], tokens[2], tokens[3], tokens[4]);
      break;
    case 'M': {
      // SPICE MOSFET: M name D G S [B] modelName [W=x L=y ...]
      // tokens[4] is either the body node (4-terminal) or the model name (3-terminal).
      // Heuristic: if tokens[5] exists and does not contain '=', then tokens[4] is the
      // body node and tokens[5] is the model name; otherwise tokens[4] is the model name.
      let modelName: string;
      let instanceParamStart: number;
      let bulkNode: string | undefined;
      if (tokens[5] && !tokens[5].includes('=')) {
        bulkNode = tokens[4];
        modelName = tokens[5];       // 4-terminal form: D G S B model
        instanceParamStart = 6;
      } else {
        modelName = tokens[4];       // 3-terminal form: D G S model
        instanceParamStart = 5;
      }
      const mosfetParams = parseInstanceParams(tokens, instanceParamStart);
      circuit.addMOSFET(name, tokens[1], tokens[2], tokens[3], modelName, mosfetParams, bulkNode);
      break;
    }
    case 'X': {
      // X<name> <port1> <port2> ... <subcktName> [param=val ...]
      let subcktIdx = tokens.length - 1;
      while (subcktIdx > 1 && tokens[subcktIdx].includes('=')) {
        subcktIdx--;
      }
      const subcktName = tokens[subcktIdx];
      const ports = tokens.slice(1, subcktIdx);
      const xParams = parseInstanceParams(tokens, subcktIdx + 1);
      circuit.addSubcircuitInstance(name, ports, subcktName, xParams);
      break;
    }
    case 'E': {
      const gain = parseNumber(tokens[5]);
      circuit.addVCVS(name, tokens[1], tokens[2], tokens[3], tokens[4], gain);
      break;
    }
    case 'G': {
      const gm = parseNumber(tokens[5]);
      circuit.addVCCS(name, tokens[1], tokens[2], tokens[3], tokens[4], gm);
      break;
    }
    case 'H': {
      const gain = parseNumber(tokens[4]);
      circuit.addCCVS(name, tokens[1], tokens[2], tokens[3], gain);
      break;
    }
    case 'F': {
      const gain = parseNumber(tokens[4]);
      circuit.addCCCS(name, tokens[1], tokens[2], tokens[3], gain);
      break;
    }
    default:
      throw new ParseError(`Unknown device type: '${type}'`, lineNumber, tokens.join(' '));
  }
}
