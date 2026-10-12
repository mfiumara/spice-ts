import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

// Issue #757: MOS1 drain/source prime nodes follow ngspice-47 mos1set.c, which creates the
// drain prime node when RD != 0 || (RSH != 0 && NRD != 0) (the source likewise with RS/NRS),
// while mos1temp.c sets the drain conductance to 0 when RD is *given* as 0. With RD=0 (RS=0)
// given and a non-zero RSH the prime node is therefore connected to nothing but the intrinsic
// device: the terminal is open. Zero squares (NRD=0 / NRS=0) never create the prime node, so
// those terminals stay shorted.
//
// ngspice-47 reference: `ngspice -b` on DECK, `print` with numdgt=12.
const NGSPICE: Record<string, number> = {
  DA: 5.0, // RD=0 given, RSH=50, NRD=2: drain open, no drain current.
  DB: 4.999999991659, // RS=0 given, RSH=50, NRS=3: source open.
  SB: 0,
  DC: 1.933442675814, // RD=0 given, RSH=50, NRD=0: no prime node, drain shorted.
  DD: 2.157361109051, // RS=0 given, RSH=50, NRS=0: no prime node, source shorted.
  SD: 0.284263888863,
  DE: 1.842169680702, // RD/RS not given, RSH=50: 50 ohm drain, NRS=0 shorts the source.
};

const DECK = [
  'MOS1 RD/RS = 0 given with RSH: open terminal (mos1set.c/mos1temp.c)',
  'VDD VDD 0 5',
  'VIN IN 0 5',
  'MA DA IN 0 0 NRD0 L=5u W=175u NRD=2',
  'RA VDD DA 1K',
  'MB DB IN SB 0 NRS0 L=5u W=175u NRS=3',
  'RB VDD DB 1K',
  'RSB SB 0 100',
  'MC DC IN 0 0 NRD0 L=5u W=175u NRD=0',
  'RC VDD DC 1K',
  'MD DD IN SD 0 NRS0 L=5u W=175u NRS=0',
  'RD2 VDD DD 1K',
  'RSD SD 0 100',
  'ME DE IN 0 0 NSH L=5u W=175u NRS=0',
  'RE VDD DE 1K',
  '.MODEL NRD0 NMOS (LEVEL=1 VTO=1.679 KP=2.161E-05 RD=0 RSH=50)',
  '.MODEL NRS0 NMOS (LEVEL=1 VTO=1.679 KP=2.161E-05 RS=0 RSH=50)',
  '.MODEL NSH NMOS (LEVEL=1 VTO=1.679 KP=2.161E-05 RSH=50)',
  '.OP',
  '.END',
].join('\n');

describe('MOS1 RD/RS = 0 with RSH terminal semantics (#757)', () => {
  it('opens the terminal when RD/RS = 0 is given with RSH and non-zero squares, like ngspice-47', async () => {
    const op = (await simulate(DECK)).dc!;
    for (const [node, expected] of Object.entries(NGSPICE)) {
      // Both engines stop Newton at RELTOL = 1e-3; 2e-4 relative is well inside that. Shorting
      // the open terminals instead gives v(da) = 1.93344 V and v(db) = 2.15736 V.
      expect(Math.abs(op.voltage(node) - expected), node).toBeLessThan(2e-4 * Math.abs(expected) + 1e-6);
    }
  });

  it('scales the RSH*NRD series resistance by M (mos1temp.c drainConductance = M / (RSH*NRD))', async () => {
    const deck = (multiplier: string) => [
      'rsh m',
      'VDD VDD 0 5',
      'VIN IN 0 5',
      `MS DS IN 0 0 NSH L=5u W=175u NRD=4 NRS=2${multiplier}`,
      'RS VDD DS 300',
      '.MODEL NSH NMOS (LEVEL=1 VTO=1.679 KP=2.161E-05 RSH=50)',
      '.OP',
      '.END',
    ].join('\n');
    // ngspice-47 (numdgt=12): v(ds) = 3.110094370685 with M=2, 3.989646684917 without M.
    for (const [multiplier, expected] of [[' M=2', 3.110094370685], ['', 3.989646684917]] as const) {
      const op = (await simulate(deck(multiplier))).dc!;
      expect(Math.abs(op.voltage('DS') - expected), multiplier).toBeLessThan(2e-4 * expected);
    }
  });
});
