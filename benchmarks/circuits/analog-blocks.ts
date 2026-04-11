/**
 * Analog building block circuit generators using BSIM3v3 models.
 *
 * Each generator returns a SPICE netlist string compatible with both
 * spice-ts and ngspice. Circuits use realistic sub-micron MOSFET parameters.
 */

// ---------------------------------------------------------------------------
// Shared BSIM3v3 model cards (LEVEL=49)
// ---------------------------------------------------------------------------
const NMOS = `NMOD NMOS (LEVEL=49 VTH0=0.5 K1=0.6 U0=400 TOX=4n VSAT=1.5e5 PCLM=1.3 PDIBLC1=0.39 PDIBLC2=0.0086 CGSO=2.5e-10 CGDO=2.5e-10 CJ=1e-3 CJSW=5e-10 MJ=0.5 PB=1)`;
const PMOS = `PMOD PMOS (LEVEL=49 VTH0=-0.5 K1=0.6 U0=150 TOX=4n VSAT=1.2e5 PCLM=1.3 PDIBLC1=0.39 PDIBLC2=0.0086 CGSO=2.5e-10 CGDO=2.5e-10 CJ=1e-3 CJSW=5e-10 MJ=0.5 PB=1)`;

// ---------------------------------------------------------------------------
// 1. Current Mirror (NMOS 1:1)
// ---------------------------------------------------------------------------
/**
 * 2-transistor NMOS 1:1 current mirror.
 * IREF=100µA through diode-connected M1, M2 mirrors to load RD=10k.
 * VDD=1.8V. Analysis: .op
 */
