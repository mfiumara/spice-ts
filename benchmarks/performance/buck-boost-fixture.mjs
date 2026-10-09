/**
 * Project-authored inverting buck-boost from examples/showcase/main.tsx and
 * issue #40. The same returned bytes are supplied to spice-ts and ngspice.
 */
const BODY = `* Buck-boost (inverting) — neg node is the negative output rail
* Vin=12V, D=50%, f=100kHz; project-authored MIT fixture from issue #40
Vin in 0 DC 12
Vg gate 0 PULSE(0 15 0 100n 100n 4.8u 10u)
.model NMOD NMOS(VTO=2 KP=10)
.model DMOD D(IS=1e-14 N=1)
M1 in gate sw 0 NMOD W=1m L=1u
L1 sw n1 100u
D1 n1 0 DMOD
C1 n1 neg 100u
Rload neg 0 10
.options method=gear
`;

export function buckBoostNetlist(mode = 'full') {
  if (mode !== 'full' && mode !== 'smoke') throw new Error(`unsupported benchmark mode: ${mode}`);
  const stop = mode === 'full' ? '5m' : '50u';
  return `${BODY}.tran 50n ${stop}\n.end\n`;
}

export const BUCK_BOOST_FULL_NETLIST = buckBoostNetlist('full');
