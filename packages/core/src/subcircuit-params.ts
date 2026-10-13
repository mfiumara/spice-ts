import { evaluateExpression } from './parser/expression.js';
import { parseNumber } from './parser/tokenizer.js';

const ASSIGNMENT = /([A-Za-z_]\w*)\s*=\s*(\{[^}]*\}|\S+)/g;
/** An identifier not preceded by a word character or a dot (so not the `k` of `3k` or `e3` of `1e3`). */
const IDENTIFIER = /(?<![\w.])[A-Za-z_]\w*/g;

interface BodyParam {
  name: string;
  expression: string;
}

/** The assignments of one subcircuit `.param` card body (`a=1 b={a*2}`). */
function paramAssignments(content: string): BodyParam[] {
  const assignments = [...content.matchAll(ASSIGNMENT)];
  if (assignments.length === 0) return [];
  // A single assignment reads the whole rest of the card, as at the top level.
  const pairs = assignments.length === 1
    ? [[assignments[0][1], content.slice(content.indexOf('=') + 1).trim()]]
    : assignments.map(match => [match[1], match[2]]);
  return pairs.map(([name, value]) => ({
    name: name.toUpperCase(),
    expression: value.startsWith('{') && value.endsWith('}') ? value.slice(1, -1) : value,
  }));
}

/**
 * Evaluates the `.param` cards of one subcircuit body into `scope`, before any
 * element of that body, in dependency order.
 *
 * ngspice-47 inpcom.c `inp_reorder_params_subckt` moves every `.param` card of
 * a subcircuit body to the top of the body and `inp_sort_params` orders them
 * so each follows the parameters it references; a `.param` below the element
 * using it, or one referencing a later `.param`, is therefore valid (#857).
 * A name defined twice takes its last definition, as sequential evaluation of
 * the reordered cards gives.
 *
 * @param cards - Contents of the body's `.param` cards (text after `.param`), in deck order
 * @param scope - Instance scope (subcircuit parameters, enclosing scopes via the prototype)
 */
export function evaluateSubcircuitParams(cards: readonly string[], scope: Record<string, number>): void {
  const pending = new Map<string, BodyParam>();
  for (const card of cards) {
    for (const param of paramAssignments(card)) {
      pending.delete(param.name);
      pending.set(param.name, param);
    }
  }
  const visiting: string[] = [];
  const resolve = (param: BodyParam): void => {
    if (visiting.includes(param.name)) {
      throw new Error(`Circular .param dependency: ${[...visiting, param.name].join(' -> ')}`);
    }
    visiting.push(param.name);
    for (const [identifier] of param.expression.matchAll(IDENTIFIER)) {
      const dependency = pending.get(identifier.toUpperCase());
      if (dependency !== undefined && dependency !== param) resolve(dependency);
    }
    visiting.pop();
    if (!pending.has(param.name)) return;
    pending.delete(param.name);
    try {
      scope[param.name] = evaluateExpression(param.expression, scope);
    } catch {
      scope[param.name] = parseNumber(param.expression);
    }
  };
  for (const param of [...pending.values()]) {
    if (pending.has(param.name)) resolve(param);
  }
}
