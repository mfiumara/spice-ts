#!/usr/bin/env tsx
/**
 * Issue #747 reference generator: runs every deck in ./decks through ngspice-47 unchanged
 * (`ngspice -b -r <raw> <deck>`, ASCII rawfile, 16 significant digits) and writes
 * ./references/<deck>.json. packages/core/src/parser/model-level-limit-747.test.ts reads the same
 * deck bytes and these references, so the unit test and ngspice see identical input.
 *
 * Usage (repository root, ngspice-47 on PATH):
 *   pnpm exec tsx benchmarks/results/issue-747/generate-references.ts
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNgspiceRaw } from '../../comparison-harness.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DECKS = resolve(HERE, 'decks');
const OUT = resolve(HERE, 'references');

function main(): void {
  const version = execFileSync('ngspice', ['-v'], { encoding: 'utf8' }).match(/ngspice-\d+/)?.[0] ?? 'unknown';
  if (version !== 'ngspice-47') throw new Error(`expected ngspice-47 on PATH, found ${version}`);
  mkdirSync(OUT, { recursive: true });
  const home = mkdtempSync(resolve(tmpdir(), 'spice-ts-747-'));
  try {
    writeFileSync(resolve(home, '.spiceinit'), 'set filetype=ascii\n');
    for (const file of readdirSync(DECKS).filter(name => name.endsWith('.cir')).sort()) {
      const deck = readFileSync(resolve(DECKS, file));
      const raw = resolve(home, `${file}.raw`);
      const run = spawnSync('ngspice', ['-b', '-r', raw, resolve(DECKS, file)], {
        cwd: home, env: { ...process.env, HOME: home }, encoding: 'utf8',
      });
      if (run.status !== 0) throw new Error(`${file}: ngspice exited ${run.status}\n${run.stderr}`);
      const log = `${run.stdout}${run.stderr}`;
      const plots = parseNgspiceRaw(readFileSync(raw, 'utf8'));
      if (plots.length !== 1) throw new Error(`${file}: expected one plot, got ${plots.length}`);
      const [plot] = plots;
      const complex = Object.values(plot.signals).some(values => values.some(value => value.im !== 0));
      const signals = Object.fromEntries(Object.entries(plot.signals).map(([name, values]) => [
        name, complex ? values.map(value => [value.re, value.im]) : values.map(value => value.re),
      ]));
      const reference = {
        schema: 'spice-ts-issue-747-reference/v1',
        deck: `decks/${file}`,
        deckSha256: createHash('sha256').update(deck).digest('hex'),
        ngspice: version,
        command: `ngspice -b -r <raw> decks/${file} (HOME=<tmp> with .spiceinit "set filetype=ascii")`,
        levelNotice: log.includes('Level must be < 99'),
        plot: plot.plotName,
        grid: plot.grid,
        signals,
      };
      writeFileSync(resolve(OUT, file.replace(/\.cir$/, '.json')), `${JSON.stringify(reference, null, 1)}\n`);
      process.stderr.write(`${file}: ${plot.plotName}, ${plot.grid.length} points\n`);
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

main();
