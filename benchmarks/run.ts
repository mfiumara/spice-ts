import { simulate } from '@spice-ts/core';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function generateResistorLadder(n: number): string {
  let netlist = `* Resistor ladder with ${n} nodes\n`;
  netlist += `V1 1 0 DC 5\n`;
  for (let i = 1; i <= n; i++) {
    const next = i < n ? String(i + 1) : '0';
    netlist += `R${i} ${i} ${next} 1k\n`;
  }
  netlist += `.op\n.end\n`;
  return netlist;
}

interface BenchmarkResult {
  name: string;
  nodes: number;
  timeMs: number;
  date: string;
}

async function runBenchmark(name: string, netlist: string, nodes: number): Promise<BenchmarkResult> {
  await simulate(netlist); // warmup

  const times: number[] = [];
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    await simulate(netlist);
    times.push(performance.now() - start);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  return {
    name,
    nodes,
    timeMs: Math.round(avg * 100) / 100,
    date: new Date().toISOString().split('T')[0],
  };
}

async function main() {
  console.log('spice-ts Benchmark Suite\n');
  console.log('========================\n');

  const results: BenchmarkResult[] = [];

  for (const n of [10, 100, 500, 1000]) {
    const netlist = generateResistorLadder(n);
    const result = await runBenchmark(`resistor-ladder-${n}`, netlist, n);
    results.push(result);
    console.log(`Resistor ladder (${n} nodes): ${result.timeMs}ms`);
  }

  console.log('\n========================');
  console.table(results);

  const outPath = resolve(__dirname, 'results.json');
  let history: BenchmarkResult[][] = [];
  if (existsSync(outPath)) {
    history = JSON.parse(readFileSync(outPath, 'utf-8'));
  }
  history.push(results);
  writeFileSync(outPath, JSON.stringify(history, null, 2));
  console.log(`\nResults saved to ${outPath}`);
}

main().catch(console.error);
