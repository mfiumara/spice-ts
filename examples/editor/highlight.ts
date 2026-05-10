// SPICE-flavoured syntax highlighter for the netlist editor. Tokenizes line by
// line, preserving original whitespace exactly so the rendered <pre> aligns
// character-for-character with the transparent <textarea> overlaid on top of
// it. Returns an HTML string suitable for `dangerouslySetInnerHTML`.

const DEVICE_PREFIX = /^[VRCLMDEFGHQIBJSTKWXOY]/i;
// Bold-color directives that meaningfully change simulation behaviour (.step
// for parametric sweeps, .model for device parameters).
const DIRECTIVE_BOLD = /^\.(step|model)\b/i;

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

function highlightLine(line: string): string {
  const wsMatch = line.match(/^(\s*)/);
  const indent = wsMatch ? wsMatch[1] : '';
  const rest = line.slice(indent.length);
  if (rest.length === 0) return esc(line);

  // Comment — `*` at the start of (post-indent) text colors the whole line.
  if (rest.startsWith('*')) {
    return indent + `<span class="hl-comment">${esc(rest)}</span>`;
  }

  // Split the rest into alternating non-space / space chunks. Even indices
  // are tokens, odd indices are whitespace separators. Preserves the exact
  // spacing the user typed.
  const parts = rest.split(/(\s+)/);
  const nonSpaceIdx: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].length > 0 && !/^\s+$/.test(parts[i])) nonSpaceIdx.push(i);
  }
  if (nonSpaceIdx.length === 0) return esc(line);

  const firstIdx = nonSpaceIdx[0];
  const lastIdx = nonSpaceIdx[nonSpaceIdx.length - 1];
  const firstTok = parts[firstIdx];
  const upper = firstTok.toUpperCase();

  // Directive line — `.tran`, `.ac`, `.dc`, `.step`, `.model`, etc.
  if (upper.startsWith('.')) {
    const cls = DIRECTIVE_BOLD.test(upper) ? 'hl-directive' : 'hl-keyword';
    return indent + `<span class="${cls}">${esc(rest)}</span>`;
  }

  // Device line — `V1 in 0 5`, `R1 in out 1k`, etc. First token is the
  // device reference, last is the value, anything in between is a node.
  if (DEVICE_PREFIX.test(firstTok)) {
    let out = indent;
    for (let i = 0; i < parts.length; i++) {
      const text = parts[i];
      if (i === firstIdx) {
        out += `<span class="hl-ref">${esc(text)}</span>`;
      } else if (i === lastIdx && nonSpaceIdx.length > 1) {
        out += `<span class="hl-value">${esc(text)}</span>`;
      } else if (nonSpaceIdx.includes(i)) {
        out += `<span class="hl-node">${esc(text)}</span>`;
      } else {
        out += esc(text);
      }
    }
    return out;
  }

  // Anything else — leave plain.
  return esc(line);
}

export function highlight(netlist: string): string {
  // Trailing empty line preserved so the cursor stays positioned correctly
  // when the user presses Enter at end-of-buffer.
  return netlist.split('\n').map(highlightLine).join('\n');
}
