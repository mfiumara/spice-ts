/**
 * Benchmark circuit netlist generators.
 *
 * Each generator returns a SPICE netlist string compatible with both
 * spice-ts and ngspice. Circuits are parameterized by size (N) for
 * scalability benchmarks.
 */

// ---------------------------------------------------------------------------
// 1. Resistor Ladder (DC operating point scalability)
// ---------------------------------------------------------------------------
export function resistorLadder(n: number): string {
  const lines = [`* Resistor ladder — ${n} nodes`, `V1 1 0 DC 5`];
  for (let i = 1; i <= n; i++) {
    const next = i < n ? String(i + 1) : '0';
    lines.push(`R${i} ${i} ${next} 1k`);
  }
  lines.push(`.op`, `.end`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 2. RC Chain (transient + AC scalability — THE classic SPICE benchmark)
// ---------------------------------------------------------------------------
export function rcChain(n: number, opts?: { stopTime?: number; timestep?: number }): string {
  const tau = 1e-3 * n; // rough total tau = n * R*C
  const stopTime = opts?.stopTime ?? Math.min(5 * tau, 1);
  const timestep = opts?.timestep ?? stopTime / 500;

  const lines = [
    `* RC chain — ${n} stages, tau_per_stage = 1ms`,
    `V1 1 0 PULSE(0 5 0 1n 1n ${stopTime} ${stopTime * 2})`,
  ];
  for (let i = 1; i <= n; i++) {
    lines.push(`R${i} ${i} ${i + 1} 1k`);
    lines.push(`C${i} ${i + 1} 0 1u`);
  }
  lines.push(`.tran ${timestep} ${stopTime}`);
  lines.push(`.end`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 3. RC Chain AC sweep (frequency response scalability)
// ---------------------------------------------------------------------------
export function rcChainAC(n: number): string {
  const lines = [`* RC chain AC — ${n} stages`, `V1 1 0 DC 0 AC 1`];
  for (let i = 1; i <= n; i++) {
    lines.push(`R${i} ${i} ${i + 1} 1k`);
    lines.push(`C${i} ${i + 1} 0 1u`);
  }
  lines.push(`.ac dec 10 1 1MEG`);
  lines.push(`.end`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 4. RLC Series Resonance (accuracy test — damped oscillation)
// ---------------------------------------------------------------------------
export function rlcResonance(): string {
  // f_res = 1/(2π√(LC)) = 1/(2π√(10m * 1µ)) ≈ 1591.5 Hz
  // Q = (1/R)√(L/C) = (1/10)√(10m/1µ) = 10
  // Use short pulse (10µs << period ≈ 628µs) to excite free oscillation
  return [
    `* RLC series resonance — f_res ≈ 1.59kHz, Q = 10`,
    `V1 1 0 PULSE(0 1 0 1n 1n 10u 100)`,
    `R1 1 2 10`,
    `L1 2 3 10m`,
    `C1 3 0 1u`,
    `.tran 0.5u 10m`,
    `.end`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 5. CMOS Inverter Chain (nonlinear transient scalability)
// ---------------------------------------------------------------------------
export function cmosInverterChain(n: number): string {
  const lines = [
    `* CMOS inverter chain — ${n} stages`,
    `.model NMOD NMOS (VTO=0.7 KP=120u LAMBDA=0.04)`,
    `.model PMOD PMOS (VTO=-0.7 KP=60u LAMBDA=0.05)`,
    `VDD vdd 0 DC 3.3`,
    `VIN in 0 PULSE(0 3.3 0 0.1n 0.1n 5n 10n)`,
  ];

  let prevNode = 'in';
  for (let i = 1; i <= n; i++) {
    const outNode = i < n ? `n${i}` : 'out';
    lines.push(`MP${i} ${outNode} ${prevNode} vdd PMOD`);
    lines.push(`MN${i} ${outNode} ${prevNode} 0 NMOD`);
    // Load capacitance on each stage
    lines.push(`CL${i} ${outNode} 0 10f`);
    prevNode = outNode;
  }
  lines.push(`.tran 0.01n 20n`);
  lines.push(`.end`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 6. CMOS Ring Oscillator (convergence stress test)
// ---------------------------------------------------------------------------
export function cmosRingOscillator(n: number): string {
  if (n % 2 === 0) n++; // Must be odd
  const lines = [
    `* CMOS ring oscillator — ${n} stages`,
    `.model NMOD NMOS (VTO=0.7 KP=120u LAMBDA=0.04)`,
    `.model PMOD PMOS (VTO=-0.7 KP=60u LAMBDA=0.05)`,
    `VDD vdd 0 DC 3.3`,
  ];

  for (let i = 1; i <= n; i++) {
    const inNode = i === 1 ? `n${n}` : `n${i - 1}`;
    const outNode = `n${i}`;
    lines.push(`MP${i} ${outNode} ${inNode} vdd PMOD`);
    lines.push(`MN${i} ${outNode} ${inNode} 0 NMOD`);
    lines.push(`CL${i} ${outNode} 0 10f`);
  }
  // Need an initial condition to kick-start oscillation
  lines.push(`.ic V(n1)=3.3`);
  lines.push(`.tran 0.01n 50n`);
  lines.push(`.end`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 7. Diode Full-Wave Bridge Rectifier (nonlinear transient accuracy)
// ---------------------------------------------------------------------------
export function diodeBridgeRectifier(): string {
  return [
    `* Full-wave diode bridge rectifier with RC filter`,
    `.model DMOD D (IS=1e-12 N=1.5 BV=100)`,
    `V1 in 0 SIN(0 10 60)`,
    `D1 in p DMOD`,
    `D2 0 in_neg DMOD`,
    `D3 in_neg p DMOD`,
    `D4 0 in_pos DMOD`,
    `R_neg in in_neg 0.001`,
    `R_pos in in_pos 0.001`,
    `R1 p n 1k`,
    `C1 p n 100u`,
    `R2 n 0 1k`,
    `.tran 100u 50m`,
    `.end`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 8. BJT Common-Emitter Amplifier (nonlinear DC + AC accuracy)
// ---------------------------------------------------------------------------
export function bjtCEAmplifier(): string {
  return [
    `* BJT common-emitter amplifier`,
    `.model QNPN NPN (BF=200 IS=1e-14 VAF=100)`,
    `VCC vcc 0 DC 12`,
    `VIN in 0 DC 0 AC 1`,
    `* Bias network`,
    `R1 vcc b 47k`,
    `R2 b 0 10k`,
    `* Emitter degeneration`,
    `RE e 0 1k`,
    `* Collector load`,
    `RC vcc c 4.7k`,
    `* Coupling caps`,
    `CIN in b 10u`,
    `COUT c out 10u`,
    `* Output load`,
    `RL out 0 10k`,
    `Q1 c b e QNPN`,
    `.op`,
    `.ac dec 20 10 10MEG`,
    `.end`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 9. MOSFET Common-Source Amplifier (AC benchmark)
// ---------------------------------------------------------------------------
export function mosfetCSAmplifier(): string {
  return [
    `* MOSFET common-source amplifier`,
    `.model NMOD NMOS (VTO=1 KP=2m LAMBDA=0.02)`,
    `VDD vdd 0 DC 5`,
    `VIN in 0 DC 0 AC 1`,
    `RD vdd d 2k`,
    `RS s 0 500`,
    `RG in g 100k`,
    `CIN in g 1u`,
    `COUT d out 1u`,
    `RL out 0 10k`,
    `M1 d g s NMOD`,
    `.op`,
    `.ac dec 20 10 100MEG`,
    `.end`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 10. LC Ladder / Transmission Line (wave propagation)
// ---------------------------------------------------------------------------
export function lcLadder(n: number): string {
  // Z0 = sqrt(L/C) = sqrt(1u/1n) ≈ 31.6Ω, delay per section ≈ sqrt(LC) ≈ 31.6ps
  const totalDelay = n * 31.6e-12;
  const stopTime = Math.max(totalDelay * 10, 10e-9);
  const lines = [
    `* LC ladder (transmission line model) — ${n} sections`,
    `V1 1 0 PULSE(0 1 0 0.1n 0.1n ${stopTime / 2} ${stopTime})`,
    `RS 1 2 31.6`,
  ];
  for (let i = 0; i < n; i++) {
    const nodeA = i === 0 ? '2' : `n${i}`;
    const nodeB = `n${i + 1}`;
    lines.push(`L${i + 1} ${nodeA} ${nodeB} 1u`);
    lines.push(`C${i + 1} ${nodeB} 0 1n`);
  }
  lines.push(`RL n${n} 0 31.6`);
  lines.push(`.tran ${stopTime / 1000} ${stopTime}`);
  lines.push(`.end`);
  return lines.join('\n');
}
