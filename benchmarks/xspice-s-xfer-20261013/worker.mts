import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const [module, path, node = 'out'] = process.argv.slice(2);
const { simulate } = await import(pathToFileURL(resolve(module)).href);
const start = performance.now();
try {
  const result = await simulate(readFileSync(path, 'utf8'));

  let samples: unknown = null;
  if (result.transient) samples = { kind: 'tran', x: result.transient.time, y: result.transient.voltage(node) };
  else if (result.ac) samples = { kind: 'ac', x: result.ac.frequencies, y: result.ac.voltage(node).map((v: {magnitude: number; phase: number}) => [v.magnitude * Math.cos(v.phase * Math.PI / 180), v.magnitude * Math.sin(v.phase * Math.PI / 180)]) };
  else if (result.dcSweep) samples = { kind: 'dc', x: Array.from(result.dcSweep.sweepValues), y: Array.from(result.dcSweep.voltage(node)) };
  else if (result.dc) samples = { kind: 'op', x: [0], y: [result.dc.voltage(node)] };
  if (node !== 'out') {
    const summary = samples as { kind: string; x: number[]; y: unknown[] } | null;
    console.log(JSON.stringify({ status: 'success', milliseconds: performance.now() - start, samples: null,
      originalAnalysis: summary ? { kind: summary.kind, points: summary.x.length, first: summary.y[0], last: summary.y.at(-1) } : null }));
  } else console.log(JSON.stringify({ status: 'success', milliseconds: performance.now() - start, samples }));
} catch (error) {
  console.log(JSON.stringify({ status: 'failed', milliseconds: performance.now() - start, error: String((error as Error).message), samples: null }));
}
