import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { parse, simulate, simulateProtocolV1 } from '../../packages/core/src/index.js';

// Distinct sweeps and two measurements prove execution, not just parsing.
const source = `Repeated dot-card core execution probe
V1 in 0 1 ac 1
R1 in 0 1k
.dc V1 0 2 1
.dc V1 3 5 1
.meas dc average avg v(in)
.op
.op
.end
`;
const circuit = parse(source);
assert.deepEqual(circuit.analyses.map(a => a.type), ['dc', 'dc', 'op', 'op']);
const native = await simulate(circuit);
assert.deepEqual(native.measurements?.map(m => m.value), [1, 4]);
assert.deepEqual(Array.from(native.dcSweep!.sweepValues), [3, 4, 5]);
assert.equal(native.convergence?.dc.acceptedSolves, 8);
const protocol = await simulateProtocolV1({ apiVersion: '1', input: { format: 'spice', source: source.slice(source.indexOf('\n') + 1) } });
assert.deepEqual(protocol.analyses.map(a => a.type), ['dc', 'dc', 'op', 'op']);
const receipt = {
  finding: 'All four cards already execute. Native aggregate fields retain only the last result per type; protocol v1 retains every analysis.',
  parsedAnalyses: circuit.analyses,
  nativeMeasurementValues: native.measurements?.map(m => m.value),
  nativeFinalSweep: Array.from(native.dcSweep!.sweepValues),
  nativeAcceptedDCSolves: native.convergence?.dc.acceptedSolves,
  protocolAnalysisTypes: protocol.analyses.map(a => a.type),
  fixtures: JSON.parse(readFileSync(new URL('./ngspice-semantics.json', import.meta.url), 'utf8')).map((f: { fixture: string; deck: string }) => ({
    fixture: f.fixture,
    parsedAnalysisTypes: parse(readFileSync(f.deck, 'utf8')).analyses.map(a => a.type),
  })),
};
writeFileSync(new URL('./core-semantics.json', import.meta.url), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
