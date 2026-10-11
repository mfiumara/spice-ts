import { ParseError } from '../errors.js';
import { parseInstanceParams } from './waveform-parser.js';

export interface ParsedZInstance {
  nodes: [string, string, string];
  modelName: string;
  params: Record<string, number>;
}

/**
 * Parse `Zname drain gate source model [L=..] [W=..]`. Both supported Z-card
 * model families (NHFET level 5 and NMF level 2) accept only L and W here.
 */
export function parseZInstance(
  tokens: string[],
  lineNumber: number,
  context: string,
): ParsedZInstance {
  if (tokens.length < 5) {
    throw new ParseError('Z-card requires drain, gate, source, and model', lineNumber, context);
  }
  const params = parseInstanceParams(tokens, 5);
  for (const name of Object.keys(params)) {
    if (name !== 'L' && name !== 'W') {
      throw new ParseError(`Unsupported Z-card instance parameter: '${name}'`, lineNumber, context);
    }
  }
  return {
    nodes: [tokens[1], tokens[2], tokens[3]],
    modelName: tokens[4],
    params,
  };
}
