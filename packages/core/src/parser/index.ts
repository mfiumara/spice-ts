import { Circuit } from '../circuit.js';
import { ParseError } from '../errors.js';
import { tokenizeNetlist, parseNumber } from './tokenizer.js';
import { parseModelCard } from './model-parser.js';
import type { SourceWaveform, PulseSource, SinSource } from '../types.js';

export function parse(netlist: string): Circuit {
  const lines = tokenizeNetlist(netlist);
  const circuit = new Circuit();

  for (const { tokens, lineNumber, raw } of lines) {
    if (tokens.length === 0) continue;
    const first = tokens[0].toUpperCase();

    try {
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
    case 'M':
      circuit.addMOSFET(name, tokens[1], tokens[2], tokens[3], tokens[4]);
      break;
    default:
      throw new ParseError(`Unknown device type: '${type}'`, lineNumber, tokens.join(' '));
  }
}

function parseSourceWaveform(tokens: string[], startIdx: number): SourceWaveform {
  if (startIdx >= tokens.length) return { type: 'dc', value: 0 };

  // Scan for AC keyword anywhere in the remaining tokens (e.g. "DC 0 AC 1")
  const upper = tokens.slice(startIdx).map(t => t.toUpperCase());
  const acIdx = upper.indexOf('AC');
  if (acIdx >= 0) {
    const absIdx = startIdx + acIdx;
    const magnitude = parseNumber(tokens[absIdx + 1]);
    const maybePhase = tokens[absIdx + 2]?.toUpperCase();
    const phase = (maybePhase && maybePhase !== 'DC' && !maybePhase.startsWith('.'))
      ? parseNumber(tokens[absIdx + 2])
      : 0;
    return { type: 'ac', magnitude, phase };
  }

  const keyword = tokens[startIdx].toUpperCase();

  if (keyword === 'DC') {
    return { type: 'dc', value: parseNumber(tokens[startIdx + 1]) };
  }

  if (keyword === 'AC') {
    const magnitude = parseNumber(tokens[startIdx + 1]);
    const phase = tokens[startIdx + 2] ? parseNumber(tokens[startIdx + 2]) : 0;
    return { type: 'ac', magnitude, phase };
  }

  if (keyword === 'PULSE') {
    const parenStart = tokens.indexOf('(', startIdx);
    const parenEnd = tokens.indexOf(')', startIdx);
    const args = tokens.slice(parenStart + 1, parenEnd).map(parseNumber);
    return {
      type: 'pulse', v1: args[0] ?? 0, v2: args[1] ?? 0,
      delay: args[2] ?? 0, rise: args[3] ?? 1e-12, fall: args[4] ?? 1e-12,
      width: args[5] ?? Infinity, period: args[6] ?? Infinity,
    } satisfies PulseSource;
  }

  if (keyword === 'SIN') {
    const parenStart = tokens.indexOf('(', startIdx);
    const parenEnd = tokens.indexOf(')', startIdx);
    const args = tokens.slice(parenStart + 1, parenEnd).map(parseNumber);
    return {
      type: 'sin', offset: args[0] ?? 0, amplitude: args[1] ?? 0,
      frequency: args[2] ?? 0, delay: args[3], damping: args[4], phase: args[5],
    } satisfies SinSource;
  }

  return { type: 'dc', value: parseNumber(tokens[startIdx]) };
}
