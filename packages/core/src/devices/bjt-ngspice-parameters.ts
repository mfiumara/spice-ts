/**
 * Every name ngspice-47 INPgetMod (inpgmod.c create_model) resolves on an
 * npn/pnp card that selects the level-1/2 BJT: the bjt.c BJTmPTable model
 * parameters (aliases included), then the BJTpTable instance parameters
 * (a model-card instance name sets an instance default), plus LEVEL and M,
 * which it reads separately. Any other name prints "unrecognized parameter
 * (<name>) - ignored" and the card simulates without it (#767).
 */
const NGSPICE_BJT_NAMES: ReadonlySet<string> = new Set([
  // BJTmPTable (bjt.c)
  'TYPE', 'NPN', 'PNP', 'SUBS', 'TNOM', 'TREF', 'IS', 'IBE', 'IBC', 'BF', 'NF', 'VAF', 'VA',
  'IKF', 'IK', 'ISE', 'C2', 'NE', 'BR', 'NR', 'VAR', 'VB', 'IKR', 'ISC', 'C4', 'NC', 'RB',
  'IRB', 'RBM', 'RE', 'RC', 'CJE', 'VJE', 'PE', 'MJE', 'ME', 'TF', 'XTF', 'VTF', 'ITF', 'PTF',
  'CJC', 'VJC', 'PC', 'MJC', 'MC', 'XCJC', 'TR', 'CJS', 'CSUB', 'CCS', 'VJS', 'PS', 'MJS',
  'MS', 'XTB', 'EG', 'XTI', 'FC', 'KF', 'AF', 'INVEARLYVOLTF', 'INVEARLYVOLTR',
  'INVROLLOFFF', 'INVROLLOFFR', 'COLLECTORCONDUCT', 'EMITTERCONDUCT', 'TRANSTIMEVBCFACT',
  'EXCESSPHASEFACTOR', 'ISS', 'NS', 'RCO', 'VO', 'GAMMA', 'QCO', 'TLEV', 'TLEVC', 'TBF1',
  'TBF2', 'TBR1', 'TBR2', 'TIKF1', 'TIKF2', 'TIKR1', 'TIKR2', 'TIRB1', 'TIRB2', 'TNC1', 'TNC2',
  'TNE1', 'TNE2', 'TNF1', 'TNF2', 'TNR1', 'TNR2', 'TRB1', 'TRB', 'TRB2', 'TRC1', 'TRC', 'TRC2',
  'TRE1', 'TRE', 'TRE2', 'TRM1', 'TRM2', 'TVAF1', 'TVAF2', 'TVAR1', 'TVAR2', 'CTC', 'CTE',
  'CTS', 'TVJC', 'TVJE', 'TVJS', 'TITF1', 'TITF2', 'TTF1', 'TTF2', 'TTR1', 'TTR2', 'TMJE1',
  'TMJE2', 'TMJC1', 'TMJC2', 'TMJS1', 'TMJS2', 'TNS1', 'TNS2', 'NKF', 'NK', 'TIS1', 'TIS2',
  'TISE1', 'TISE2', 'TISC1', 'TISC2', 'TISS1', 'TISS2', 'QUASIMOD', 'VG', 'CN', 'D',
  'VBE_MAX', 'VBC_MAX', 'VCE_MAX', 'PD_MAX', 'IC_MAX', 'IB_MAX', 'TE_MAX', 'RTH0',
  // BJTpTable (bjt.c)
  'OFF', 'ICVBE', 'ICVCE', 'AREA', 'AREAB', 'AREAC', 'M', 'IC', 'SENS_AREA', 'COLNODE',
  'BASENODE', 'EMITNODE', 'SUBSTNODE', 'COLPRIMENODE', 'BASEPRIMENODE', 'EMITPRIMENODE', 'IB',
  'IE', 'VBE', 'VBC', 'GM', 'GPI', 'GMU', 'GX', 'GO', 'GEQCB', 'GCSUB', 'GDSUB', 'GEQBX', 'CPI',
  'CMU', 'CBX', 'CQBE', 'CQBC', 'CQSUB', 'CQBX', 'CEXBC', 'QBE', 'QBC', 'QSUB', 'QBX', 'P',
  'SENS_DC', 'SENS_REAL', 'SENS_IMAG', 'SENS_MAG', 'SENS_PH', 'SENS_CPLX', 'TEMP', 'DTEMP',
  // read by INPgetMod itself
  'LEVEL',
]);

/**
 * True when an npn/pnp card at this (already INPfindLev-mapped) level selects
 * ngspice-47's BJT device: inpdomod.c sends levels 0, 1 and 2 there (4/9 are
 * VBIC, 8 is HICUM2), and a card without LEVEL is level 1.
 */
export function selectsNgspiceBjt(type: string, level: number | undefined): boolean {
  return (type === 'NPN' || type === 'PNP') && (level === undefined || level <= 2);
}

/** Whether ngspice-47 INPgetMod recognises `name` (upper case) on a BJT card. */
export function isNgspiceBjtName(name: string): boolean {
  return NGSPICE_BJT_NAMES.has(name);
}
