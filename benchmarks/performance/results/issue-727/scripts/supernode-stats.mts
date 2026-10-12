// Issue #727: supernode structure of the last full factorisation of an M2 deck (elimination positions).
//   npx tsx benchmarks/performance/results/issue-727/scripts/supernode-stats.mts resistor-mesh-op:50000
import { GilbertPeierlsSolver } from '../../../../../packages/core/src/solver/gilbert-peierls.js';
import { simulate } from '../../../../../packages/core/src/simulate.js';
import { m2Netlist } from '../../../scaling-m2-fixture.mjs';

const cell = process.argv[2] ?? 'resistor-mesh-op:50000';
let snap: any = null;
const original = GilbertPeierlsSolver.prototype.factorize;
GilbertPeierlsSolver.prototype.factorize = function (this: any, A) {
  const before = this.numericFactorizations;
  original.call(this, A);
  if (this.numericFactorizations !== before) {
    snap = { n: this.n, lColPtr: this.lColPtr.slice(), lRows: this.lRows.slice(0, this.lColPtr[this.n]), uColPtr: this.uColPtr.slice(), uRows: this.uRows.slice(0, this.uColPtr[this.n]) };
  }
};
const [c, nodes] = cell.split(':');
await simulate(m2Netlist(c, Number(nodes)).netlist);
const { n, lColPtr, lRows, uColPtr, uRows } = snap;
// sameSet[k]: L[:,k] == {k+1} ∪ L[:,k+1] as sets; sameOrder: and remaining order identical
const sameSet = new Uint8Array(n), sameOrder = new Uint8Array(n);
const mark = new Int32Array(n).fill(-1);
for (let k = 0; k + 1 < n; k++) {
  const a0 = lColPtr[k], a1 = lColPtr[k + 1], b0 = lColPtr[k + 1], b1 = lColPtr[k + 2];
  if (a1 - a0 !== b1 - b0 + 1) continue;
  let hasNext = false;
  for (let p = a0; p < a1; p++) { mark[lRows[p]] = k; if (lRows[p] === k + 1) hasNext = true; }
  if (!hasNext) continue;
  let ok = true;
  for (let p = b0; p < b1; p++) if (mark[lRows[p]] !== k) { ok = false; break; }
  if (!ok) continue;
  sameSet[k] = 1;
  let q = b0; let ord = true;
  for (let p = a0; p < a1; p++) { if (lRows[p] === k + 1) continue; if (lRows[p] !== lRows[q++]) { ord = false; break; } }
  if (ord) sameOrder[k] = 1;
}
let flops = 0, fSet = 0, fOrd = 0;
for (let j = 0; j < n; j++) for (let p = uColPtr[j]; p < uColPtr[j + 1] - 1; p++) {
  const k = uRows[p]; const w = lColPtr[k + 1] - lColPtr[k]; flops += w;
  // count as supernodal if k chains to k+1 and the next U entry is k+1
  if (sameSet[k] && uRows[p + 1] === k + 1 && p + 1 < uColPtr[j + 1] - 1) { fSet += w; if (sameOrder[k]) fOrd += w; }
}
let sn = 0; for (let k = 0; k < n; k++) if (!(k > 0 && sameSet[k - 1])) sn++;
const snEnd = new Int32Array(n); for (let k = n - 1; k >= 0; k--) snEnd[k] = sameSet[k] ? snEnd[k + 1] : k;
let fClosed = 0, fOwn = 0, fParent = 0;
for (let j = 0; j < n; j++) for (let p = uColPtr[j]; p < uColPtr[j + 1] - 1; p++) {
  const k = uRows[p]; const w = lColPtr[k + 1] - lColPtr[k];
  const e = snEnd[k];
  if (e >= j) fOwn += w; else if (e === j - 1) fParent += w; else if (e > k || (k > 0 && sameSet[k-1])) fClosed += w;
}
console.log({ fracClosedUsable: fClosed / flops, fracOwnSupernode: fOwn / flops, fracEndIsJminus1: fParent / flops });
console.log(cell, { n, nnzL: lColPtr[n], flops, supernodes: sn, linkSet: sameSet.reduce((a, b) => a + b, 0), linkOrder: sameOrder.reduce((a, b) => a + b, 0), fracFlopsSet: fSet / flops, fracFlopsOrder: fOrd / flops });
