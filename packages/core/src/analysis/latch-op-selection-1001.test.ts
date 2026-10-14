import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { resolveOptions } from '../types.js';
import { solveDCOperatingPoint } from './dc.js';

// Original reduction and model provenance: evidence/996/README.md.
// ngspice-47, `ngspice -n -b evidence/996/repro/latch.cir`.
// Full-precision reference retained in evidence/996/runs/k-5-latch-op.json.gz.
it('selects the ngspice-47 unseeded SRAM latch operating point (#1001)', () => {
  const deck = readFileSync(new URL('../../../../evidence/996/repro/latch.cir', import.meta.url), 'utf8');
  const { result, assembler } = solveDCOperatingPoint(parse(deck).compile(), resolveOptions());
  expect(result.voltage('12')).toBeCloseTo(4.999999946096958, 6);
  expect(result.voltage('13')).toBeCloseTo(1.367762560720779e-8, 6);
  expect(result.current('VDD')).toBeCloseTo(-1.05728915065e-11, 10);
  expect(assembler.operatingPointPhase).toBeUndefined();
});

// ngspice-47, the same deck with `.nodeset v(12)=0.2 v(13)=4.8`:
// `ngspice -n -b` reports V12=1.369410e-8, V13=5, I(VDD)=-1.05729e-11.
it('holds nodesets during startup but releases them before accepting the latch OP', () => {
  const deck = readFileSync(new URL('../../../../evidence/996/repro/latch.cir', import.meta.url), 'utf8')
    .replace('.op', '.nodeset v(12)=0.2 v(13)=4.8\n.op');
  const { result } = solveDCOperatingPoint(parse(deck).compile(), resolveOptions());
  expect(result.voltage('12')).toBeCloseTo(1.369410e-8, 6);
  expect(result.voltage('13')).toBeCloseTo(5, 6);
  expect(result.current('VDD')).toBeCloseTo(-1.05729e-11, 10);
});
