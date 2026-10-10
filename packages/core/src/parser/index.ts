import { Circuit } from '../circuit.js';
import { ParseError } from '../errors.js';
import { tokenizeNetlist, parseNumber } from './tokenizer.js';
import { parseModelCard } from './model-parser.js';
import { parseSourceWaveform, parseInstanceParams } from './waveform-parser.js';
import { parsePassiveElement } from './passive-parser.js';
import { parseDiodeInstanceParams } from './diode-parser.js';
import { parsePoleZero } from './pole-zero-parser.js';
import { parseSensitivity } from './sensitivity-parser.js';
import { parseTransmissionLine } from './transmission-line-parser.js';
import { preprocess } from './preprocessor.js';
import type { IncludeResolver, IntegrationMethod, SimulationOptions } from '../types.js';
import type { ProtocolExecutionGuard } from '../protocol/execution-guard.js';

export { parseSourceWaveform } from './waveform-parser.js';

/**
 * Parse a standard SPICE deck into a {@link Circuit} object.
 *
 * SPICE reserves the first physical line as the deck title. It is always
 * discarded, even when its text has the shape of a device or directive. Use
 * {@link parseTitleless} for generated fragments that omit the title line.
 *
 * Handles device lines (R, C, L, V, I, D, Q, J, M, E, G, H, F, X),
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
  return parseNetlist(netlist, true);
}

/**
 * Parse a title-less SPICE fragment.
 *
 * Unlike {@link parse}, the first physical line is parsed as a device or
 * directive. Use this explicit API for generated snippets that omit the
 * standard SPICE title line.
 */
export function parseTitleless(netlist: string): Circuit {
  return parseNetlist(netlist, false);
}

