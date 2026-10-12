import { ParseError } from '../errors.js';
import { parseNumber } from './tokenizer.js';

/** Per-instance JFET parameters spice-ts accepts. */
export interface JFETInstanceParams {
  /** Instance temperature in degrees Celsius (ngspice jfet/jfet2 `temp`). */
  TEMP?: number;
}

export interface ParsedJFETInstance {
  drain: string;
  gate: string;
  source: string;
  modelName: string;
  /** Instance parameters; absent when the card has none. */
  params?: JFETInstanceParams;
}

/**
 * Parse the J card `Jname d g s model [TEMP=val]`.
 *
 * `TEMP` is the ngspice-47 jfet/jfet2 instance temperature. spice-ts has no
 * JFET temperature law, so the circuit accepts only the nominal 27 C (where
 * ngspice applies no temperature scaling) and rejects any other value with a
 * typed error. Every other instance keyword (AREA, M, OFF, IC, DTEMP, ...) is
 * still rejected rather than ignored.
 */
export function parseJFETInstance(tokens: string[], lineNumber: number): ParsedJFETInstance {
  const line = tokens.join(' ');
  const unsupported = (): never => {
    throw new ParseError(
      `Unsupported JFET instance parameter: '${tokens.slice(5).join(' ')}'`, lineNumber, line,
    );
  };
  if (tokens.length < 5) {
    throw new ParseError(`JFET card needs drain, gate, source and model: '${line}'`, lineNumber, line);
  }
  const params: JFETInstanceParams = {};
  for (const token of tokens.slice(5)) {
    const match = /^TEMP=(.+)$/i.exec(token);
    if (!match || params.TEMP !== undefined) unsupported();
    const value = parseNumber(match![1]);
    if (!Number.isFinite(value)) unsupported();
    params.TEMP = value;
  }
  return {
    drain: tokens[1],
    gate: tokens[2],
    source: tokens[3],
    modelName: tokens[4],
    ...(params.TEMP === undefined ? {} : { params }),
  };
}
