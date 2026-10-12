// MOS1 inverter-chain runtime (OP and a short TRAN) for the #479 A/B: the
// batch-stamped MOS1 path now records the mos1conv.c linearisation.
import { simulate } from '../../../packages/core/src/index.js';

function chain(stages: number, analysis: string): string {
  const lines = [
    `* ${stages}-stage MOS1 CMOS inverter chain`,
    'VDD vdd 0 DC 2.5',
    'VIN s0 0 PULSE(0 2.5 0.1n 0.1n 0.1n 5n 10n)',
    '.model nch nmos level=1 vto=0.5 kp=120u lambda=0.02 cbd=2f cbs=2f cgso=1e-10 cgdo=1e-10 tox=10n',
    '.model pch pmos level=1 vto=-0.5 kp=60u lambda=0.02 cbd=2f cbs=2f cgso=1e-10 cgdo=1e-10 tox=10n',
  ];
  for (let i = 1; i <= stages; i++) {
    lines.push(`MP${i} s${i} s${i - 1} vdd vdd pch W=2u L=1u`);
    lines.push(`MN${i} s${i} s${i - 1} 0 0 nch W=1u L=1u`);
    lines.push(`C${i} s${i} 0 10f`);
  }
  lines.push(analysis, '.end');
  return lines.join('\n');
}

async function time(label: string, deck: string): Promise<void> {
  const samples: number[] = [];
  let telemetry = '';
  for (let run = 0; run < 3; run++) {
    const t0 = performance.now();
    const result = await simulate(deck);
    samples.push(performance.now() - t0);
    telemetry = JSON.stringify(result.convergence);
  }
  console.log(label, 'min ms', Math.min(...samples).toFixed(0), telemetry);
}

async function main(): Promise<void> {
  await time('op-2000', chain(2000, '.op'));
  await time('tran-200', chain(200, '.tran 0.05n 20n'));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
