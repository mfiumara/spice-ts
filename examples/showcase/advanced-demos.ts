export interface AdvancedShowcaseDemo {
  id: string;
  name: string;
  desc: string;
  icon: string;
  group: string;
  tag: '.ac';
  signals: string[];
  acNetlist: string;
  parity: {
    reference: 'ngspice-47';
    maxAbsoluteError: number;
    rmsAbsoluteError: number;
  };
}

export const RLC_RESONANCE_DEMO: AdvancedShowcaseDemo = {
  id: 'rlc-resonance',
  name: 'Series RLC Resonance',
  desc: '5.03kHz resonant response',
  icon: '\u236E',
  group: 'Filters',
  tag: '.ac',
  signals: ['out'],
  acNetlist: `
* Series RLC low-pass — resonant peaking at 5.03 kHz
V1 in 0 AC 1
R1 in mid 100
L1 mid out 10m
C1 out 0 100n
.ac dec 100 100 100k
.end`,
  parity: {
    reference: 'ngspice-47',
    maxAbsoluteError: 1e-12,
    rmsAbsoluteError: 1e-12,
  },
};

export const COMMON_SOURCE_AC_DEMO: AdvancedShowcaseDemo = {
  id: 'common-source-ac',
  name: 'Common-Source AC Gain',
  desc: 'Validated Level 1 MOS gain stage',
  icon: '\u23DA',
  group: 'Non-Linear',
  tag: '.ac',
  signals: ['out'],
  acNetlist: `
* NMOS common-source amplifier — validated against ngspice-47
VDD vdd 0 DC 5
VGS in 0 DC 1.5 AC 1
.model NMOD NMOS(VTO=1 KP=1e-4)
M1 out in 0 0 NMOD W=100u L=1u
RD vdd out 10k
.op
.ac dec 100 1 10Meg
.end`,
  parity: {
    reference: 'ngspice-47',
    maxAbsoluteError: 1e-5,
    rmsAbsoluteError: 1e-5,
  },
};

export const ADVANCED_SHOWCASE_DEMOS: AdvancedShowcaseDemo[] = [
  RLC_RESONANCE_DEMO,
  COMMON_SOURCE_AC_DEMO,
];
