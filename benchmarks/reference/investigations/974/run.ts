import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { alignAndMeasure, runSpiceTs, type SampleSeries } from '../../../comparison-harness.js';
import { runNgspiceReference, sha256 } from '../../expanded.js';
import { runXyce, translateForXyce } from '../../xyce.js';

// Launch only via spice-heavy. No benchmark defaults or upstream receipts changed.
const dir = 'benchmarks/reference/investigations/974';
mkdirSync(dir, { recursive: true });
const upstream = JSON.parse(readFileSync('benchmarks/reference/mutual-948/report.json', 'utf8'));
const manifest = JSON.parse(readFileSync('benchmarks/reference/mutual-948/hash-manifest.json', 'utf8'));
const version = (exe: string, args: string[]) => {
  const r = spawnSync(exe, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`Cannot execute ${exe}`);
  return r.stdout.trim();
};
const tools = { ngspice: version('ngspice', ['--version']), xyce: version(process.env.XYCE_BIN ?? 'Xyce', ['-v']) };
if (!/ngspice-47\b/.test(tools.ngspice) || !/Release 7\.10\.0\b/.test(tools.xyce)) throw new Error('Wrong reference versions');
const report: any = { tools, head: version('git', ['rev-parse', 'HEAD']), node: process.version,
  environment: { arch: arch(), platform: platform(), release: release(), cpu: cpus()[0]?.model }, cases: [] };
