/**
 * PSpice model-card temperatures as ngspice-47's PSpice compatibility mode
 * rewrites them (frontend/inpcompat.c pspice_compat): on every `.model` line
 * the first `t_abs` becomes `temp`, or else the first `t_rel_global` becomes
 * `dtemp`, or else the first `t_measured` becomes `tnom`. Only that one
 * occurrence is renamed (an `else if` chain over `search_plain_identifier`);
 * any further `t_abs`/`t_rel_global`/`t_measured` keeps its PSpice name, which
 * no ngspice device knows, so inpgmod.c reports "unrecognized parameter (...)
 * - ignored" and drops it. `T_REL_LOCAL` (AKO models) is not translated.
 *
 * Only parameter names are matched; ngspice would also rename a model whose
 * name is exactly `t_abs`, which no real library relies on.
 */
const TRANSLATIONS = [
  ['T_ABS', 'TEMP'],
  ['T_REL_GLOBAL', 'DTEMP'],
  ['T_MEASURED', 'TNOM'],
] as const;

const PSPICE_KEYS: ReadonlySet<string> = new Set(TRANSLATIONS.map(([from]) => from));

export interface PspiceModelTemperatureTranslation {
  /** Model-card body tokens after the rename, without the dropped keys. */
  readonly body: string[];
  /** The renamed parameter, if any (upper-case PSpice and ngspice names). */
  readonly translated?: { readonly from: string; readonly to: string };
  /** PSpice keys left untranslated and dropped, upper-case, in card order. */
  readonly ignored: string[];
}

function keyOf(token: string): string {
  const eq = token.indexOf('=');
  return (eq > 0 ? token.slice(0, eq) : token).toUpperCase();
}

/** True when a bare `name` token is followed by its value (`T_ABS 50`). */
function takesBareValue(body: readonly string[], index: number): boolean {
  const next = body[index + 1];
  return !body[index].includes('=') && next !== undefined && !next.includes('=') && /^[+\-.\d]/.test(next);
}

/** Apply inpcompat.c's T_ABS / T_REL_GLOBAL / T_MEASURED rename to `.model` body tokens. */
export function translatePspiceModelTemperatures(body: readonly string[]): PspiceModelTemperatureTranslation {
  if (!body.some(token => PSPICE_KEYS.has(keyOf(token)))) return { body: [...body], ignored: [] };

  let target = -1;
  let translated: { from: string; to: string } | undefined;
  for (const [from, to] of TRANSLATIONS) {
    target = body.findIndex(token => keyOf(token) === from);
    if (target >= 0) {
      translated = { from, to };
      break;
    }
  }

  const out: string[] = [];
  const ignored: string[] = [];
  for (let index = 0; index < body.length; index++) {
    const token = body[index];
    const key = keyOf(token);
    if (index === target) {
      out.push(`${translated!.to}${token.slice(key.length)}`);
    } else if (PSPICE_KEYS.has(key)) {
      ignored.push(key);
      if (takesBareValue(body, index)) index++;
    } else {
      out.push(token);
    }
  }
  return { body: out, translated, ignored };
}

/** ngspice-47's inpgmod.c warning for a PSpice key inpcompat.c left untranslated. */
export function ignoredPspiceTemperatureWarning(name: string, type: string, keys: readonly string[]): string {
  return `Model '${name}' (${type}): `
    + keys.map(key => `unrecognized parameter (${key.toLowerCase()}) - ignored`).join(', ')
    + ', as ngspice-47 does (inpcompat.c renames only the first T_ABS, T_REL_GLOBAL or T_MEASURED on a .model card)';
}
