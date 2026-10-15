/** Run with spice-heavy pnpm exec tsx benchmarks/xspice-flipflop-1179/compare.ts.
 * Existing byte-identical corpus fixtures; only GUI control blocks are removed
 * from BOTH engines' inputs. The original .tran and every circuit card remain.
 * Source revisions and licences: benchmarks/corpus/{corpus-i,corpus-f}/SOURCES.md.
 */
import { readFileSync } from 'node:fs';
import { alignAndMeasure, runNgspice, runSpiceTs, type ComparisonFixture } from '../comparison-harness.js';

const decks = [
  { path: 'corpus-i/fixtures/esim/Examples/JK_Flipflop/JK_Flipflop.cir.out', signals: ['v(out)', 'v(nout)'] },
  { path: 'corpus-i/fixtures/esim/Examples/4_bit_JK_ff/4_bit_JK_ff.cir.out', signals: ['v(d1)', 'v(d2)', 'v(d3)', 'v(d4)'] },
  { path: 'corpus-f/fixtures/examples/xspice/original-examples/mixed_mode.deck', signals: ['v(1)'] },
];
async function main(): Promise<void> {
  for (const deck of decks) {
    const original = readFileSync(`benchmarks/corpus/${deck.path}`, 'utf8');
    const fixture: ComparisonFixture = {
      name: deck.path.split('/').at(-1)!.replace(/\W/g, '_'), analysis: 'tran', signals: deck.signals,
      netlist: original.replace(/^\s*\.control\b[\s\S]*?^\s*\.endc\b.*$/gim, ''),
    };
    const spice = await runSpiceTs(fixture);
    const ng = await runNgspice(fixture);
    console.log(JSON.stringify({ path: deck.path,
      spice: spice.status === 'success' ? { status: spice.status, runtimeMs: spice.runtimeMs, points: spice.series.grid.length, signals: Object.keys(spice.series.signals) } : spice,
      ngspice: ng.status === 'success' ? { status: ng.status, runtimeMs: ng.runtimeMs, points: ng.series.grid.length, signals: Object.keys(ng.series.signals) } : ng,
      metrics: spice.status === 'success' && ng.status === 'success' ? alignAndMeasure(spice.series, ng.series, deck.signals) : null,
    }));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
