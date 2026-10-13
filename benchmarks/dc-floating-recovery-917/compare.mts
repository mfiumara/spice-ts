// SPDX-License-Identifier: MIT
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpus, release, platform } from 'node:os';

type Complex = { real: number; imaginary: number };
type Native = { status: string; milliseconds?: number; error?: string; dc?: Record<string, number>; ac?: { frequencies: number[]; voltages: Record<string, {magnitude:number;phase:number}[]> } };
const here = resolve('benchmarks/dc-floating-recovery-917');
const run = resolve(here, '.run');
mkdirSync(run, { recursive: true });
writeFileSync(resolve(run, '.spiceinit'), 'set ngbehavior=ltps\nset filetype=ascii\n');
const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
function rawAC(text: string) {
  const count = Number(/No\. Variables:\s*(\d+)/.exec(text)?.[1]);
  const rows = Number(/No\. Points:\s*(\d+)/.exec(text)?.[1]);
  const names = [...text.split('Values:')[0].matchAll(/^\s*\d+\s+(\S+)\s+\S+/gm)].map(m => m[1]);
  const values = text.split('Values:\n')[1]?.trim().split(/\n/).map(line => {
    const value = line.trim().split(/\s+/).at(-1)!;
    const [real, imaginary] = value.split(',').map(Number);
    return {real, imaginary} as Complex;
  });
  if (!values || names.length !== count || values.length !== rows * count) throw new Error('Invalid AC raw shape');
  return { count, rows, names, values };
}
function metrics(native: Native, raw: string | null) {
  if (!native.ac || !raw) return { maxError: null, rmsError: null, comparedValues: 0 };
  const reference = rawAC(raw);
  if (native.ac.frequencies.length !== reference.rows) throw new Error('AC row mismatch');
  const errors: number[] = [];
  for (let row = 0; row < reference.rows; row++) {
    const frequency = reference.values[row * reference.count].real;
    if (Math.abs(native.ac.frequencies[row] / frequency - 1) > 1e-12) throw new Error('Frequency mismatch');
    for (const [name, column] of Object.entries(native.ac.voltages)) {
      const col = reference.names.indexOf(`v(${name.toLowerCase()})`);
      if (col < 0) throw new Error('Missing reference voltage');
      const expected = reference.values[row * reference.count + col];
      const actual = column[row];
      const phase = actual.phase * Math.PI / 180;
      errors.push(Math.hypot(actual.magnitude * Math.cos(phase) - expected.real,
        actual.magnitude * Math.sin(phase) - expected.imaginary) / Math.hypot(expected.real, expected.imaginary));
    }
  }
  return { maxError: Math.max(...errors), rmsError: Math.sqrt(errors.reduce((s,x)=>s+x*x,0)/errors.length), comparedValues: errors.length };
}
const reduction = readFileSync('benchmarks/vendor-singular-917/floating-rc.cir','utf8');
writeFileSync(resolve(run,'divider.cir'),'divider\nV1 in 0 3\nR1 in out 1k\nR2 out 0 2k\n.op\n.end\n');
writeFileSync(resolve(run,'inconsistent.cir'),reduction.replace('Cleft','Ibad 0 a 1\nCleft'));
const entries = [
  ['reduction', resolve('benchmarks/vendor-singular-917/floating-rc.cir')],
  ['base', resolve('.receipt-882/ngspice/784/base_159.cir')],
  ['variant', resolve('.receipt-882/ngspice/784/variant_159.cir')],
  ['divider', resolve(run,'divider.cir')],
  ['inconsistent', resolve(run,'inconsistent.cir')],
];
const receipts = [];
for (const [name, deck] of entries) {
  const includes = () => Object.fromEntries([...readFileSync(deck,'utf8').matchAll(/^\s*\.include\s+"([^"]+)"/gim)].map(m => [m[1].split('/').at(-1)!,hash(m[1])]));
  const beforeHash = hash(deck), beforeIncludes = includes();
  const nativeRuns: Record<string, unknown> = {};
  for (const [label, entry] of [['before',resolve(run,'baseline/packages/core/src/simulate.ts')],['after',resolve('packages/core/src/simulate.ts')]]) {
    const invocation = [process.execPath,'--import','tsx',resolve(here,'worker.mts'),entry,deck];
    const start = performance.now();
    const output = spawnSync(invocation[0],invocation.slice(1),{encoding:'utf8',timeout:30000});
    const native: Native = output.status === 0 ? JSON.parse(output.stdout) : {status:'process-failure',error:output.error?.message ?? output.stderr};
    nativeRuns[label] = { ...native, invocation, exit:output.status, signal:output.signal, processMilliseconds:performance.now()-start };
  }
  const rawPath = resolve(run,name+'.raw');
  const invocation = ['ngspice','-b','-r',rawPath,deck];
  const start = performance.now();
  const ref = spawnSync(invocation[0],invocation.slice(1),{cwd:run,encoding:'utf8',timeout:30000});
  const raw = ref.status === 0 ? readFileSync(rawPath,'utf8') : null;
  const after = nativeRuns.after as Native;
  receipts.push({name,deckHashBefore:beforeHash,deckHashAfter:hash(deck),includesBefore:beforeIncludes,includesAfter:includes(),native:nativeRuns,
    reference:{invocation,cwd:run,exit:ref.status,signal:ref.signal,error:ref.error?.message??null,milliseconds:performance.now()-start,
      acRows:raw?.includes('Plotname: AC Analysis') ? rawAC(raw).rows : null,log:ref.stdout+ref.stderr},
    ...metrics(after,raw?.includes('Plotname: AC Analysis')?raw:null)});
}
writeFileSync(resolve(here,'comparison.json'),JSON.stringify({baseline:'d4b1ce04b70f98986d825d1daee64fabcfc7ae61',
  sourceHashes:{beforeDC:hash(resolve(run,'baseline/packages/core/src/analysis/dc.ts')),afterDC:hash(resolve('packages/core/src/analysis/dc.ts'))},
  host:{platform:platform(),release:release(),cpu:cpus()[0].model,node:process.version},ngspiceVersion:spawnSync('ngspice',['--version'],{encoding:'utf8'}).stdout,
  configuration:'set ngbehavior=ltps\nset filetype=ascii\n',timeoutMs:30000,metrics:'complex node-voltage relative error at every matched frequency, denominator = reference phasor magnitude; max and RMS across all nodes/rows',receipts},null,2)+'\n');
console.log(receipts.map(r=>({name:r.name,native:r.native,referenceRows:r.reference.acRows,maxError:r.maxError,rmsError:r.rmsError})));
