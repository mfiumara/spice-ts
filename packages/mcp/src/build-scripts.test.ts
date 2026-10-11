import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Regression for #517: `pnpm -r build` already builds @spice-ts/core and
// @spice-ts/protocol before this package (workspace topological order). Any
// lifecycle script here that rebuilds a sibling package re-runs tsup's `clean`
// on its dist/ while other workspace packages may be bundling it, which races.
const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { scripts: Record<string, string>; dependencies: Record<string, string> };

describe('@spice-ts/mcp package scripts (#517)', () => {
  it('never rebuild sibling workspace packages from a lifecycle script', () => {
    const offenders = Object.entries(pkg.scripts).filter(([, cmd]) =>
      /(-C|--dir|--filter)\s+\S*\.\.\/|\bcd\s+\.\.\//.test(cmd),
    );
    expect(offenders).toEqual([]);
  });

  it('declares core and protocol as workspace deps so pnpm -r orders them first', () => {
    expect(pkg.dependencies['@spice-ts/core']).toBe('workspace:*');
    expect(pkg.dependencies['@spice-ts/protocol']).toBe('workspace:*');
  });
});
