import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from '../../../../packages/core/src/parser/index.js';
import { solveDCOperatingPoint } from '../../../../packages/core/src/analysis/dc.js';
import { DEFAULT_OPTIONS } from '../../../../packages/core/src/types.js';
import { BJT } from '../../../../packages/core/src/devices/bjt.js';
import { parseNgspiceRaw } from '../../../comparison-harness.js';
const dir = 'benchmarks/reference/investigations/975';
const base = readFileSync('benchmarks/reference/mutual-948/classic/rca3040-wideband-amplifier/0-ac.cir', 'utf8').replace(/^\.ac.*$/m, '.op');
const qs = Array.from({length:11}, (_,i)=>`q${i+1}`);
const modelFields = ['VAF','IS','BF','BR','NF','NR','VAR','IKF','IKR','ISE','ISC','NE','NC','NKF','RB','RBM','IRB','RC','RE','CJE','VJE','MJE','TF','XTF','VTF','ITF','PTF','CJC','VJC','MJC','XCJC','TR','CJS','VJS','MJS','FC','TNOM','EG','XTI','XTB'];
for (const [name, deck] of [['baseline',base], ['explicit-vaf',base.replace('va 50','vaf=50')]]) {
  const ngdeck = deck.replace('.end', `.save all ${qs.flatMap(q=>['ic','vbe','vbc','gm','gpi','go','cpi','cmu'].map(p=>`@${q}[${p}]`)).join(' ')}\n.end`);
  writeFileSync(`${dir}/${name}-ng-op.cir`, ngdeck);
  const ng = spawnSync('ngspice',['-n','-b','-r',`${name}-op.raw`,`${name}-ng-op.cir`],{cwd:dir,encoding:'utf8',env:{...process.env,SPICE_ASCIIRAWFILE:'1'}});
  writeFileSync(`${dir}/${name}-ng-op.log`,ng.stdout+ng.stderr);
  const modelDump = spawnSync('ngspice',['-n','-b',`${name}-ng-op.cir`],{cwd:dir,encoding:'utf8'});
  writeFileSync(`${dir}/${name}-ng-model.log`, modelDump.stdout+modelDump.stderr);
  if(ng.status!==0) throw new Error(ng.stderr);
  const ngop = parseNgspiceRaw(readFileSync(`${dir}/${name}-op.raw`,'utf8'))[0];
  const compiled = parse(deck).compile();
  const {assembler} = solveDCOperatingPoint(compiled,DEFAULT_OPTIONS);
  const ctx = assembler.getStampContext();
  const tsop = compiled.devices.filter(d=>d instanceof BJT).map(d=>{
    // Diagnostic access to implementation-private evaluators; never changes the device.
    const b = d as unknown as { name:string; nodes:number[]; params:unknown; evaluateDC:(be:number,bc:number)=>Record<string,number>;evaluateCharges:(ctx:unknown)=>Record<string,number>};
    const voltage = (node:number)=>node<0?0:assembler.solution[node];
    const [c,base,e]=b.nodes;
    const vbe=voltage(base)-voltage(e), vbc=voltage(base)-voltage(c);
    return {name:b.name, vbe,vce:vbe-vbc, dc:{...b.evaluateDC(vbe,vbc)}, charges:{...b.evaluateCharges(ctx)}, params:b.params};
  });
  const xydeck=deck.replace('.end',`.print DC format=csv file=${name}-xy-op.csv precision=17 ${qs.flatMap(q=>[`N(${q}:VBE)`,`N(${q}:VBC)`,`IC(${q})`]).join(' ')} ${modelFields.map(p=>`{QNL:${p}}`).join(' ')}\n.end`);
  writeFileSync(`${dir}/${name}-xy-op.cir`,xydeck);
  const xy=spawnSync(process.env.XYCE_BIN!,[`${name}-xy-op.cir`],{cwd:dir,encoding:'utf8'});
  writeFileSync(`${dir}/${name}-xy-op.log`,xy.stdout+xy.stderr);
  if (xy.status!==0) throw new Error(xy.stdout+xy.stderr);
  writeFileSync(`${dir}/${name}-op.json`,JSON.stringify({ng:ngop,ts:tsop,xyStatus:xy.status},null,2)+'\n');
  console.log(name,xy.status,xy.stderr);
}