function parseNetlist(
  netlist: string,
  firstLineIsTitle: boolean,
  guard?: ProtocolExecutionGuard,
): Circuit {
  const lines = tokenizeNetlist(netlist, { firstLineIsTitle });
  const circuit = new Circuit();

  let subcktCollector: { name: string; ports: string[]; params: Record<string, number>; body: string[]; depth: number } | null = null;
  let hasNoiseAnalysis = false;
  let hasPoleZeroAnalysis = false;
  let hasSensitivityAnalysis = false;
  let hasDistortionAnalysis = false;
  let hasStepAnalysis = false;

  for (const { tokens, lineNumber, raw } of lines) {
    guard?.checkpoint('parse:line');
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
        if ((first === '.NOISE' && hasStepAnalysis) || (first === '.STEP' && hasNoiseAnalysis)) {
          throw new ParseError(
            '.step cannot be combined with .noise',
            lineNumber,
            raw,
          );
        }
        if ((first === '.PZ' && hasStepAnalysis) || (first === '.STEP' && hasPoleZeroAnalysis)) {
          throw new ParseError(
            '.step cannot be combined with .pz',
            lineNumber,
            raw,
          );
        }
        if ((first === '.SENS' && hasStepAnalysis) || (first === '.STEP' && hasSensitivityAnalysis)) {
          throw new ParseError(
            '.step cannot be combined with .sens',
            lineNumber,
            raw,
          );
        }
        if ((first === '.DISTO' && hasStepAnalysis) || (first === '.STEP' && hasDistortionAnalysis)) {
          throw new ParseError(
            '.step cannot be combined with .disto',
            lineNumber,
            raw,
          );
        }
        if (first === '.NOISE') hasNoiseAnalysis = true;
        if (first === '.PZ') hasPoleZeroAnalysis = true;
        if (first === '.SENS') hasSensitivityAnalysis = true;
        if (first === '.DISTO' && hasDistortionAnalysis) {
          throw new ParseError('Multiple .disto analyses are not supported', lineNumber, raw);
        }
        if (first === '.DISTO') hasDistortionAnalysis = true;
        if (first === '.STEP' && hasStepAnalysis) {
          throw new ParseError(
            'Multiple .step directives are not supported; nested or multi-dimensional stepping is unsupported',
            lineNumber,
            raw,
          );
        }
        if (first === '.STEP') hasStepAnalysis = true;
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
  const newline = netlist.indexOf('\n');
  const title = newline < 0 ? netlist : netlist.slice(0, newline);
  const body = newline < 0 ? '' : netlist.slice(newline + 1);
  const preprocessed = await preprocess(body, resolver);
  return parse(`${title}\n${preprocessed}`);
}

/** Parse and preprocess a title-less SPICE fragment. */
export async function parseTitlelessAsync(
  netlist: string,
  resolver?: IncludeResolver,
  guard?: ProtocolExecutionGuard,
): Promise<Circuit> {
  const preprocessed = await preprocess(netlist, resolver, guard);
  return parseNetlist(preprocessed, false, guard);
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
      const args = tokens.slice(3);
      const uicIndex = args.findIndex(token => token.toUpperCase() === 'UIC');
      const useInitialConditions = uicIndex >= 0;
      if (uicIndex >= 0) args.splice(uicIndex, 1);
      const startTime = args[0] ? parseNumber(args[0]) : undefined;
      const maxTimestep = args[1] ? parseNumber(args[1]) : undefined;
      circuit.addAnalysis('tran', {
        timestep, stopTime, startTime, maxTimestep, useInitialConditions,
      });
      break;
    }
    case '.IC':
      parseNodeInitialState(circuit, 'ic', tokens, lineNumber);
      break;
    case '.NODESET':
      parseNodeInitialState(circuit, 'nodeset', tokens, lineNumber);
      break;
    case '.AC': {
      const variation = tokens[1].toLowerCase() as 'dec' | 'oct' | 'lin';
      const points = parseInt(tokens[2], 10);
      const startFreq = parseNumber(tokens[3]);
      const stopFreq = parseNumber(tokens[4]);
      circuit.addAnalysis('ac', { variation, points, startFreq, stopFreq });
      break;
    }
    case '.NOISE': {
      const isDifferential = tokens.length === 11;
      const sourceIndex = isDifferential ? 6 : 5;
      const variationIndex = sourceIndex + 1;
      const variation = tokens[variationIndex]?.toLowerCase();
      const isSupportedVoltageForm = (tokens.length === 10 || isDifferential)
        && tokens[1].toUpperCase() === 'V'
        && tokens[2] === '('
        && tokens[isDifferential ? 5 : 4] === ')'
        && (variation === 'lin' || variation === 'dec' || variation === 'oct');
      if (!isSupportedVoltageForm) {
        throw new ParseError(
          "Unsupported .noise form; expected '.noise v(node) source {lin|dec|oct} points start stop'",
          lineNumber, tokens.join(' '),
        );
      }
      const points = parseInt(tokens[variationIndex + 1], 10);
      const startFreq = parseNumber(tokens[variationIndex + 2]);
      const stopFreq = parseNumber(tokens[variationIndex + 3]);
      const minimumPoints = variation === 'lin' ? 2 : 1;
      if (!Number.isInteger(points) || points < minimumPoints || startFreq <= 0 || stopFreq < startFreq) {
        throw new ParseError(`Invalid .noise ${variation} sweep`, lineNumber, tokens.join(' '));
      }
      circuit.addAnalysis('noise', {
        outputNode: tokens[3],
        ...(isDifferential ? { outputReferenceNode: tokens[4] } : {}),
        inputSource: tokens[sourceIndex],
        variation: variation as 'dec' | 'oct' | 'lin',
        points,
        startFreq,
        stopFreq,
      });
      break;
    }
    case '.DISTO': {
      if (tokens.length > 5) {
        throw new ParseError(
          'Two-tone .disto is not supported; omit f2overf1',
          lineNumber, tokens.join(' '),
        );
      }
      if (tokens.length !== 5 || tokens[1]?.toLowerCase() !== 'dec') {
        throw new ParseError(
          "Unsupported .disto sweep; expected '.disto dec points start stop'",
          lineNumber, tokens.join(' '),
        );
      }
      const points = Math.round(parseNumber(tokens[2]));
      const startFreq = parseNumber(tokens[3]);
      const stopFreq = parseNumber(tokens[4]);
      if (!Number.isInteger(points) || points < 1 || startFreq <= 0 || stopFreq < startFreq) {
        throw new ParseError('Invalid .disto dec sweep', lineNumber, tokens.join(' '));
      }
      circuit.addAnalysis('disto', {
        variation: 'dec', points, startFreq, stopFreq,
      });
      break;
    }
    case '.TF': {
      if (tokens[1]?.toUpperCase() === 'I') {
        throw new ParseError(
          ".tf current output is not supported; expected '.tf v(node) source'",
          lineNumber, tokens.join(' '),
        );
      }
      if (tokens[1]?.toUpperCase() === 'V' && tokens.length > 6) {
        throw new ParseError(
          ".tf differential voltage output is not supported; expected '.tf v(node) source'",
          lineNumber, tokens.join(' '),
        );
      }
      const isSingleNodeVoltageForm = tokens.length === 6
        && tokens[1].toUpperCase() === 'V'
        && tokens[2] === '('
        && tokens[4] === ')';
      if (!isSingleNodeVoltageForm) {
        throw new ParseError(
          "Unsupported .tf form; expected '.tf v(node) source'",
          lineNumber, tokens.join(' '),
        );
      }
      circuit.addAnalysis('tf', {
        outputNode: tokens[3],
        inputSource: tokens[5],
      });
      break;
    }
    case '.PZ':
      circuit.addAnalysis('pz', parsePoleZero(tokens, lineNumber));
      break;
    case '.SENS': {
      const analysis = parseSensitivity(tokens, lineNumber);
      if (analysis.mode === 'dc') {
        circuit.addAnalysis('sens', {
          outputNode: analysis.outputNode,
          mode: 'dc',
        });
      } else {
        circuit.addAnalysis('sens', {
          outputNode: analysis.outputNode,
          mode: 'ac',
          variation: analysis.variation,
          points: analysis.points,
          startFreq: analysis.startFreq,
          stopFreq: analysis.stopFreq,
        });
      }
      break;
    }
    case '.MODEL': {
      const model = parseModelCard(tokens, lineNumber);
      if (model.type === 'LTRA') {
        throw new ParseError(
          'Lossy transmission line model LTRA is unsupported; use the bounded lossless T-card Z0/TD form',
          lineNumber,
          tokens.join(' '),
        );
      }
      circuit.addModel(model);
      break;
    }
    case '.OPTIONS':
      circuit.setSimulationOptions(parseSimulationOptions(tokens.slice(1)));
      break;
    case '.SAVE':
    case '.PRINT':
    case '.PLOT':
      // spice-ts returns all computed vectors through its result API, so these
      // ngspice output-selection directives are intentionally metadata-only.
      break;
    case '.INCLUDE':
      throw new ParseError(
        '.include directive requires async parsing. Use parseAsync() with a resolveInclude option.',
        lineNumber, tokens.join(' '),
      );
    case '.LIB':
      throw new ParseError(
        '.lib directive requires async parsing. Use parseAsync() with a resolveInclude option.',
        lineNumber, tokens.join(' '),
      );
    case '.STEP': {
      let idx = 1;
      let sweepMode: 'lin' | 'dec' | 'oct' = 'lin';
      const modeToken = tokens[idx].toUpperCase();
      if (modeToken === 'DEC' || modeToken === 'OCT') {
        sweepMode = modeToken.toLowerCase() as 'dec' | 'oct';
        idx++;
      }
      if (tokens[idx].toUpperCase() === 'PARAM') idx++;
      const paramName = tokens[idx++];
      if (tokens[idx] && tokens[idx].toUpperCase() === 'LIST') {
        idx++;
        const values: number[] = [];
        for (; idx < tokens.length; idx++) {
          values.push(parseNumber(tokens[idx]));
        }
        circuit.addStep(paramName, { values });
      } else {
        const start = parseNumber(tokens[idx++]);
        const stop = parseNumber(tokens[idx++]);
        if (sweepMode === 'lin') {
          circuit.addStep(paramName, { mode: 'lin', start, stop, step: parseNumber(tokens[idx]) });
        } else {
          circuit.addStep(paramName, { mode: sweepMode, start, stop, points: parseInt(tokens[idx], 10) });
        }
      }
      break;
    }
    default:
      throw new ParseError(
        `Unsupported dot command: '${tokens[0]}'`,
        lineNumber, tokens.join(' '),
      );
  }
}

