// SPDX-License-Identifier: MIT
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseAsync } from '../../packages/core/src/parser/index.js';
import { simulate } from '../../packages/core/src/simulate.js';
import { Diode } from '../../packages/core/src/devices/diode.js';
import { MNAAssembler } from '../../packages/core/src/mna/assembler.js';
import { GilbertPeierlsSolver } from '../../packages/core/src/solver/gilbert-peierls.js';
import type { CscMatrix } from '../../packages/core/src/solver/csc-matrix.js';

interface Observation {
  scale: number; phase: string | undefined; time: number; dt: number;
  old: number[]; stateBefore: Record<string, unknown>; stateAfter?: Record<string, unknown>;
}
const fields = ['previousJunctionVoltage', 'stampedJunctionVoltage', 'acceptedJunctionVoltage', 'acceptedCharge', 'acceptedChargeCurrent', 'newtonJunctionVoltage'];
const state = (d: Diode) => Object.fromEntries(fields.map(f => [f, Reflect.get(d, f) ?? null]));
const originalStamp = Diode.prototype.stamp;
const originalGet = MNAAssembler.prototype.getSparseSolver;
const originalFactor = GilbertPeierlsSolver.prototype.factorize;
let assembler: MNAAssembler;
let names: string[] = [];
let ids: number[] = [];
let latest: Observation | undefined;
const rows: object[] = [];
Diode.prototype.stamp = function (ctx) {
  if (this.name.toLowerCase() !== 'd183' && this.name.toLowerCase() !== 'd1') return originalStamp.call(this, ctx);
  ids = [...this.nodes];
  const external = names.findIndex(n => n === 'Net-_D183-K_' || n === 'a');
  if (!ids.includes(external)) ids.push(external);
  if (ids.length !== 3) {
    const alternate = names.findIndex(n => n === 'Net-_D183-A_' || n === 'k');
    if (!ids.includes(alternate)) ids.push(alternate);
  }
  latest = { scale: ctx.sourceScale ?? 1, phase: ctx.operatingPointPhase, time: ctx.time, dt: ctx.dt,
    old: ids.map(i => ctx.getVoltage(i)), stateBefore: state(this) };
  originalStamp.call(this, ctx);
  latest.stateAfter = state(this);
};
MNAAssembler.prototype.getSparseSolver = function () { assembler = this; return originalGet.call(this); };
GilbertPeierlsSolver.prototype.factorize = function (matrix: CscMatrix) {
  const block = ids.flatMap(r => ids.map(c => {
    for (let p = matrix.colPtr[c]; p < matrix.colPtr[c + 1]; p++) if (matrix.rowIdx[p] === r) return matrix.values[p];
    return 0;
  }));
  const row = { ...latest, scale: assembler.sourceScale, ids: ids.map(i => names[i]), matrix: block,
    rhs: ids.map(i => assembler.b[i]), error: null as string | null };
  rows.push(row);
  try { return originalFactor.call(this, matrix); }
  catch (e) { row.error = String(e); throw e; }
};
try {
  const label = process.argv[2];
  const directory = label === 'island' ? resolve('benchmarks/native-state-917') : resolve('benchmarks/corpus/ngspice-bugs/fetched/795');
  const path = resolve(directory, label === 'island' ? 'island.cir' : `${label}_37.local.cir`);
  const deck = readFileSync(path, 'utf8');
  const resolveInclude = async (path: string) => readFileSync(resolve(directory, path), 'utf8');
  const compiled = (await parseAsync(deck, resolveInclude)).compile();
  names = [...compiled.nodeNames, ...compiled.branchNames];
  let error: string | null = null;
  try { await simulate(deck, { resolveInclude }); } catch (e) { error = String(e); }
  writeFileSync(process.argv[3], JSON.stringify({ label, error, factors: rows.length, rows }) + '\n');
  console.log(JSON.stringify({ label, error, factors: rows.length }));
} finally {
  Diode.prototype.stamp = originalStamp;
  MNAAssembler.prototype.getSparseSolver = originalGet;
  GilbertPeierlsSolver.prototype.factorize = originalFactor;
}
