import { ParseError } from '../errors.js';

/** ngspice-47 inp.c inp_spsource: optional '=', strtod, and a 27 C fallback. */
export function tempDirective(text: string, line: number): { value: number; warning?: string } | undefined {
  const match = /^\s*\.temp(?=\s|=|$)\s*=?\s*(.*?)\s*$/i.exec(text);
  if (!match) return undefined;
  const raw = match[1];
  if (/\s/.test(raw)) {
    throw new ParseError(
      'Unsupported multi-temperature .temp card: supply one temperature; ngspice-47 warns and falls back to 27 C for multiple values',
      line, text,
    );
  }
  if (raw === '') return { value: 0 };
  // Unlike .options TEMP, this card uses strtod, not SPICE scale/unit suffixes.
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= -273.15) {
      throw new ParseError(`Invalid circuit temperature: ${raw} C`, line, text);
    }
    return { value };
  }
  return { value: 27, warning: `Could not set .temp temperature to '${raw}'; set to default 27 C instead (ngspice-47)` };
}