function parseSimulationOptions(tokens: string[]): SimulationOptions {
  const optionTokens = tokens.filter(value => value !== '(' && value !== ')');
  if (optionTokens[0]?.toLowerCase() === 'timeint') {
    return parseXyceTimeintOptions(optionTokens.slice(1));
  }

  const options: SimulationOptions = {};

  for (const token of optionTokens) {
    const separator = token.indexOf('=');
    if (separator <= 0 || separator === token.length - 1) {
      throw new Error(`Unsupported .options field: '${token}'`);
    }

    const name = token.slice(0, separator).toLowerCase();
    const rawValue = token.slice(separator + 1);
    if (name === 'method') {
      const methods: Record<string, IntegrationMethod> = {
        trap: 'trapezoidal',
        gear: 'gear2',
      };
      const method = methods[rawValue.toLowerCase()];
      if (!method) throw new Error(`Unsupported .options method: '${rawValue}'`);
      options.integrationMethod = method;
      continue;
    }

    const mappings: Record<string, keyof SimulationOptions> = {
      abstol: 'abstol',
      vntol: 'vntol',
      reltol: 'reltol',
      gmin: 'gmin',
      itl1: 'maxIterations',
      itl4: 'maxTransientIterations',
      trtol: 'trtol',
    };
    const target = mappings[name];
    if (!target) throw new Error(`Unsupported .options field: '${name}'`);

    const value = parseNumber(rawValue);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid .options ${name} value: '${rawValue}'`);
    }
    if ((name === 'itl1' || name === 'itl4') && !Number.isInteger(value)) {
      throw new Error(`Invalid .options ${name} value: '${rawValue}'`);
    }
    Object.assign(options, { [target]: value });
  }

  return options;
}

function parseNodeInitialState(
  circuit: Circuit,
  kind: 'ic' | 'nodeset',
  tokens: string[],
  lineNumber: number,
): void {
  if (tokens.length < 6 || (tokens.length - 1) % 5 !== 0) {
    throw new ParseError(`Invalid .${kind} node-voltage assignment`, lineNumber, tokens.join(' '));
  }
  for (let index = 1; index < tokens.length; index += 5) {
    if (tokens[index].toUpperCase() !== 'V' || tokens[index + 1] !== '('
      || tokens[index + 3] !== ')' || !tokens[index + 4].startsWith('=')) {
      throw new ParseError(`Invalid .${kind} node-voltage assignment`, lineNumber, tokens.join(' '));
    }
    const node = tokens[index + 2];
    const valueToken = tokens[index + 4].slice(1);
    if (!node || !valueToken) {
      throw new ParseError(`Invalid .${kind} node-voltage assignment`, lineNumber, tokens.join(' '));
    }
    circuit.addInitialState(kind, { node, value: parseNumber(valueToken) });
  }
}

function parseXyceTimeintOptions(tokens: string[]): SimulationOptions {
  const options: SimulationOptions = {};

  for (const token of tokens) {
    const separator = token.indexOf('=');
    const name = token.slice(0, Math.max(separator, 0)).toLowerCase();
    if (separator <= 0 || separator === token.length - 1) {
      throw new Error(`Unsupported .options TIMEINT field: '${name || token.toLowerCase()}'`);
    }

    const rawValue = token.slice(separator + 1);
    if (name === 'method') {
      const methods: Record<string, IntegrationMethod> = {
        trap: 'trapezoidal',
        '7': 'trapezoidal',
        gear: 'gear2',
        '8': 'gear2',
      };
      const method = methods[rawValue.toLowerCase()];
      if (!method) throw new Error(`Unsupported .options TIMEINT method: '${rawValue}'`);
      options.integrationMethod = method;
      continue;
    }

    if (name !== 'reltol' && name !== 'abstol') {
      throw new Error(`Unsupported .options TIMEINT field: '${name}'`);
    }

    const value = parseNumber(rawValue);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid .options TIMEINT ${name} value: '${rawValue}'`);
    }
    if (name === 'abstol') {
      // Xyce uses one TIMEINT ABSTOL for both voltage and current solution
      // components; spice-ts represents those tolerances separately.
      options.abstol = value;
      options.vntol = value;
    } else {
      options.reltol = value;
    }
  }

  return options;
}

