import { ParseError } from '../errors.js';
import { NODE_DEPENDENT_EXPRESSION } from './behavioral-expression.js';
import { endOfLineCommentStart } from './end-of-line-comment.js';

/**
 * ngspice-47 inpcom.c:6952-6988, enabled C= lowering. This is C(expr)*dV/dt,
 * NOT d(C(expr)*V)/dt (Q= has a different lowering). Use the same six ordinary
 * devices, including the derivative probe's RC and the 1e15-ohm shunt, so the
 * existing transient history, AC linearisation and subcircuit binding apply.
 */
export function lowerBehavioralCapacitors<T extends { text: string; line: number; control?: boolean }>(statements: readonly T[]): T[] {
  const logical: T[] = [];
  let previous: T | undefined;
  for (const statement of statements) {
    const previousBody = previous && /^\s*c\S*\s+\S+\s+\S+\s+(.+)$/i.exec(previous.text)?.[1];
    const behavioral = previousBody !== undefined && (NODE_DEPENDENT_EXPRESSION.test(previousBody)
      || /\b(?:time|temper|hertz)\b|\bq\s*=/i.test(previousBody));
    if (previous && behavioral && !statement.control && /^\s*\+/.test(statement.text)) {
      previous.text = previous.text.slice(0, endOfLineCommentStart(previous.text)) + ` ${statement.text.replace(/^\s*\+\s*/, '')}`;
      logical.push({ ...statement, text: '' });
    } else {
      const copy = { ...statement };
      logical.push(copy);
      if (copy.text.trim() !== '' && !/^\s*\*/.test(copy.text)) previous = copy;
    }
  }
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
      // ngspice-47's explicit m= produces an ambiguous double-exponent gain
      // (e.g. 2.00000000e+00e9). Do not silently substitute the intended gain.
      const param = /^(tc1|tc2)\s*=\s*(\{[^{}]+\}|'[^']+'|[^\s]+)\s*/i.exec(rest);
      if (!param) return fail(`unsupported parameter '${rest}' (supported: tc1, tc2)`);
      params[param[1].toLowerCase()] = param[2];
      rest = rest.slice(param[0].length);
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
      `${g} ${probe} 0 ${negative} ${positive} 1e9`,
      `${r} ${probe} 0 1e-9`,
      `${c} ${probe} ${measure} 1e-6`,
      `${v} ${measure} 0 0`,
      `${shunt} ${negative} ${positive} 1e15`,
      `${b} ${positive} ${negative} i=1e6*i(${v})*(${expression})${coefficients} reciproctc=1`,
    ].map(text => ({ ...statement, text }));
  });
}
