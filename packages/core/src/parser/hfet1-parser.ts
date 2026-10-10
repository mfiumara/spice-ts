import { ParseError } from '../errors.js';
import { parseInstanceParams } from './waveform-parser.js';

export interface ParsedHFET1Instance {
  nodes: [string, string, string];
  modelName: string;
  params: Record<string, number>;
}

export function parseHFET1Instance(
  tokens: string[],
  lineNumber: number,
  context: string,
): ParsedHFET1Instance {
  if (tokens.length < 5) {
    throw new ParseError('Z-card requires drain, gate, source, and model', lineNumber, context);
  }
  const params = parseInstanceParams(tokens, 5);
  for (const name of Object.keys(params)) {
    if (name !== 'L' && name !== 'W') {
      throw new ParseError(
        `Unsupported NHFET level-5 instance parameter: '${name}'`,
        lineNumber,
        context,
      );
    }
  }
  return {
    nodes: [tokens[1], tokens[2], tokens[3]],
    modelName: tokens[4],
    params,
  };
}