function parseDevice(circuit: Circuit, tokens: string[], lineNumber: number): void {
  const name = tokens[0];
  const type = name[0].toUpperCase();

  switch (type) {
    case 'R': {
      if (tokens.length > 4) {
        throw new ParseError(
          `Unsupported resistor parameters: '${tokens.slice(4).join(' ')}'`,
          lineNumber, tokens.join(' '),
        );
      }
      const value = parseNumber(tokens[3]);
      circuit.addResistor(name, tokens[1], tokens[2], value);
      break;
    }
    case 'C': {
      const parsed = parsePassiveElement(tokens, 3, 'C');
      const { IC: ic, ...params } = parsed.params;
      circuit.addCapacitor(name, tokens[1], tokens[2], parsed.value, parsed.modelName, params, ic);
      break;
    }
    case 'L': {
      const parsed = parsePassiveElement(tokens, 3, 'L');
      const { IC: ic, ...params } = parsed.params;
      circuit.addInductor(name, tokens[1], tokens[2], parsed.value, parsed.modelName, params, ic);
      break;
    }
    case 'K': {
      circuit.addInductorCoupling(name, tokens[1], tokens[2], parseNumber(tokens[3]));
      break;
    }
    case 'T': {
      const { impedance, delay } = parseTransmissionLine(tokens, lineNumber);
      circuit.addTransmissionLine(
        name,
        tokens[1], tokens[2], tokens[3], tokens[4],
        impedance, delay,
      );
      break;
    }
    case 'O':
      throw new ParseError(
        'Lossy transmission line (LTRA) cards are unsupported; use the bounded lossless T-card Z0/TD form',
        lineNumber,
        tokens.join(' '),
      );
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
      circuit.addDiode(
        name,
        tokens[1],
        tokens[2],
        tokens[3],
        parseDiodeInstanceParams(tokens, 4),
      );
      break;
    case 'Q': {
      if (tokens.length === 5) {
        circuit.addBJT(name, tokens[1], tokens[2], tokens[3], tokens[4]);
        break;
      }
      const groundedSubstrate = tokens[4] === '0';
      const supportedOffFlag = tokens.length === 6
        || (tokens.length === 7 && tokens[6].toUpperCase() === 'OFF=1');
      if (!groundedSubstrate || !supportedOffFlag) {
        throw new ParseError(
          `Unsupported BJT Q-card form: '${tokens.join(' ')}'`,
          lineNumber, tokens.join(' '),
        );
      }
      // Preserve the historical grounded-substrate compatibility path: it
      // used the substrate token as the model selector and therefore ran the
      // default level-1 device. New bounded cards use the three-terminal form.
      circuit.addBJT(name, tokens[1], tokens[2], tokens[3], tokens[4]);
      break;
    }
    case 'J':
      if (tokens.length !== 5) {
        throw new ParseError(
          `Unsupported JFET instance parameter: '${tokens.slice(5).join(' ')}'`,
          lineNumber, tokens.join(' '),
        );
      }
      circuit.addJFET(name, tokens[1], tokens[2], tokens[3], tokens[4]);
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
      throw new ParseError(`Unsupported device card: '${type}'`, lineNumber, tokens.join(' '));
  }
}
