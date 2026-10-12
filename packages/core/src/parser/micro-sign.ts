const MICRO_SIGN = /\u00b5/g;
const INCLUDE_OR_LIB_CARD = /^\s*\.(?:include|lib)\b/i;

/**
 * Rewrite the micro sign U+00B5 (`µ`) to `u`, as ngspice-47 inpcom.c
 * `utf8_check()` does once `.include`/`.lib` files are read: on every card
 * after the title line except `*` comments, so `2µ`, `1µs` and `{3µ*2}` are
 * micro values (#508). `.include`/`.lib` cards keep their text, because
 * ngspice resolves file names and sections before the rewrite. The Greek
 * small letter mu U+03BC is not translated by ngspice-47 and is left alone.
 */
export function translateMicroSign(text: string, skipFirstLine = false): string {
  if (!text.includes('\u00b5')) return text;
  return text.split('\n').map((line, index) => {
    if (skipFirstLine && index === 0) return line;
    const trimmed = line.trimStart();
    if (trimmed.startsWith('*') || INCLUDE_OR_LIB_CARD.test(trimmed)) return line;
    return line.replace(MICRO_SIGN, 'u');
  }).join('\n');
}
