import { ParseError } from '../errors.js';
import { NODE_DEPENDENT_EXPRESSION } from './behavioral-expression.js';
import { endOfLineCommentStart } from './end-of-line-comment.js';
import { parseNumber } from './tokenizer.js';

/**
 * ngspice-47 inpcom.c:6952-6988, enabled C= lowering. This is C(expr)*dV/dt,
 * NOT d(C(expr)*V)/dt (Q= has a different lowering). Use the same six ordinary
 * devices, including the derivative probe's RC and the 1e15-ohm shunt, so the
 * existing transient history, AC linearisation and subcircuit binding apply.
 */
export function lowerBehavioralCapacitors<T extends { text: string; line: number; control?: boolean }>(statements: readonly T[]): T[] {
  // No capacitor can be introduced by a continuation: it belongs to the
  // preceding physical card. Avoid cloning/tokenizing the entire deck (and
  // building the generated-name collision set) when there is nothing to lower.
  if (!statements.some(statement => !statement.control && /^\s*c\S*(?:\s|$)/i.test(statement.text))) {
    return [...statements];
  }
  const logical = statements.map(statement => ({ ...statement }));
  let origin: number | undefined;
  let text = '';
  let continuations: number[] = [];
  const flush = () => {
    if (origin === undefined) return;
    const body = /^\s*c\S*\s+\S+\s+\S+\s+(.+)$/i.exec(text)?.[1];
    if (body !== undefined && (NODE_DEPENDENT_EXPRESSION.test(body)
      || /\b(?:time|temper|hertz)\b|\bq\s*=/i.test(body))) {
      logical[origin].text = text;
      continuations.forEach(index => { logical[index].text = ''; });
    }
  };
  // Classify only complete logical cards. Speculative folding leaves ordinary
  // capacitor text and every physical statement's source metadata untouched.
  logical.forEach((statement, index) => {
    const code = statement.text.slice(0, endOfLineCommentStart(statement.text)).trimEnd();
    if (!statement.control && (code.trim() === '' || /^\s*\*/.test(code))) return;
    if (origin !== undefined && !statement.control && /^\s*\+/.test(code)) {
      text += ` ${code.replace(/^\s*\+\s*/, '')}`;
      continuations.push(index);
      return;
    }
    flush();
    origin = !statement.control && /^\s*c\S*(?:\s|$)/i.test(code) ? index : undefined;
    text = code;
    continuations = [];
  });
  flush();
  const occupied = new Set(logical.flatMap(statement => statement.text.toLowerCase().split(/[\s(),={}\[\]]+/)));
  let serial = 0;
  return logical.flatMap(statement => {
    if (statement.control) return [statement];
    const raw = statement.text;
    const code = raw.slice(0, endOfLineCommentStart(raw));
    const head = /^\s*(c\S*)\s+(\S+)\s+(\S+)\s+(.+)$/i.exec(code);
    if (!head) return [statement];
    const [, name, positive, negative, body] = head;
    if (!NODE_DEPENDENT_EXPRESSION.test(body) && !/\b(?:time|temper|hertz)\b|\bq\s*=/i.test(body)) return [statement];
    const fail = (message: string): never => {
      throw new ParseError(`behavioral capacitor '${name}': ${message}`, statement.line, raw);
    };
    const value = /^(?:c\s*=\s*)?(?:\{([^{}]+)\}|'([^']+)')\s*(.*)$/i.exec(body);
    if (!value) return fail('expected a braced or quoted C= expression; Q= is not supported');
    const expression = value[1] ?? value[2];
    const params: Record<string, string> = {};
    let rest = value[3].trim();
    while (rest) {
      const param = /^(m|tc1|tc2)\s*=\s*(\{[^{}]+\}|'[^']+'|[^\s]+)\s*/i.exec(rest);
      if (!param) return fail(`unsupported parameter '${rest}' (supported: m, tc1, tc2)`);
      params[param[1].toLowerCase()] = param[2];
      rest = rest.slice(param[0].length);
    }
    // ngspice-47 inpcom.c:6070-6106 formats explicit numeric m with %15.8e,
    // then :6970-6971 appends e9. INPevaluate consumes only the first exponent
    // of e.g. 2.00000000e+00e9, giving gain 2, NOT 2e9. Preserve that defect
    // for ngspice compatibility; absent m still produces the normal gain 1e9.
    let gain = '1e9';
    if (params.m !== undefined) {
      try {
        const multiplier = parseNumber(params.m);
        if (!Number.isFinite(multiplier)) return fail('m must be a finite numeric literal');
        gain = String(Number(multiplier.toExponential(8)));
      } catch {
        return fail('m must be a finite numeric literal (ngspice-47 compatibility)');
      }
    }
    let names: string[];
    do {
      const stem = `__behavioral_cap_${serial++}`;
      names = [`g${stem}`, `r${stem}`, `c${stem}`, `v${stem}`, `r${stem}_par`, `b${stem}`, `${stem}_1`, `${stem}_2`];
    } while (names.some(name => occupied.has(name)));
    names.forEach(name => occupied.add(name));
    const [g, r, c, v, shunt, b, probe, measure] = names;

    const coefficients = ['tc1', 'tc2'].filter(key => params[key] !== undefined).map(key => ` ${key}=${params[key]}`).join('');
    return [
      `${g} ${probe} 0 ${negative} ${positive} ${gain}`,
      `${r} ${probe} 0 1e-9`,
      `${c} ${probe} ${measure} 1e-6`,
      `${v} ${measure} 0 0`,
      `${shunt} ${negative} ${positive} 1e15`,
      `${b} ${positive} ${negative} i=1e6*i(${v})*(${expression})${coefficients} reciproctc=1`,
    ].map(text => ({ ...statement, text }));
  });
}
