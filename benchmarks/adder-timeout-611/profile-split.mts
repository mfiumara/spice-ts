/**
 * Issue #611 / #604: reduce a V8 `.cpuprofile` of `measure.mts` (run against
 * packages/core/src through tsx, so frames carry source file URLs) to the
 * self-time split ngspice's `acct` reports: device evaluation (load), MNA
 * assembly, sparse factor/solve, transient driver (LTE, history), other.
 *
 * Usage: pnpm exec tsx benchmarks/adder-timeout-611/profile-split.mts <file.cpuprofile>
 */
import { readFile } from 'node:fs/promises';

interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url: string };
  children?: number[];
}
interface Profile { nodes: ProfileNode[]; samples: number[]; timeDeltas: number[] }

const path = process.argv[2];
if (!path) {
  console.error('usage: profile-split.mts <file.cpuprofile>');
  process.exit(2);
}
const profile = JSON.parse(await readFile(path, 'utf8')) as Profile;
const byId = new Map(profile.nodes.map(node => [node.id, node]));
const parent = new Map<number, ProfileNode>();
for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node);

function category(sampled: ProfileNode): string {
  const { functionName } = sampled.callFrame;
  if (functionName === '(garbage collector)') return 'gc';
  if (functionName === '(idle)' || functionName === '(program)' || functionName === '(root)') return 'idle/program';
  // Builtins (Math.exp, TypedArray.fill, ...) carry no URL: charge them to the
  // nearest JavaScript caller, as ngspice's acct charges libm to DEVload.
  let node: ProfileNode | undefined = sampled;
  while (node && node.callFrame.url === '') node = parent.get(node.id);
  if (!node) return 'runtime/other';
  const { url } = node.callFrame;
  if (/\/packages\/core\/src\/devices\//.test(url)) return 'device-eval';
  if (/\/packages\/core\/src\/solver\//.test(url)) return 'factor/solve';
  if (/\/packages\/core\/src\/mna\//.test(url)) return 'assembly';
  if (/\/packages\/core\/src\/analysis\/(transient|newton|dc)/.test(url)) return 'analysis (driver, NR loop, LTE)';
  if (/\/packages\/core\/src\//.test(url)) return 'core other';
  return 'runtime/other';
}

const totals = new Map<string, number>();
const functions = new Map<string, number>();
let total = 0;
for (let index = 0; index < profile.samples.length; index++) {
  const node = byId.get(profile.samples[index]);
  if (!node) continue;
  const delta = profile.timeDeltas[index] ?? 0;
  total += delta;
  const key = category(node);
  totals.set(key, (totals.get(key) ?? 0) + delta);
  const file = node.callFrame.url.replace(/^.*\/packages\/core\/src\//, '');
  const name = `${node.callFrame.functionName || '(anonymous)'} ${file}`;
  functions.set(name, (functions.get(name) ?? 0) + delta);
}
const busy = total - (totals.get('idle/program') ?? 0);
const split = Object.fromEntries([...totals].sort((a, b) => b[1] - a[1]).map(([key, value]) => [key, {
  ms: Math.round(value / 1000),
  shareOfBusy: key === 'idle/program' ? null : Number((value / busy).toFixed(3)),
}]));
const top = [...functions].sort((a, b) => b[1] - a[1]).slice(0, 15)
  .map(([name, value]) => ({ name, ms: Math.round(value / 1000), shareOfBusy: Number((value / busy).toFixed(3)) }));
console.log(JSON.stringify({ totalMs: Math.round(total / 1000), busyMs: Math.round(busy / 1000), split, top }, null, 2));
