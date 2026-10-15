import { ControlScriptError } from './errors.js';
import type { ControlSourceLine } from './source.js';

/** Split on whitespace outside double quotes and parentheses. */
export function splitWords(text: string): string[] {
  const words: string[] = [];
  let word = '';
  let quoted = false;
  let depth = 0;
  for (const character of text) {
    if (character === '"') quoted = !quoted;
    if (!quoted && character === '(') depth++;
    if (!quoted && character === ')') depth = Math.max(0, depth - 1);
    if (!quoted && depth === 0 && /\s/.test(character)) {
      if (word !== '') words.push(word);
      word = '';
      continue;
    }
    word += character;
  }
  if (word !== '') words.push(word);
  return words;
}

export function unquote(word: string): string {
  return word.replace(/"/g, '');
}

/** Shared assignment syntax for set and the loading-time pre_set command. */
export function setArguments(rest: string, line: ControlSourceLine): { name: string; rawValue?: string }[] {
  return splitWords(rest.replace(/\s*=\s*/g, '=')).map(word => {
    const separator = word.indexOf('=');
    const name = (separator < 0 ? word : word.slice(0, separator)).toLowerCase();
    const rawValue = separator < 0 ? undefined : word.slice(separator + 1);
    if (name === '') throw new ControlScriptError(`invalid set argument '${word}'`, line.lineNumber, line.text);
    return { name, rawValue };
  });
}
