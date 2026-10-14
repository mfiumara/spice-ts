import { readFile, writeFile } from 'node:fs/promises';
import { parse } from '../../../packages/core/src/parser/index.js';
import { MOS6 } from '../../../packages/core/src/devices/mos6.js';
import { runNgspicePacked } from '../../corpus/corpus-f/outcomes.js';

async function main() {
  const manifest = JSON.parse(await readFile('benchmarks/corpus/corpus-m/manifest.json', 'utf8'));
  const fixture = manifest.circuits.find((c: { id: string }) => c.id === 'm-23');
  const original = await readFile(fixture.localPath, 'utf8');
  const models = original.slice(original.indexOf('.MODEL')).replace(/\.END/i, '')
    .replace(/\b(?:RD|RS|RSH)\s*=\s*[^\s)]+/gi, '');
  const results = [];
  for (const polarity of [1, -1]) {
    for (const [vgs, vds, vbs] of [[5, 0.02, 0], [3, 2, -0.01], [1.4, 2.3, 0], [0, 4.4, 0], [2.5, -0.1, 0]]) {
      const model = polarity === 1 ? 'cd4012_nmos' : 'cd4012_pmos';
      const width = polarity === 1 ? '175u' : '270u';
      const deck = `Matched intrinsic MOS6 bias\nVD d 0 ${polarity * vds}\nVG g 0 ${polarity * vgs}\nVB b 0 ${polarity * vbs}\nM1 d g 0 b ${model} L=5u W=${width}\n${models}\n.save @m1[cd] @m1[gm] @m1[gds] @m1[cgs] @m1[cgd]\n.op\n.ac lin 1 1 1\n.end\n`;
      const ng = await runNgspicePacked(Buffer.from(deck), fixture);
      if (ng.status !== 'success') throw new Error(JSON.stringify(ng));
      const ac = ng.execution.analyses.find(a => a.type === 'ac')!;
      const compiled = parse(deck).compile();
      const device = compiled.devices.find(d => d instanceof MOS6) as MOS6;
      const channel = device.evaluateChannel(vgs, vds, vbs);
      // Diagnostic-only access to the existing private evaluator: no model edits.
      const half = new Float64Array(3);
      const voltages = new Map([['d', polarity * vds], ['g', polarity * vgs], ['b', polarity * vbs]]);
      (device as unknown as { meyerHalf: (voltage: (n: number) => number, out: Float64Array) => void })
        .meyerHalf(n => voltages.get(compiled.nodeNames[n]) ?? 0, half);
      const overlap = (polarity === 1 ? 175e-6 : 270e-6) * 2e-12;
      const actual = { cd: channel.mode * channel.cdrain, gm: channel.gm, gds: channel.gds, cgs: 2 * half[0] + overlap, cgd: 2 * half[1] + overlap };
      const expected = Object.fromEntries(Object.keys(actual).map(key => [key, ac.signals[`@m1[${key}]`]?.re[0]]));
      results.push({ polarity, bias: { vgs, vds, vbs }, actual, expected });
      console.log(JSON.stringify(results.at(-1)));
    }
  }
  await writeFile('benchmarks/results/issue-1083-residual/bias.json', JSON.stringify({ note: 'Intrinsic no-series clamped biases and cd in polarity domain; TS cd is channel only (ngspice includes drain bulk diode/GMIN). AC small-signal initialization supplies Meyer caps; comparison uses full caps including CGSO/CGDO overlap, as returned by installed ngspice-47.', results }, null, 2) + '\n');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
