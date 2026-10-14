import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { runSpiceTs, runNgspice, alignAndMeasure } from '../../../comparison-harness.js';
import { runXyce } from '../../xyce.js';
async function main() {
const directory = 'benchmarks/reference/investigations/975';
const ngVersion = spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).stdout;
const xyVersion = spawnSync(process.env.XYCE_BIN ?? 'Xyce', ['-v'], { encoding: 'utf8' }).stdout;
if (!/ngspice-47\b/.test(ngVersion) || !/Release 7\.10\.0\b/.test(xyVersion)) throw new Error('Requires ngspice 47 and Xyce 7.10.0');
writeFileSync(`${directory}/environment.json`, JSON.stringify({ngVersion, xyVersion, node:process.version, platform:process.platform, arch:process.arch, sourceHead:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim()},null,2)+'\n');
const manifest = JSON.parse(readFileSync('benchmarks/reference/mutual-948/hash-manifest.json', 'utf8'));
const row = manifest.find((r: { key: string }) => r.key === 'classic/rca3040-wideband-amplifier');
const projection = row.projections[0];
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
for (const [path, expected] of [[row.canonicalPath, row.canonicalSha256], [projection.sharedInputPath, projection.sharedInputSha256], [projection.xyceInputPath, projection.xyceInputSha256]]) {
  if (hash(readFileSync(path, 'utf8')) !== expected) throw new Error(`Hash mismatch ${path}`);
}
const netlist = readFileSync(projection.sharedInputPath, 'utf8');
const signals = ['v(8)', 'v(9)', 'v(14)', 'v(15)', 'v(10)', 'v(11)'];
const results: Record<string, unknown> = { hashes: row };
for (const [name, deck] of [['baseline', netlist], ['explicit-tnom', netlist.replace('.end', '.temp 27\n.end').replace('npn bf=', 'npn tnom=27 bf=')], ['explicit-vaf', netlist.replace('va 50', 'vaf=50')], ['va-equals', netlist.replace('va 50', 'va=50')], ['vaf-space', netlist.replace('va 50', 'vaf 50')], ['zero-ccs', netlist.replace('ccs=2pf', 'ccs=0')], ['tight-ngspice', netlist.replace('.end', '.options reltol=1e-9 abstol=1e-15 vntol=1e-12\n.end')]]) {
  const fixture = { name: `rca975-${name}`, netlist: deck, analysis: 'ac' as const, signals };
  const ng = await runNgspice(fixture);
  const xy = name === 'tight-ngspice' ? null : await runXyce(fixture, { executable: process.env.XYCE_BIN });
  const ts = await runSpiceTs(fixture);
  const metrics: Record<string, unknown> = {};
  for (const [label, a, b] of [['ts-ng', ts, ng], ['ng-xy', ng, xy], ['ts-xy', ts, xy]] as const) {
    if (a?.status === 'success' && b?.status === 'success') metrics[label] = alignAndMeasure(a.series, b.series, signals);
  }
  for (const result of [ng, xy, ts]) {
    if (result?.status === 'success') result.series.signals = Object.fromEntries(signals.map(s => [s, result.series.signals[s]]));
  }
  results[name] = { sha256: hash(deck), ng, xy, ts, metrics };
  console.log(name, JSON.stringify(metrics));
}
writeFileSync(`${directory}/ac.json`, JSON.stringify(results) + '\n');
}
void main();
