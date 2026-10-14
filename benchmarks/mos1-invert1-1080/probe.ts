import { readFileSync, writeFileSync } from 'node:fs';
import { runNgspicePacked, runBoundedSimulatePacked } from '../corpus/corpus-f/outcomes.js';
import { reduceRow } from '../corpus/corpus-j/parity.js';
async function main() {
const c = JSON.parse(readFileSync('benchmarks/corpus/corpus-m/manifest.json','utf8')).circuits.find((c: {id:string}) => c.id === 'm-18');
const original = readFileSync(c.localPath);
const receipts = [];
for (const step of ['', ' 1ns', ' 0.2ns']) {
  const input = step ? Buffer.from(original.toString().replace('.tran 20ns 30us', `.tran 20ns 30us 0${step}`)) : original;
  const ng = await runNgspicePacked(input,c);
  const ts = await runBoundedSimulatePacked(input,{...c,category:'corpus-m', ngspice:{expectedStatus:'pass'},spiceTs:{expectedStatus:'pass'}});
  const row = reduceRow(c,ng,ts);
  const a=ts.analyses[0], b=ng.execution.analyses[0];
  const worst=[];
  if(a && b) for(const name of ['i(vdddev)','v(vout)']) {
    let j=0;
    const errors=Array.from(a.grid,(t,i)=>{
      while(j+1<b.grid.length && b.grid[j+1]<t) j++;
      const k=Math.min(j+1,b.grid.length-1);
      const ref=b.signals[name].re[j]+(k===j?0:(t-b.grid[j])/(b.grid[k]-b.grid[j])*(b.signals[name].re[k]-b.signals[name].re[j]));
      return {t,actual:a.signals[name].re[i],reference:ref,error:Math.abs(a.signals[name].re[i]-ref)};
    }).sort((x,y)=>y.error-x.error);
    worst.push({name,points:errors.slice(0,10)});
  }
  const referencePeak = b ? b.signals['i(vdddev)'].re.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0) : null;
  receipts.push({step:step||'original',row,worst,referencePeak});
  console.log(step||'original',row.worstNormalizedError,worst);
  writeFileSync('benchmarks/mos1-invert1-1080/probe.json',JSON.stringify(receipts,null,2)+'\n');
}
}
main().catch(error => { console.error(error); process.exitCode = 1; });
