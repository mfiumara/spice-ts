const EPSOX = 3.9 * 8.854e-12;
const EPSI = 11.7 * 8.854e-12;
const NI = 1.45e10;
const VT_300 = 0.02585;
const MIN_LEFF = 1e-9;

export interface BSIM3v3ModelParams {
  // Threshold
  VTH0: number; K1: number; K2: number; K3: number; K3B: number;
  W0: number; DVT0: number; DVT1: number; DVT2: number;
  NLX: number; VOFF: number; NFACTOR: number;
  // Mobility
  U0: number; UA: number; UB: number; UC: number; VSAT: number;
  // Drain current
  A0: number; AGS: number; A1: number; A2: number; KETA: number;
  RDSW: number; PRWB: number; PRWG: number; WR: number;
  // Output conductance
  PCLM: number; PDIBLC1: number; PDIBLC2: number; PDIBLCB: number; DROUT: number; PVAG: number;
  // Subthreshold
  CDSC: number; CDSCB: number; CDSCD: number; ETA0: number; ETAB: number; DSUB: number;
  // Geometry
  WINT: number; LINT: number; TOX: number; XJ: number; NCH: number; NSUB: number;
  // Capacitance
  CGSO: number; CGDO: number; CGBO: number; CJ: number; CJSW: number; CJSWG: number;
  MJ: number; MJSW: number; PB: number; PBSW: number;
}

export interface BSIM3v3InstanceParams {
  W: number; L: number;
  AS?: number; AD?: number; PS?: number; PD?: number;
}

export interface BSIM3v3Derived {
  Leff: number; Weff: number; Cox: number; phi_s: number; sqrtPhi: number;
  Vbi: number; litl: number; AD: number; AS: number; PD: number; PS: number;
}

export const BSIM3v3_DEFAULTS: Readonly<BSIM3v3ModelParams> = {
  VTH0: 0.5, K1: 0.6, K2: -0.1, K3: 80, K3B: 0,
  W0: 0, DVT0: 2.2, DVT1: 0.53, DVT2: -0.032,
  NLX: 1.74e-7, VOFF: -0.1, NFACTOR: 1.5,
  U0: 400, UA: -1.4e-9, UB: 2.3e-18, UC: -4.6e-11, VSAT: 1.5e5,
  A0: 1, AGS: 0.2, A1: 0, A2: 1, KETA: -0.047,
  RDSW: 200, PRWB: 0, PRWG: 0, WR: 1,
  PCLM: 1.3, PDIBLC1: 0.39, PDIBLC2: 0.0086, PDIBLCB: -0.1, DROUT: 0.56, PVAG: 0,
  CDSC: 2.4e-4, CDSCB: 0, CDSCD: 0, ETA0: 0.08, ETAB: -0.07, DSUB: 0.56,
  WINT: 0, LINT: 0, TOX: 4e-9, XJ: 1.5e-7, NCH: 1.7e17, NSUB: 6e16,
  CGSO: 2.5e-10, CGDO: 2.5e-10, CGBO: 0, CJ: 1e-3, CJSW: 5e-10, CJSWG: 3e-10,
  MJ: 0.5, MJSW: 0.33, PB: 1.0, PBSW: 1.0,
};

export function computeDerived(
  model: BSIM3v3ModelParams,
  inst: BSIM3v3InstanceParams,
): BSIM3v3Derived {
  const Leff = Math.max(inst.L - 2 * model.LINT, MIN_LEFF);
  const Weff = Math.max(inst.W - 2 * model.WINT, MIN_LEFF);
  const Cox = EPSOX / model.TOX;
  const phi_s = 2 * VT_300 * Math.log(model.NCH / NI);
  const sqrtPhi = Math.sqrt(phi_s);
  const Vbi = VT_300 * Math.log(model.NCH * 1e6 / (NI * NI));
  const litl = Math.sqrt(EPSI * model.XJ * model.TOX / EPSOX);
  const AD = inst.AD ?? Weff * 0.5e-6;
  const AS = inst.AS ?? Weff * 0.5e-6;
  const PD = inst.PD ?? Weff + 2 * 0.5e-6;
  const PS = inst.PS ?? Weff + 2 * 0.5e-6;
  return Object.freeze({ Leff, Weff, Cox, phi_s, sqrtPhi, Vbi, litl, AD, AS, PD, PS });
}
