/** Fetch-only diagnostics boundary. Never serialize raw simulator messages/source excerpts. */
import { createHash } from 'node:crypto';

type DiagnosticCode = 'completed' | 'parse-error' | 'timestep-too-small' | 'failed';
export type OracleDiagnostic = { code: DiagnosticCode; sha256: string };

export function oracleDiagnostic(text: string, completed = false): OracleDiagnostic {
  const code: DiagnosticCode = completed ? 'completed'
    : /timestep\s*too\s*small/i.test(text) ? 'timestep-too-small'
    : /syntax error|error on line|unknown parameter|undefined parameter/i.test(text) ? 'parse-error'
    : 'failed';
  return { code, sha256: createHash('sha256').update(text).digest('hex') };
}
