import { parseSpiceNumber } from './fine-reference.js';
import { monotonicSegments } from './comparison-harness.js';

/** Coordinates declared by straight-line literal DC commands. Not an interpreter.
 * Dynamic scripts deliberately retain reset-ordinal alignment rather than inventing coordinates.
 */
export function declaredSecondaryGrid(text: string, plotId: string, primary: number[], provenance?: 'batch-dot'): number[] | undefined {
  const numbered = /^dc([1-9]\d*)$/.exec(plotId);
  if (!numbered && plotId !== 'DC transfer characteristic') return undefined;
  const lines = text.split(/\r?\n/).slice(1).map(line => line.trim());
  const batchDot = provenance === 'batch-dot' && lines.some(line => /^\.dc\s+/i.test(line));
  let control = false;
  const commands: string[] = [];
  const cards: string[] = [];
  for (const line of lines) {
    if (/^\.control\b/i.test(line)) control = true;
    else if (/^\.endc\b/i.test(line)) control = false;
    else if (batchDot && control) {
      // A literal control run does not change dot-card coordinates. Dynamic
      // execution or loading another circuit still makes provenance uncertain.
      if (/^(?:if|else|foreach|while|repeat|dowhile|goto|reset|source)\b/i.test(line)) return undefined;
      continue;
    }
    else if (/^(?:\.?if|else|foreach|while|repeat|dowhile|goto|run|reset|source)\b/i.test(line)) return undefined;
    else if (control && /^dc\s+/i.test(line)) commands.push(line);
    else if (!control && /^\.dc\s+/i.test(line)) cards.push(line);
  }
  // Dot cards have descriptive raw names, not command ordinals. Mixed provenance or
  // repeated dot cards cannot be identified unambiguously from the raw plot label.
  if (cards.length && (cards.length !== 1 || commands.length)) return undefined;
  // -b -r exports dot-card results to the batch raw file, not interactive control
  // plots. Only that caller may assert this provenance; legacy callers stay strict.
  if (batchDot && cards.length !== 1) return undefined;
  const declarations = cards.length ? cards : commands;
  if (!numbered && declarations.length !== 1) return undefined;
  const tokens = declarations[numbered ? Number(numbered[1]) - 1 : 0]?.split(/\s+/);
  if (!tokens || tokens.length !== 9) return undefined;
  if (tokens.slice(2, 5).some(token => parseSpiceNumber(token) === undefined)) return undefined;
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
