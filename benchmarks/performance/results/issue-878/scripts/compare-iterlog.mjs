#!/usr/bin/env node
// Issue #878: compare per-timepoint transient Newton iterations of spice-ts
// (spice-ts-iterlog.mjs) and the instrumented ngspice-47 build (ITERLOG lines
// from dctran.c, see README.md).
//
//   node compare-iterlog.mjs <spice-ts-log> <ngspice-log> [--points]
//
// Points are matched in order; every accepted ngspice point must be at the
// same time as the spice-ts point of the same index (relative 1e-9), else the
// grids differ and the script says where. ngspice prints one line per NIiter
// call, so a rejected attempt is folded into the next accepted point.
import { readFileSync } from 'node:fs';

const [stsPath, ngPath] = process.argv.slice(2);
const showPoints = process.argv.includes('--points');
const parse = (path) => readFileSync(path, 'utf8').split('\n')
  .filter(line => line.startsWith('ITERLOG'))
  .map(line => line.split(/\s+/).slice(1).map(Number));

const sts = parse(stsPath).map(([time, , iterations]) => ({ time, iterations }));
const ng = [];
let carry = 0;
for (const [time, , iterations, converged] of parse(ngPath)) {
  carry += iterations;
  if (converged !== 0) continue;
  ng.push({ time, iterations: carry });
  carry = 0;
}

const histogram = (points) => {
  const counts = new Map();
  for (const { iterations } of points) counts.set(iterations, (counts.get(iterations) ?? 0) + 1);
  return [...counts].sort(([a], [b]) => a - b).map(([k, v]) => `${k}:${v}`).join(' ');
};
const total = (points) => points.reduce((sum, { iterations }) => sum + iterations, 0);

console.log(`spice-ts  points ${sts.length} iterations ${total(sts)} histogram ${histogram(sts)}`);
console.log(`ngspice-47 points ${ng.length} iterations ${total(ng)} histogram ${histogram(ng)}`);
const n = Math.min(sts.length, ng.length);
let sameGrid = sts.length === ng.length;
let more = 0, fewer = 0, equal = 0;
const pairs = new Map();
for (let i = 0; i < n; i++) {
  const a = sts[i], b = ng[i];
  if (Math.abs(a.time - b.time) > 1e-9 * Math.max(Math.abs(a.time), 1e-15)) {
    sameGrid = false;
    console.log(`grid differs at point ${i}: spice-ts t=${a.time} ngspice t=${b.time}`);
    break;
  }
  const key = `${a.iterations}/${b.iterations}`;
  pairs.set(key, (pairs.get(key) ?? 0) + 1);
  if (a.iterations > b.iterations) more++;
  else if (a.iterations < b.iterations) fewer++;
  else equal++;
  if (showPoints) console.log(`${i}\t${a.time}\t${a.iterations}\t${b.iterations}`);
}
console.log(`same time grid: ${sameGrid}`);
console.log(`points spice-ts > ngspice: ${more}, equal: ${equal}, spice-ts < ngspice: ${fewer}`);
console.log(`spice-ts/ngspice iteration pairs: ${[...pairs].sort().map(([k, v]) => `${k} x${v}`).join(', ')}`);
