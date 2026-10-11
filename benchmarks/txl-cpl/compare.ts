#!/usr/bin/env tsx
/**
 * Issue #491: compare spice-ts TXL (Y) / CPL (P) transient waveforms with
 * ngspice-47 on identical netlists.
 *
 * usage: pnpm exec tsx benchmarks/txl-cpl/compare.ts <deck> [<deck> ...]
 *
 * The vectors compared are the deck's own `plot` / `.print` v(...) vectors.
 * Example decks run their analysis from a `.control` block (`tran ...`),
 * which spice-ts does not interpret yet (#489). For those, the block is
 * removed and its first `tran` command becomes a `.tran` card; that one
 * transformed netlist is fed to both simulators, so they still see identical
 * circuits. ngspice gets an appended `.control run / wrdata` block only.
 * spice-ts is linearly interpolated onto every ngspice timepoint.
 * Prints one JSON line per deck.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { parse, simulate } from '../../packages/core/src/index.js';

void main();

async function main(): Promise<void> {
  for (const deckPath of process.argv.slice(2)) console.log(JSON.stringify(await compare(deckPath)));
}

async function compare(deckPath: string): Promise<Record<string, unknown>> {
  const lines = readFileSync(deckPath, 'utf8').split('\n');
  const nodes = new Set<string>();
  for (const line of lines) {
    if (/^\s*(plot|\.print)/i.test(line)) for (const m of line.matchAll(/v\(([^)]+)\)/gi)) nodes.add(m[1].toLowerCase());
  }
  const nodeList = [...nodes];
  let inControl = false;
  let tranCommand = '';
  const kept: string[] = [];
  for (const line of lines) {
    if (/^\s*\.control/i.test(line)) { inControl = true; continue; }
    if (/^\s*\.endc/i.test(line)) { inControl = false; continue; }
    if (inControl) {
      if (!tranCommand && /^\s*tran\b/i.test(line)) tranCommand = line.trim();
      continue;
    }
    kept.push(line);
  }
  const hasTranCard = kept.some(line => /^\s*\.tran\b/i.test(line));
  const body = kept.join('\n').replace(/^\.end\s*$/im, '')
    + (!hasTranCard && tranCommand ? `\n.${tranCommand}\n` : '');
  const record: Record<string, unknown> = {
    deck: basename(deckPath),
    nodes: nodeList,
    controlTranMovedToCard: !hasTranCard && tranCommand !== '',
  };

  const workspace = mkdtempSync(join(tmpdir(), 'spicets-txl-cpl-'));
  try {
    const dataPath = join(workspace, 'out.dat');
    const vectors = nodeList.map(node => `v(${node})`).join(' ');
    writeFileSync(join(workspace, 'deck.cir'),
      `${body}\n.control\nrun\nset wr_singlescale\nset wr_vecnames\nwrdata ${dataPath} ${vectors}\nquit\n.endc\n.end\n`);
    let started = Date.now();
    try {
      execFileSync('ngspice', ['-b', join(workspace, 'deck.cir')], { stdio: 'ignore', timeout: 600_000 });
      record.ngspiceMs = Date.now() - started;
    } catch (error) {
      record.ngspice = `failed: ${String(error).slice(0, 200)}`;
      return record;
    }
    const rows = readFileSync(dataPath, 'utf8').trim().split('\n').slice(1)
      .map(line => line.trim().split(/\s+/).map(Number));

    started = Date.now();
    let transient;
    try {
      transient = (await simulate(parse(`${body}\n.end\n`))).transient;
    } catch (error) {
      record.spiceTs = `failed: ${(error as Error).constructor.name}: ${(error as Error).message.slice(0, 300)}`;
      return record;
    }
    record.spiceTsMs = Date.now() - started;
    if (!transient) throw new Error(`${deckPath}: spice-ts returned no transient result`);
    const time = [...transient.time];
    const names = [...transient.voltages.keys()];
    let worst = 0;
    const perNode: Record<string, { maxAbsV: number; swingV: number }> = {};
    nodeList.forEach((node, k) => {
      const key = names.find(name => name.toLowerCase() === node) ?? node;
      const values = [...transient.voltage(key)];
      const reference = rows.map(row => row[k + 1]);
      const swing = Math.max(...reference) - Math.min(...reference);
      let maxAbs = 0;
      for (const row of rows) maxAbs = Math.max(maxAbs, Math.abs(interpolate(time, values, row[0]) - row[k + 1]));
      perNode[node] = { maxAbsV: maxAbs, swingV: swing };
      worst = Math.max(worst, maxAbs / Math.max(swing, 1e-12));
    });
    record.perNode = perNode;
    record.worstMaxErrOverSwingPct = Number((worst * 100).toFixed(3));
    record.points = { ngspice: rows.length, spiceTs: time.length };
    return record;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function interpolate(time: number[], values: number[], t: number): number {
  if (t <= time[0]) return values[0];
  let lo = 0;
  let hi = time.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (time[mid] <= t) lo = mid; else hi = mid;
  }
  if (t >= time[hi]) return values[hi];
  const f = (t - time[lo]) / (time[hi] - time[lo]);
  return values[lo] + f * (values[hi] - values[lo]);
}
