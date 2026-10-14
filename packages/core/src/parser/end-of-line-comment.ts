/** First comment delimiter, or the physical line length when there is none. */
export function endOfLineCommentStart(line: string): number {
  // ngspice permits embedded dollars in identifiers (m$615, v$d5).
  // A dollar starts a comment only at the start of a token.
  const dollar = /(?:^|[\s,])\$/.exec(line);
  let start = dollar ? dollar.index + dollar[0].length - 1 : line.length;
  const semicolon = line.indexOf(';');
  if (semicolon >= 0 && semicolon < start) start = semicolon;
  const slashes = line.indexOf('//');
  if (slashes >= 0 && slashes < start) start = slashes;
  return start;
}
