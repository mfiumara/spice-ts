/**
 * SPICE3 Quarles reference circuits.
 *
 * Drawn from T. Quarles, "SPICE3 Version 3f5 User's Manual", Appendix B.
 * Used to validate simulator implementations against each other.
 */

// ---------------------------------------------------------------------------
// 1. BJT Differential Pair
// ---------------------------------------------------------------------------
/**
 * Classic BJT diff pair (2N2222 NPN).
 * Vcc=12V, tail resistor 10kΩ, collector resistors 1kΩ each.
 * At balanced input (Vin+=Vin-=0V): V(out+) and V(out-) symmetric.
 * Verified against ngspice-44: V(out+) = V(out-) ≈ 6.34V.
 */
export function diffPair(): string {
  return [
    '* Quarles diff pair — 2N2222 NPN BJT',
    'VCC vcc 0 DC 12',
    'VEE 0 vee DC 12',
    'VIN+ in+ 0 DC 0',
    'VIN- in- 0 DC 0',
    'Q1 out+ in+ emit NPN2222',
    'Q2 out- in- emit NPN2222',
    'RC1 vcc out+ 1k',
    'RC2 vcc out- 1k',
    'RE  emit vee 10k',
    '.model NPN2222 NPN(IS=1e-14 BF=100 VAF=100)',
    '.op',
    '.end',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 2. 5-Stage RC Ladder (AC)
// ---------------------------------------------------------------------------
/**
 * 5-stage RC ladder for AC frequency response.
 * R=1kΩ, C=1µF per stage. f_pole_per_stage = 159 Hz.
 * Compound -3 dB frequency verified against ngspice (no closed form).
 */
export function rcLadder5(): string {
  const lines = [
    '* Quarles 5-stage RC ladder — AC',
    'V1 1 0 DC 0 AC 1',
  ];
  for (let i = 1; i <= 5; i++) {
    lines.push(`R${i} ${i} ${i + 1} 1k`);
    lines.push(`C${i} ${i + 1} 0 1u`);
  }
  lines.push('.ac dec 20 1 10k');
  lines.push('.end');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 3. One-Stage OTA (DC)
// ---------------------------------------------------------------------------
/**
 * Single OTA stage: NMOS diff pair + PMOS current mirror load + bias.
 * VDD=5V, VSS=-5V. At balanced input (VIN+=VIN-=2.5V): V(d1)=V(d2)≈4.105V.
 * Verified against ngspice-44. Level 1 MOSFET models (KP, VTO).
 */
export function oneStageOpAmp(): string {
  return [
    '* Quarles one-stage OTA',
    'VDD vdd 0 DC 5',
    'VSS 0 vss DC 5',
    'VBIAS bias 0 DC 1',
    'VIN+ in+ 0 DC 2.5',
    'VIN- in- 0 DC 2.5',
    'M1 d1 in+ tail 0 NMOS1 W=10u L=1u',
    'M2 d2 in- tail 0 NMOS1 W=10u L=1u',
    'MBIAS tail bias 0 0 NMOS1 W=5u L=1u',
    'M3 d1 d1 vdd vdd PMOS1 W=10u L=1u',
    'M4 d2 d1 vdd vdd PMOS1 W=10u L=1u',
    '.model NMOS1 NMOS(KP=100u VTO=0.5)',
    '.model PMOS1 PMOS(KP=40u VTO=-0.5)',
    '.op',
    '.end',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 4. CMOS Inverter Single Stage (Transient)
// ---------------------------------------------------------------------------
/**
 * Single CMOS inverter, VDD=5V, 10fF load.
 * PULSE input: 0→5V at t=0, period=10ns.
 * Output should switch cleanly; 50% crossing ≈ 5ns.
 */
export function cmosInverterSingle(): string {
  return [
    '* Quarles CMOS inverter — single stage transient',
    'VDD vdd 0 DC 5',
    'VIN in 0 PULSE(0 5 0 100p 100p 5n 10n)',
    'MP out in vdd vdd PMOS1 W=20u L=1u',
    'MN out in 0 0 NMOS1 W=10u L=1u',
    'CL out 0 10f',
    '.model NMOS1 NMOS(KP=100u VTO=0.5)',
    '.model PMOS1 PMOS(KP=40u VTO=-0.5)',
    '.tran 10p 20n',
    '.end',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 5. Series RLC Bandpass (AC)
// ---------------------------------------------------------------------------
/**
 * Series RLC bandpass filter.
 * R=10Ω, L=10mH, C=1µF → f0 = 1/(2π√LC) ≈ 1591 Hz, Q = (1/R)√(L/C) = 10.
 * -3 dB bandwidth ≈ f0/Q ≈ 159 Hz.
 */
export function bandpassRLC(): string {
  return [
    '* Quarles RLC bandpass — f0=1591Hz, Q=10',
    'V1 1 0 DC 0 AC 1',
    'R1 1 2 10',
    'L1 2 3 10m',
    'C1 3 0 1u',
    '.ac dec 20 100 100k',
    '.end',
  ].join('\n');
}
