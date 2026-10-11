// node inproc.mjs <distA> <distB> <circuit> <nodes> <rounds>: alternating in-process CPU per simulate()
import { pathToFileURL } from 'node:url';
const [a, b, circuit, nodesArg, roundsArg] = process.argv.slice(2);
const { m2Netlist } = await import(pathToFileURL(process.cwd() + '/benchmarks/performance/scaling-m2-fixture.mjs').href);
const { netlist } = m2Netlist(circuit, Number(nodesArg));
const A = await import(pathToFileURL(a + '/index.js').href);
const B = await import(pathToFileURL(b + '/index.js').href);
await A.simulate(netlist); await B.simulate(netlist);
const res = { a: [], b: [] };
for (let r = 0; r < Number(roundsArg); r++) {
  for (const [k, M] of r % 2 ? [['a', A], ['b', B]] : [['b', B], ['a', A]]) {
    const c0 = process.cpuUsage(); const t0 = performance.now();
    await M.simulate(netlist);
    const c = process.cpuUsage(c0);
    res[k].push((c.user + c.system) / 1000);
  }
}
const med = xs => [...xs].sort((x, y) => x - y)[xs.length >> 1];
console.log(circuit, nodesArg, 'A median cpu', med(res.a).toFixed(1), 'B median cpu', med(res.b).toFixed(1), 'A/B', (med(res.a) / med(res.b)).toFixed(3));
