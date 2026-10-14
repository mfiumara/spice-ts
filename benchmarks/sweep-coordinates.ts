import { parseSpiceNumber } from './fine-reference.js';
import { monotonicSegments } from './comparison-harness.js';

/** Coordinates declared by straight-line literal DC commands. Not an interpreter.
 * Dynamic scripts deliberately retain reset-ordinal alignment rather than inventing coordinates.
 */
export function declaredSecondaryGrid(text: string, plotId: string, primary: number[]): number[] | undefined {
  if (!/^dc\d+$/.test(plotId)) return undefined;
  const lines = text.split(/\r?\n/).slice(1).map(line => line.trim());
  if (lines.some(line => /^(?:foreach|while|repeat|dowhile|if|goto|run|reset|source)\b/i.test(line))) return undefined;
  const commands = lines.filter(line => /^dc\s+/i.test(line));
  const tokens = commands[Number(plotId.slice(2)) - 1]?.split(/\s+/);
  if (!tokens || tokens.length !== 9) return undefined;
  const [start, stop, step] = tokens.slice(6).map(parseSpiceNumber);
  if (start === undefined || stop === undefined || step === undefined || step === 0 || (stop - start) * step < 0) return undefined;
  const groups = monotonicSegments(primary);
  // ngspice DC increments the outer coordinate by += step. The observed resets determine
  // the number of groups; reject commands that do not reach the declared outer stop.
  const coordinates: number[] = [];
  // ngspice-47 dctrcurv.c uses the absolute DBL_EPSILON * 1e3 endpoint check.
  const stopTolerance = Number.EPSILON * 1e3;
  let value = start;
  for (let index = 0; index < groups.length; index++, value += step) {
    if ((value - stop) * Math.sign(step) > stopTolerance) return undefined;
    coordinates.push(value);
  }
  if ((value - stop) * Math.sign(step) <= stopTolerance) return undefined;
  return groups.flatMap((group, index) => Array.from({ length: group.end - group.start }, () => coordinates[index]));
}
