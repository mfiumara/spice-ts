// Issue #842 review: waveform digest (sha256 of time + every voltage/current series) of a
// MOS1 chain with junction caps, to compare builds.   node jcap-digest.mjs <core dist dir> [stages]
import { createHash } from 'node:crypto';
const [dist, stages] = [process.argv[2], Number(process.argv[3] ?? 25)];
const { simulate } = await import(`${dist}/index.js`);
const lines = ['* MOS1 chain with junction caps', 'VDD vdd 0 3.3', 'VIN n0 0 PULSE(0 3.3 1n 0.2n 0.2n 4n 10n)'];
for (let i = 0; i < stages; i++) {
  lines.push(`MN${i} n${i + 1} n${i} 0 0 NM W=2u L=1u AD=4p AS=4p`);
  lines.push(`MP${i} n${i + 1} n${i} vdd vdd PM W=4u L=1u AD=8p AS=8p PD=12u PS=12u`);
}
lines.push('.model NM NMOS(VTO=0.7 KP=110u CBD=100f CBS=100f)', '.model PM PMOS(VTO=-0.7 KP=50u CJ=2e-4 CJSW=1e-9 TOX=20n CGSO=1e-10 CGDO=1e-10)', '.tran 0.2n 30n', '.end');
const r = await simulate(lines.join('\n'));
const t = r.transient; const h = createHash('sha256');
h.update(new Uint8Array(Float64Array.from(t.time).buffer));
const entries = m => (m instanceof Map ? [...m.entries()] : Object.entries(m ?? {})).sort(([a], [b]) => (a < b ? -1 : 1));
let series = 0;
for (const [k, v] of [...entries(t.voltageArrays), ...entries(t.currentArrays)]) { series++; h.update(k).update(new Uint8Array(Float64Array.from(v).buffer)); }
console.log(JSON.stringify({ dist: dist.split('/').pop(), stages, points: t.time.length, series, digest: h.digest('hex').slice(0, 16) }));
