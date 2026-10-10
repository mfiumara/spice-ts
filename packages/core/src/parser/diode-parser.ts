import { parseNumber } from './tokenizer.js';

export interface DiodeInstanceParams {
  AREA?: number;
  PJ?: number;
  M?: number;
}

const GEOMETRY_PARAMETERS = new Set(['AREA', 'PJ', 'M']);

/** Parse the supported ngspice diode geometry fields without ignoring tokens. */
export function parseDiodeInstanceParams(
  tokens: string[],
  startIdx: number,
): DiodeInstanceParams {
  const params: DiodeInstanceParams = {};

  for (let i = startIdx; i < tokens.length; i++) {
    const token = tokens[i];
    const eqIdx = token.indexOf('=');

    if (eqIdx < 0) {
      if (
        i !== startIdx
        || params.AREA !== undefined
        || !/^[+-]?(?:\d+\.?\d*|\.\d+)/.test(token)
      ) {
        throw new Error(`Unsupported diode parameter: '${token}'`);
      }
      params.AREA = parseNumber(token);
      continue;
    }

    const key = token.slice(0, eqIdx).toUpperCase();
    if (!GEOMETRY_PARAMETERS.has(key)) {
      throw new Error(`Unsupported diode parameter: '${token}'`);
    }
    params[key as keyof DiodeInstanceParams] = parseNumber(token.slice(eqIdx + 1));
  }

  if (params.AREA !== undefined && params.AREA <= 0) {
    throw new Error('Diode AREA must be greater than zero');
  }
  if (params.PJ !== undefined && params.PJ < 0) {
    throw new Error('Diode PJ must be non-negative');
  }
  if (params.M !== undefined && params.M <= 0) {
    throw new Error('Diode M must be greater than zero');
  }

  return params;
}
