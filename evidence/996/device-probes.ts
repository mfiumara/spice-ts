// Matched intrinsic-bias probes. Private read-only methods are inspected only here.
// The reduced decks remove RD/RS/RSH because the supplied bias is at prime nodes.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from '../../packages/core/src/parser/index.js';
import { MOS2 } from '../../packages/core/src/devices/mos2.js';

const probes: any[] = [];
let deck = 'Matched intrinsic bias probes for issue 996\n';
for (const id of ['k-5', 'k-10', 'k-15']) {
  const run = JSON.parse(gunzipSync(readFileSync(`evidence/996/runs/${id}-original.json.gz`)).toString());
  const summary = JSON.parse(readFileSync('evidence/996/summary.json', 'utf8'))[`${id}-original`];
  const compiled = parse(run.deck).compile();
  const series = run.spiceTs.analyses.find((a: any) => a.type === 'tran').series;
  for (const [name, model] of compiled.models) {
    const params = Object.entries(model.params).filter(([k]) => !['RSH', 'RD', 'RS'].includes(k.toUpperCase()));
    deck += `.model ${id}${name} ${model.type} (${params.map(([k,v]) => `${k}=${v}`).join(' ')})\n`;
  }
  const indices = [...new Set([0, series.grid.findIndex((t: number) => t >= summary.first.t), Math.floor(series.grid.length/3), Math.floor(series.grid.length*2/3), series.grid.length-1])];
  for (const index of indices) for (const device of compiled.devices) {
    if (!(device instanceof MOS2)) continue;
    const voltage = (n: number) => n < 0 ? 0 : series.signals[`v(${compiled.nodeNames[n].toLowerCase()})`][index].re;
    const [vd, vg, vs, vb] = device.nodes.map(voltage);
    const type = device.model.polarity;
    const ch = device.evaluateChannel(type*(vg-vs), type*(vd-vs), type*(vb-vs));
    const caps = new Float64Array(5), charges = new Float64Array(5);
    (device as any).evaluateCharges({getVoltage: voltage}, caps, charges);
    const temp = (device as any).temp;
    const vbd = type*(vb-vd);
    const cbd = vbd <= -3*temp.vt ? 1e-12*vbd-temp.drainSatCur : temp.drainSatCur*Math.expm1(vbd/temp.vt)+1e-12*vbd;
    const label = `m${probes.length}`;
    const modelName = [...compiled.models].find(([,m]) => m.type.toUpperCase() === (type === 1 ? 'NMOS' : 'PMOS'))![0];
    deck += `${label} ${label}d ${label}g ${label}s ${label}b ${id}${modelName} ${Object.entries(device.instance).map(([k,v]) => `${k}=${v}`).join(' ')}\n`;
    for (const [terminal,value] of Object.entries({d:vd,g:vg,s:vs,b:vb})) deck += `v${label}${terminal} ${label}${terminal} 0 ${value}\n`;
    probes.push({label,id,device:device.name,index,t:series.grid[index],bias:{vd,vg,vs,vb}, spiceTs:{id:ch.mode*ch.cdrain-cbd,gm:ch.gm,gds:ch.gds,gmbs:ch.gmbs,von:type*ch.von,vdsat:type*ch.vdsat,cgs:caps[0],cgd:caps[1],cgb:caps[2],qbs:charges[3]/type,qbd:charges[4]/type}, channel:ch});
  }
}
const keys = Object.keys(probes[0].spiceTs);
deck += '.control\nset numdgt=17\nop\nac lin 1 1 1\n';
for (const p of probes) for (const key of keys) deck += `print @${p.label}[${key}]\n`;
deck += 'print @m0[qb]\n.endc\n.end\n';
const dir = mkdtempSync(join(tmpdir(),'mos2-996-device-'));
try {
  writeFileSync(join(dir,'probe.cir'),deck);
  const run = spawnSync('ngspice',['-b','probe.cir'],{cwd:dir,encoding:'utf8',timeout:120_000,maxBuffer:32*1024*1024,env:{...process.env,HOME:dir}});
  const outputs = new Map([...run.stdout.matchAll(/@(m\d+)\[(\w+)\]\s*=\s*([-+\deE.]+)/g)].map(m=>[`${m[1]}.${m[2]}`,Number(m[3])]));
  for (const p of probes) {
    p.ngspice = Object.fromEntries(keys.map(k=>[k,outputs.get(`${p.label}.${k}`)]));
    if (keys.some(k=>p.ngspice[k] === undefined)) throw new Error(`Missing ngspice output ${p.label}: ${run.stderr}`);
  }
  if (!run.stderr.includes('no such parameter qb')) throw new Error('Expected explicit MOS2 qb unavailability receipt');
  writeFileSync('evidence/996/device-probes.json',JSON.stringify({command:'spice-heavy pnpm exec tsx evidence/996/device-probes.ts',exitCode:run.status,qb:{available:false,reason:'ngspice MOS2 exposes qbs/qbd/qgb but no intrinsic terminal qb; qbs and qbd are compared individually, not relabeled qb'},deck,stdout:run.stdout,stderr:run.stderr,probes},null,2)+'\n');
  console.log('probes',probes.length,'ngspice exit',run.status);
  for (const key of keys) {
    const sorted = [...probes].sort((a,b)=>Math.abs(b.spiceTs[key]-b.ngspice[key])-Math.abs(a.spiceTs[key]-a.ngspice[key]));
    console.log(key,sorted.slice(0,3).map(p=>({id:p.id,device:p.device,t:p.t,spiceTs:p.spiceTs[key],ngspice:p.ngspice[key]})));
  }
} finally { rmSync(dir,{recursive:true,force:true}); }
