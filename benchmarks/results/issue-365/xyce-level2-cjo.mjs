import { readFileSync } from 'node:fs';
import { simulate } from '../../../packages/core/dist/index.js';
const src = readFileSync(new URL('../../', import.meta.url).pathname + 'corpus/xyce/fixtures/DIODE/Level2_Temp_Dep_Breakdown.cir', 'utf8');
// Pre-fix spice-ts ignored CJO outside .disto, so "before" == the deck without the CJO line.
const before = await simulate(src.replace(/^\+\s*CJO = 1P\s*$/m, '+'));
const after = await simulate(src);
function interp(t,xs,ys){let i=1;while(i<xs.length-1&&xs[i]<t)i++;const x0=xs[i-1],x1=xs[i];return x1===x0?ys[i]:ys[i-1]+(ys[i]-ys[i-1])*(t-x0)/(x1-x0);}
for (let s = 0; s < after.steps.length; s++) {
  const A = after.steps[s].transient, B = before.steps[s].transient;
  const ta = Array.from(A.time), va = Array.from(A.voltage('2')), tb = Array.from(B.time), vb = Array.from(B.voltage('2'));
  let m = 0; for (let i = 0; i < tb.length; i++) m = Math.max(m, Math.abs(interp(tb[i], ta, va) - vb[i]));
  console.log(`TEMP=${after.steps[s].paramValue} points ${tb.length}->${ta.length} max|dV(2)|=${m.toExponential(3)} V(2)@1s ${vb.at(-1).toFixed(6)}->${va.at(-1).toFixed(6)}`);
}
