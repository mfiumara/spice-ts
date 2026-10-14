/** Keep only source-free ngspice status lines. Unknown output is never redistributed. */
export function sanitizeDiagnostics(output: string): string {
  const number = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?';
  const safe = [
    /^Note: gnd in a subcircuit is not set to 0 automatically$/,
    /^Note: Compatibility modes selected: ps lt$/,
    /^Reducing trtol to 1 for xspice 'A' devices$/,
    new RegExp(`^Doing analysis at TEMP = ${number} and TNOM = ${number}$`, 'i'),
    /^Using SPARSE 1\.3 as Direct Linear Solver$/,
    /^No\. of Data (?:Columns|Rows) : \d+$/,
    new RegExp(`^Total (?:analysis|elapsed) time \\(seconds\\) = ${number}$`, 'i'),
    /^Warning: Model issue on line \d+ :$/,
    /^run simulation\(s\) aborted$/,
    /^\[source-bearing or unrecognized diagnostic lines omitted\]$/,
    /^unrecognized model parameter ignored \[source omitted\]$/,
    new RegExp(`^doAnalyses: TRAN:  Timestep too small; time = ${number}, timestep = ${number}$`, 'i'),
  ];
  const lines: string[] = [];
  let omitted = false;
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (safe.some(pattern => pattern.test(line))) lines.push(line);
    else if (/^unrecognized parameter\b/i.test(line)) lines.push('unrecognized model parameter ignored [source omitted]');
    else {
      // Preserve failure times, but never the trailing echoed device/source text.
      const timestep = line.match(new RegExp(`^(doAnalyses: TRAN:  Timestep too small; time = ${number}, timestep = ${number})(?::|$)`, 'i'));
      if (timestep) lines.push(timestep[1]);
      else omitted = true;
    }
  }
  if (omitted) lines.push('[source-bearing or unrecognized diagnostic lines omitted]');
  return lines.join('\n') + '\n';
}