if (process.argv.includes('--resume')) report.cases = JSON.parse(readFileSync(`${dir}/report.json`, 'utf8')).cases;
const save = () => writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2) + '\n');
function summary(series: SampleSeries) {
  return { points: series.grid.length, firstTime: series.grid[0], lastTime: series.grid.at(-1),
    signals: Object.fromEntries(Object.entries(series.signals).map(([s, a]) => [s, {
      first: a[0], last: a.at(-1), min: a.reduce((m, v) => Math.min(m, v.re), Infinity), max: a.reduce((m, v) => Math.max(m, v.re), -Infinity),
      samples: [0, .000001, .001, .01, .1, 1, 10, 50, 100].filter(t => t <= series.grid.at(-1)!).map(t => {
        const i = series.grid.findIndex(x => x >= t); return { time: series.grid[i], value: a[i] };
      }),
    }])) };
}
async function main() {
for (const key of ['ngspice/jimi-fuzz', 'corpus-e/lc-oscillator-transient']) {
  const row = upstream.fixtures.find((x: any) => x.key === key);
  const p = row.projections[0];
  const m = manifest.find((x: any) => x.key === key).projections[0];
  const netlist = readFileSync(p.sharedInputPath, 'utf8');
  if (sha256(netlist) !== p.sharedInputSha256 || p.sharedInputSha256 !== m.sharedInputSha256) throw new Error('Shared hash mismatch');
  const savedXyce = readFileSync(p.xyceInputPath, 'utf8');
  if (sha256(savedXyce) !== p.xyceInputSha256 || p.xyceInputSha256 !== m.xyceInputSha256) throw new Error('Xyce hash mismatch');
  const signals = row.comparisons[0].signals;
  const fixture = { name: key, analysis: 'tran' as const, signals, netlist };
  if (translateForXyce(fixture).netlist !== savedXyce) throw new Error('Saved Xyce bytes not reproduced');
  const variants: Array<[string, string, string, string]> = [['baseline', netlist, '', '']];
  if (key.includes('jimi')) {
    variants.push(['sin-spelling', netlist.replace(/sine\(/i, 'sin('), '', '']);
    variants.push(['no-device-ic', netlist.replace(/ IC=0/g, ''), '', '']);
    variants.push(['sin-no-device-ic', netlist.replace(/sine\(/i, 'sin(').replace(/ IC=0/g, ''), '', '']);
    variants.push(['op-no-device-ic', netlist.replace(/^\.tran.*$/m, '.op').replace(/ IC=0/g, ''), '', '']);
    variants.push(['sin-no-device-ic-maxstep', netlist.replace(/sine\(/i, 'sin(').replace(/ IC=0/g, '').replace(/(^\.tran.*)2\.0833333333333e-05\s*$/m, '$1 5e-6'), '', '']);
    const normalized = netlist.replace(/sine\(/i, 'sin(').replace(/ IC=0/g, '');
    variants.push(['sin-no-device-ic-trap', normalized, '.options method=trap reltol=1e-6 trtol=1', '.options timeint method=7 reltol=1e-6']);

    variants.push(['uic', netlist.replace(/(^\.tran.*)$/m, '$1 UIC'), '', '']);
    variants.push(['op', netlist.replace(/^\.tran.*$/m, '.op'), '', '']);
  } else {
    variants.push(['maxstep-0.01', netlist.replace('.tran .5 100 0', '.tran .5 100 0 .01'), '', '']);
    variants.push(['maxstep-0.005', netlist.replace('.tran .5 100 0', '.tran .5 100 0 .005'), '', '']);
    variants.push(['uic', netlist.replace('.tran .5 100 0', '.tran .5 100 0 .01 UIC'), '', '']);
    variants.push(['trap-0.01', netlist.replace('.tran .5 100 0', '.tran .5 100 0 .01'), '.options method=trap reltol=1e-6 trtol=1', '.options timeint method=7 reltol=1e-6']);
    variants.push(['gear-0.01', netlist.replace('.tran .5 100 0', '.tran .5 100 0 .01'), '.options method=gear reltol=1e-6 trtol=1', '.options timeint method=2 reltol=1e-6']);
    variants.push(['gear8-0.01', netlist.replace('.tran .5 100 0', '.tran .5 100 0 .01'), '.options method=gear reltol=1e-6 trtol=1', '.options timeint method=8 reltol=1e-6']);
  }
  for (const [variant, shared, ngOptions, xyOptions] of variants) {
    if (report.cases.some((c: any) => c.key === key && c.variant === variant)) continue;
    const analysis = variant.startsWith('op') ? 'op' as const : 'tran' as const;
    const f = { ...fixture, analysis, netlist: shared };
    const ngInput = ngOptions ? shared.replace(/^\.end/im, `${ngOptions}\n.end`) : shared;
    const xyInput = xyOptions ? shared.replace(/^\.end/im, `${xyOptions}\n.end`) : shared;
    const ng = runNgspiceReference(ngInput, analysis);
    const xy = await runXyce({ ...f, netlist: xyInput }, { timeoutMs: 120000 });
    const ts = await runSpiceTs(f);
    const name = `${key.split('/').at(-1)}-${variant}`;
    writeFileSync(`${dir}/${name}-shared.cir`, shared);
    if (ngOptions) writeFileSync(`${dir}/${name}-ng.cir`, ngInput);
    writeFileSync(`${dir}/${name}-xyce.cir`, translateForXyce({ ...f, netlist: xyInput }).netlist);
    const runs = { ngspice: ng, xyce: xy, spiceTs: ts };
    const receipts = Object.fromEntries(Object.entries(runs).map(([engine, r]) => {
      if ('output' in r) writeFileSync(`${dir}/${name}-${engine}.log`, r.output ?? '');
      const { series, output, ...rest } = r as any;
      return [engine, { ...rest, ...(series ? summary(series) : {}) }];
    }));
    const comparisons: any = {};
    for (const [a, b] of [['ngspice', 'xyce'], ['spiceTs', 'ngspice'], ['spiceTs', 'xyce']] as const) {
      const x = runs[a], y = runs[b];
      if (x.status === 'success' && y.status === 'success') {
        comparisons[`${a}Vs${b}`] = alignAndMeasure(x.series, y.series, signals);
        // Reverse grid detects grid-direction sensitivity without changing tolerances.
        comparisons[`${b}Vs${a}`] = alignAndMeasure(y.series, x.series, signals);
      }
    }
    report.cases.push({ key, variant, sharedSha256: sha256(shared), baselineVerified: variant === 'baseline', savedInputSha256: p.sharedInputSha256,
      savedXyceSha256: p.xyceInputSha256, ngOptions, xyOptions, receipts, comparisons });
    save();
    console.log(name, Object.fromEntries(Object.entries(runs).map(([e, r]) => [e, r.status])));
  }
}
}
main().catch(error => { console.error(error); process.exitCode = 1; });
