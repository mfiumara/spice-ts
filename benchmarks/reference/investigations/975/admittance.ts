import { readFileSync, writeFileSync } from 'node:fs';
import { runSpiceTs, runNgspice } from '../../../comparison-harness.js';
import { runXyce } from '../../xyce.js';
async function main() {
  const dir='benchmarks/reference/investigations/975';
  const op=JSON.parse(readFileSync(`${dir}/baseline-op.json`,'utf8'));
  const csv=readFileSync(`${dir}/baseline-xy-op.csv`,'utf8').trim().split('\n')[1].split(',').map(Number);
  const model='.model qnl npn bf=80 rb=0 ccs=0 tf=0.3ns tr=6ns cje=3pf cjc=2pf';
  const table=[];
  for(let index=0;index<11;index++) {
    const q=`q${index+1}`;
    const val=(p:string)=>op.ng.signals[Object.keys(op.ng.signals).find(k=>k.includes(`@${q}[${p}]`))!][0].re;
    for(const engine of ['ng','xy','ts','matched-ng','matched-xy','matched-ts']) {
      const matched=engine.startsWith('matched-');
      const kind=engine.endsWith('xy')?'xy':engine.endsWith('ng')?'ng':'ts';

      const b=op.ts.find((b:{name:string})=>b.name===q);
      const vbe=matched||kind==='ng'?val('vbe'):kind==='xy'?csv[index*3]:b.vbe;
      const vbc=matched||kind==='ng'?val('vbc'):kind==='xy'?csv[index*3+1]:b.vbe-b.vce;
      const run=kind==='ng'?runNgspice:kind==='xy'?(f:Parameters<typeof runXyce>[0])=>runXyce(f,{executable:process.env.XYCE_BIN}):runSpiceTs;
      const responses: Record<string,Record<string,{re:number;im:number}>>={};
      for(const stimulus of ['b','c','e']) {
        const deck=`975 intrinsic admittance ${q} ${engine} ${stimulus}\n.ac lin 1 1meg 1meg\nvc c 0 dc ${vbe-vbc} ac ${stimulus==='c'?1:0}\nvb b 0 dc ${vbe} ac ${stimulus==='b'?1:0}\nve e 0 dc 0 ac ${stimulus==='e'?1:0}\nq1 c b e qnl\n${model} ${matched?'vaf=50':'va 50'}\n.end\n`;
        const result=await run({name:'intrinsic975',netlist:deck,analysis:'ac',signals:['i(vc)','i(vb)','i(ve)']});
        if(result.status!=='success') throw new Error(JSON.stringify(result));
        responses[stimulus]=Object.fromEntries(Object.entries(result.series.signals).filter(([s])=>['i(vc)','i(vb)','i(ve)'].includes(s)).map(([s,v])=>[s,{re:-v[0].re,im:-v[0].im}]));
      }
      const ic=matched?null:kind==='ng'?val('ic'):kind==='xy'?csv[index*3+2]:b.dc.collectorCurrent;
      table.push({q,engine,vbe,vce:vbe-vbc,ic,gm:responses.b['i(vc)'].re,gpi:-responses.e['i(vb)'].re,go:responses.c['i(vc)'].re+responses.c['i(vb)'].re,Cpi:-responses.e['i(vb)'].im/(2*Math.PI*1e6),Cmu:-responses.b['i(vc)'].im/(2*Math.PI*1e6),responses});
    }
    console.log(q,'complete');
  }
  writeFileSync(`${dir}/admittance.json`,JSON.stringify({method:'Native intrinsic terminal admittance at 1 MHz (avoids polar conversion cancellation at 1 Hz). RB=0 and CJS=0 explicitly remove extrinsic branches; original internal OP is held by ideal sources. matched-* uses ngspice OP and vaf=50 for every engine. Capacitances are extracted, not Xyce internal variables (which are not exported).',table},null,2)+'\n');
}
void main();
