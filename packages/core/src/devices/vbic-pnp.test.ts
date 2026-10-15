import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

// Mirror every independent excitation, including the substrate and AC source.
// The physical terminal currents/voltages negate; the small-signal Jacobians do not.
function deck(polarity: 1 | -1, td: number): string {
  return `VBIC polarity symmetry
VCC supply 0 ${polarity * 2}
VB b 0 DC ${polarity * 0.7} AC ${polarity}
VE e 0 ${polarity * 0.1}
VS s 0 ${polarity * -0.2}
RC supply c 1k
Q1 c b e s model AREA=2 M=3
.model model ${polarity === 1 ? 'NPN' : 'PNP'} (LEVEL=4 IS=1e-16 IBEI=1e-18
+ IBCI=2e-17 ISP=1e-15 RCX=10 RCI=60 RBX=10 RBI=40 RE=2 RS=20 RBP=40
+ VEF=10 VER=4 IKF=2m IKR=0.2m IKP=0.2m CJE=1p CJC=0.2p
+ CJEP=1p CJCP=4p TF=10p TR=100p TD=${td})
.op
.dc VB ${polarity * 0.5} ${polarity * 0.8} ${polarity * 0.05}
.ac dec 2 1k 1g
.end`;
}

describe('VBIC PNP polarity', () => {
  for (const td of [0, 2e-11]) {
    it(`mirrors NPN OP/DC/AC terminal quantities with TD=${td}`, async () => {
      const npn = await simulate(deck(1, td));
      const pnp = await simulate(deck(-1, td));
      for (const [node, current] of [
        ['c', false], ['b', false], ['e', false], ['s', false],
        ['VCC', true], ['VB', true], ['VE', true], ['VS', true],
      ] as const) {
        const nOp = current ? npn.dc!.current(node) : npn.dc!.voltage(node);
        const pOp = current ? pnp.dc!.current(node) : pnp.dc!.voltage(node);
        expect(pOp).toBeCloseTo(-nOp, 10);
        const nDc = current ? npn.dcSweep!.current(node) : npn.dcSweep!.voltage(node);
        const pDc = current ? pnp.dcSweep!.current(node) : pnp.dcSweep!.voltage(node);
        expect(pDc).toHaveLength(nDc.length);
        nDc.forEach((value, index) => expect(pDc[index]).toBeCloseTo(-value, 10));
        const nAc = current ? npn.ac!.current(node) : npn.ac!.voltage(node);
        const pAc = current ? pnp.ac!.current(node) : pnp.ac!.voltage(node);
        expect(pAc).toHaveLength(nAc.length);
        nAc.forEach((value, index) => {
          const radians = value.phase * Math.PI / 180;
          const mirrored = pAc[index];
          const mirroredRadians = mirrored.phase * Math.PI / 180;
          expect(mirrored.magnitude * Math.cos(mirroredRadians))
            .toBeCloseTo(-value.magnitude * Math.cos(radians), 9);
          expect(mirrored.magnitude * Math.sin(mirroredRadians))
            .toBeCloseTo(-value.magnitude * Math.sin(radians), 9);
        });
      }
    });
  }
});
