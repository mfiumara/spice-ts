export interface AdvancedShowcaseDemo {
  id: string;
  name: string;
  desc: string;
  icon: string;
  group: string;
  tag: '.ac' | '.tran';
  signals: string[];
  acNetlist?: string;
  tranNetlist?: string;
  parity: {
    reference: 'ngspice-47';
    maxAbsoluteError: number;
    rmsAbsoluteError: number;
  };
}

const LINEAR_AC_PARITY = {
  reference: 'ngspice-47' as const,
  maxAbsoluteError: 1e-12,
  rmsAbsoluteError: 1e-12,
};

const SHOWCASE_TRANSIENT_PARITY = {
  reference: 'ngspice-47' as const,
  maxAbsoluteError: 2e-3,
  rmsAbsoluteError: 5e-4,
};

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
  parity: LINEAR_AC_PARITY,
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

export const PASSIVE_NOTCH_DEMO: AdvancedShowcaseDemo = {
  id: 'passive-notch',
  name: 'Passive Notch Filter',
  desc: '5.03kHz series-LC rejection',
  icon: '\u236E',
  group: 'Filters',
  tag: '.ac',
  signals: ['out'],
  acNetlist: `
* Passive notch — series LC shunts the 5.03 kHz stop frequency
V1 in 0 AC 1
Rsource in out 1k
Rload out 0 10k
Lnotch out notch 10m
Cnotch notch 0 100n
.ac dec 100 100 100k
.end`,
  parity: LINEAR_AC_PARITY,
};

export const OPAMP_DIFFERENTIATOR_DEMO: AdvancedShowcaseDemo = {
  id: 'opamp-differentiator',
  name: 'Op-Amp Differentiator',
  desc: 'Square wave to edge spikes',
  icon: '\u25B3',
  group: 'Opamp Circuits',
  tag: '.tran',
  signals: ['in', 'out'],
  tranNetlist: `
* Practical opamp differentiator — VCVS convention used by the showcase
V1 in 0 PULSE(-0.1 0.1 100u 10u 10u 490u 1m)
Cdiff in pre 10n
Rin pre nm 1k
Rf nm out 10k
Cf nm out 100p
E1 out 0 0 nm 1e6
.tran 0.25u 3m
.end`,
  parity: SHOWCASE_TRANSIENT_PARITY,
};

export const ADVANCED_SHOWCASE_DEMOS: AdvancedShowcaseDemo[] = [
  RLC_RESONANCE_DEMO,
  COMMON_SOURCE_AC_DEMO,
  PASSIVE_NOTCH_DEMO,
  OPAMP_DIFFERENTIATOR_DEMO,
];