export function currentMirror(): string {
  return [
    `* NMOS 1:1 current mirror — IREF=100uA, RD=10k load`,
    `.model ${NMOS}`,
    `VDD vdd 0 DC 1.8`,
    `* Reference current source`,
    `IREF vdd ref 100u`,
    `* M1: diode-connected (gate tied to drain)`,
    `M1 ref ref 0 0 NMOD W=2u L=0.18u`,
    `* M2: mirror output`,
    `M2 out ref 0 0 NMOD W=2u L=0.18u`,
    `* Load resistor on mirror output`,
    `RD vdd out 10k`,
    `.op`,
    `.end`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 2. Cascode Amplifier (NMOS input + cascode, PMOS diode load)
// ---------------------------------------------------------------------------
/**
 * NMOS cascode amplifier with PMOS diode-connected load.
 * M1 input transistor, M2 cascode, M3 PMOS load.
 * VDD=1.8V. Analysis: .op + .ac dec 20 10 1G
 */
export function cascodeAmplifier(): string {
  return [
    `* NMOS cascode amplifier with PMOS diode load`,
    `.model ${NMOS}`,
    `.model ${PMOS}`,
    `VDD vdd 0 DC 1.8`,
    `VIN in 0 DC 0.9 AC 1`,
    `* Bias voltage for cascode gate`,
    `VBIAS vbias 0 DC 1.2`,
    `* M1: input (common-source)`,
    `M1 mid in 0 0 NMOD W=4u L=0.18u`,
    `* M2: cascode`,
    `M2 out vbias mid 0 NMOD W=4u L=0.18u`,
    `* M3: PMOS diode-connected load`,
    `M3 out out vdd vdd PMOD W=2u L=0.18u`,
    `.op`,
    `.ac dec 20 10 1G`,
    `.end`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 3. Miller-Compensated Two-Stage Op-Amp
// ---------------------------------------------------------------------------
/**
 * Two-stage Miller compensated op-amp.
 * Stage 1: NMOS diff pair (M1,M2) + PMOS active load mirror (M3,M4) + PMOS tail (MTAIL).
 * Stage 2: NMOS common-source (M5) + PMOS current source (M6).
 * Miller cap CC=1p + nulling resistor Rz=500. Load CL=5p.
 * VINp=VINm=0.9V (common mode). Analysis: .op + .ac dec 20 1 1G
 */
export function millerOpAmp(): string {
  return [
    `* Two-stage Miller compensated op-amp`,
    `.model ${NMOS}`,
    `.model ${PMOS}`,
    `VDD vdd 0 DC 1.8`,
    `VSS 0 0 DC 0`,
    `VINp vinp 0 DC 0.9 AC 0.5`,
    `VINm vinm 0 DC 0.9 AC -0.5`,
    `* Bias current source`,
    `IBIAS vdd vbias 50u`,
    `* Tail current mirror bias — PMOS diode-connected`,
    `MTAILB vbp vbias vdd vdd PMOD W=4u L=0.18u`,
    `* Tail current source`,
    `MTAIL tail vbp vdd vdd PMOD W=8u L=0.18u`,
    `* Differential pair`,
    `M1 d1 vinp tail tail NMOD W=4u L=0.18u`,
    `M2 d2 vinm tail tail NMOD W=4u L=0.18u`,
    `* PMOS active load mirror`,
    `M3 d1 d1 vdd vdd PMOD W=4u L=0.18u`,
    `M4 d2 d1 vdd vdd PMOD W=4u L=0.18u`,
    `* Second stage — common-source NMOS`,
    `M5 vout d2 0 0 NMOD W=8u L=0.18u`,
    `* Second stage current source PMOS`,
    `M6 vout vbp vdd vdd PMOD W=4u L=0.18u`,
    `* Miller compensation: nulling resistor + capacitor`,
    `Rz d2 cc_node 500`,
    `CC cc_node vout 1p`,
    `* Output load`,
    `CL vout 0 5p`,
    `.op`,
    `.ac dec 20 1 1G`,
    `.end`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 4. Folded-Cascode Op-Amp
// ---------------------------------------------------------------------------
/**
 * Folded-cascode op-amp.
 * PMOS differential pair (M1,M2), NMOS tail current source (MTAIL).
 * NMOS folded cascode (M5,M6) + PMOS cascode load (M7,M8,M9,M10).
 * Bias network: MBIAS1..MBIAS4. Load CL=5p.
 * Analysis: .op + .ac dec 20 1 1G
 */
export function foldedCascodeOpAmp(): string {
  return [
    `* Folded-cascode op-amp — PMOS diff pair, NMOS folded cascode, PMOS cascode load`,
    `.model ${NMOS}`,
    `.model ${PMOS}`,
    `VDD vdd 0 DC 1.8`,
    `VINp vinp 0 DC 0.9 AC 0.5`,
    `VINm vinm 0 DC 0.9 AC -0.5`,
    `* Bias current reference`,
    `IBIAS vdd vb1 100u`,
    `* Bias mirrors`,
    `MBIAS1 vb1 vb1 0 0 NMOD W=2u L=0.18u`,
    `MBIAS2 vb2 vb1 0 0 NMOD W=4u L=0.18u`,
    `MBIAS3 vbp1 vbp1 vdd vdd PMOD W=2u L=0.18u`,
    `MBIAS4 vbp2 vbp1 vdd vdd PMOD W=4u L=0.18u`,
    `* PMOS differential pair`,
    `M1 d1 vinp vdd vdd PMOD W=8u L=0.18u`,
    `M2 d2 vinm vdd vdd PMOD W=8u L=0.18u`,
    `* NMOS folded cascode — input side`,
    `M5 fc1 vb2 d1 0 NMOD W=4u L=0.18u`,
    `M6 fc2 vb2 d2 0 NMOD W=4u L=0.18u`,
    `* NMOS folded cascode tail current sources`,
    `MFCS1 d1 vb1 0 0 NMOD W=4u L=0.18u`,
    `MFCS2 d2 vb1 0 0 NMOD W=4u L=0.18u`,
    `* PMOS cascode load`,
    `M7 fc1 vbp2 vdd vdd PMOD W=4u L=0.18u`,
    `M8 vout vbp2 vdd vdd PMOD W=4u L=0.18u`,
    `M9 fc1 fc1 0 0 NMOD W=2u L=0.18u`,
    `M10 vout fc1 0 0 NMOD W=2u L=0.18u`,
    `* Output load`,
    `CL vout 0 5p`,
    `.op`,
    `.ac dec 20 1 1G`,
    `.end`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 5. Bandgap Reference
// ---------------------------------------------------------------------------
/**
 * PTAT bandgap voltage reference.
 * PMOS mirror with 3 equal-sized copies (MREF, M1, M2).
 * Q1 diode-connected BJT, Q2 with degeneration R1=500.
 * Output bandgap voltage tapped through R2=20k.
 * VDD=1.8V. Analysis: .op
 */
export function bandgapReference(): string {
  return [
    `* Bandgap voltage reference — PMOS mirror + BJT PTAT core`,
    `.model ${PMOS}`,
    `.model QNPN NPN (BF=200 IS=1e-14 VAF=100)`,
    `VDD vdd 0 DC 1.8`,
    `* PMOS mirror reference (diode-connected)`,
    `MREF vref vref vdd vdd PMOD W=4u L=0.5u`,
    `* Mirror copy 1 — feeds Q1`,
    `M1 col1 vref vdd vdd PMOD W=4u L=0.5u`,
    `* Mirror copy 2 — feeds Q2 + PTAT resistor`,
    `M2 col2 vref vdd vdd PMOD W=4u L=0.5u`,
    `* Q1: diode-connected BJT (sets base voltage)`,
    `Q1 col1 col1 0 QNPN`,
    `* R1: emitter degeneration for Q2 (generates PTAT voltage)`,
    `R1 e2 0 500`,
    `* Q2: BJT with emitter degeneration`,
    `Q2 col2 col1 e2 QNPN`,
    `* R2: output resistor — taps bandgap voltage`,
    `R2 col2 vbg 20k`,
    `* Startup / bias resistor`,
    `RSTART vdd vref 500k`,
    `.op`,
    `.end`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 6. 6T SRAM Cell (static operating point)
// ---------------------------------------------------------------------------
/**
 * 6T SRAM cell — cross-coupled inverters + access transistors.
 * Inverter 1: MP1 (PMOS) + MN1 (NMOS), output Q.
 * Inverter 2: MP2 (PMOS) + MN2 (NMOS), output QB.
 * Access transistors: MNA1 (BL-Q), MNA2 (BLB-QB).
 * VDD=1.8V, WL=1.8V (cell selected), BL=BLB=1.8V (precharge).
 * Analysis: .op
 */
export function sramCell(): string {
  return [
    `* 6T SRAM cell — static DC operating point`,
    `.model ${NMOS}`,
    `.model ${PMOS}`,
    `VDD vdd 0 DC 1.8`,
    `VWL wl 0 DC 1.8`,
    `VBL bl 0 DC 1.8`,
    `VBLB blb 0 DC 1.8`,
    `* Inverter 1: Q = /QB`,
    `MP1 q qb vdd vdd PMOD W=1u L=0.18u`,
    `MN1 q qb 0 0 NMOD W=0.5u L=0.18u`,
    `* Inverter 2: QB = /Q`,
    `MP2 qb q vdd vdd PMOD W=1u L=0.18u`,
    `MN2 qb q 0 0 NMOD W=0.5u L=0.18u`,
    `* Access transistors`,
    `MNA1 bl wl q 0 NMOD W=0.5u L=0.18u`,
    `MNA2 blb wl qb 0 NMOD W=0.5u L=0.18u`,
    `.op`,
    `.end`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 7. 6T SRAM Cell — Write Transient
// ---------------------------------------------------------------------------
/**
 * 6T SRAM cell transient write operation.
 * Initial condition: Q=1.8V (stored '1'). Write '0': BL pulled low, BLB high.
 * WL pulsed high after 1ns. Write cycle 2ns.
 * Analysis: .tran 10p 10n
 */
export function sramCellTransient(): string {
  return [
    `* 6T SRAM cell — write transient (write '0' operation)`,
    `.model ${NMOS}`,
    `.model ${PMOS}`,
    `VDD vdd 0 DC 1.8`,
    `* Word line: pulse high at 1ns to enable access`,
    `VWL wl 0 PULSE(0 1.8 1n 50p 50p 3n 10n)`,
    `* BL: pulled low to write '0' into Q`,
    `VBL bl 0 PULSE(1.8 0 0.5n 50p 50p 5n 10n)`,
    `* BLB: stays high (complementary)`,
    `VBLB blb 0 DC 1.8`,
    `* Inverter 1: Q = /QB`,
    `MP1 q qb vdd vdd PMOD W=1u L=0.18u`,
    `MN1 q qb 0 0 NMOD W=0.5u L=0.18u`,
    `* Inverter 2: QB = /Q`,
    `MP2 qb q vdd vdd PMOD W=1u L=0.18u`,
    `MN2 qb q 0 0 NMOD W=0.5u L=0.18u`,
    `* Access transistors`,
    `MNA1 bl wl q 0 NMOD W=0.5u L=0.18u`,
    `MNA2 blb wl qb 0 NMOD W=0.5u L=0.18u`,
    `* Initial condition: cell stores '1' (Q=VDD, QB=0)`,
    `.ic V(q)=1.8 V(qb)=0`,
    `.tran 10p 10n`,
    `.end`,
  ].join('\n');
}
