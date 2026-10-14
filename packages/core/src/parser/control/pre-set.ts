import { UnsupportedControlCommandError } from './errors.js';
import { setArguments } from './set-arguments.js';
import type { ControlSourceLine } from './source.js';

/**
 * ngspice-47 src/frontend/inp.c:786-858 strips pre_ and executes those lines
 * in source order before circuit setup, independently of normal control flow.
 * This subset accepts only known presentation variables (no circuit effect).
 * Solver/loading/compatibility settings and unknown variables are rejected,
 * rather than incorrectly applying them to an already-loaded circuit.
 *
 * strict_errorhandling (options.c:329-335) enables fatal frontend/source errors
 * and exits on a prior spinit error. spice-ts has no spinit/process exit; its
 * parser already throws on fatal input errors, so this flag preserves that
 * fail-fast contract. It does not promote model warnings to errors (inp.c).
 */
const PRESENTATION_VARIABLES = new Set([
  'strict_errorhandling', 'numdgt', 'noaskquit', 'nomoremode', 'nopage',
  'xbrushwidth', 'xgridwidth', 'hcopydevtype', 'hcopypscolor', 'hcopypslandscape',
]);

export function validatePreSet(line: ControlSourceLine): void {
  for (const { name } of setArguments(line.text.slice('pre_set'.length).trim(), line)) {
    if (PRESENTATION_VARIABLES.has(name) || /^color\d+$/.test(name)) continue;
    throw new UnsupportedControlCommandError(
      'pre_set', `variable '${name}': its loading-time effect is not implemented`, line.lineNumber, line.text,
    );
  }
}
