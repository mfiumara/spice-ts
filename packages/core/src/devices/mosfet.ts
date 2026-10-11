import {
  DEVICE_GMIN, type ChargeIntegration, type ChargeTruncation, type DeviceModel, type StampContext,
} from './device.js';
import { stampChargeBranch, stampChargeCurrent, TransientChargeState } from './charge-state.js';

export interface MOSFETParams {
  LEVEL: number;
  VTO: number;
  KP: number;
  LAMBDA: number;
  W: number;
  L: number;
  KF: number;
  AF: number;
  NLEV: number;
  TOX: number | undefined;
  polarity: number; // 1 for NMOS, -1 for PMOS
}

export interface MOSFETOperatingPoint {
  drainNode: number;
  sourceNode: number;
  drainCurrent: number;
  transconductance: number;
}

const GMIN = 1e-12;
// Keep source-ramp Newton iterates finite without clipping ordinary supply steps.
const MAX_NEWTON_TERMINAL_STEP = 10;
// ngspice CONSTKoverQ (const.h) at the default 27 C circuit temperature.
const JUNCTION_VT = (1.38064852e-23 / 1.6021766208e-19) * 300.15;
const MAX_EXP_ARG = 709;
/** ngspice cktinit.c CKTdefaultMosW / CKTdefaultMosL, used when W or L is omitted. */
const DEFAULT_MOS_WIDTH = 1e-4;
const DEFAULT_MOS_LENGTH = 1e-4;
/** ngspice mos1temp.c gate-oxide permittivity 3.9 * eps0 (F/m). */
const OXIDE_PERMITTIVITY = 3.9 * 8.854214871e-12;

/**
 * KP when the model card omits it. mos1set.c defaults KP to 2e-5, but
 * mos1temp.c derives it from UO (default 600 cm^2/Vs) and Cox = 3.9*eps0/TOX
 * whenever a non-zero TOX is given. mos2temp.c and mos3set.c default TOX to
 * 1e-7, so levels 2 and 3 always derive it.
 */
function defaultTransconductance(level: number, params: Record<string, number | undefined>): number {
  const oxideThickness = params.TOX ?? (level === 2 || level === 3 ? 1e-7 : undefined);
  if (oxideThickness === undefined || oxideThickness === 0) return 2e-5;
  const surfaceMobility = params.UO ?? params.U0 ?? 600;
  return surfaceMobility * (OXIDE_PERMITTIVITY / oxideThickness) * 1e-4;
}

/**
 * ngspice mos1load.c bulk junction (bulk-source or bulk-drain), in the
 * polarity-adjusted domain, with `gmin` the circuit CKTgmin. Writes
 * [conductance, current] into `out`.
 */
function bulkJunction(
  voltage: number, saturationCurrent: number, gmin: number, out: Float64Array, offset: number,
): void {
  if (voltage <= -3 * JUNCTION_VT) {
    out[offset] = gmin;
    out[offset + 1] = gmin * voltage - saturationCurrent;
    return;
  }
  const expTerm = Math.exp(Math.min(MAX_EXP_ARG, voltage / JUNCTION_VT));
  out[offset] = saturationCurrent * expTerm / JUNCTION_VT + gmin;
  out[offset + 1] = saturationCurrent * (expTerm - 1) + gmin * voltage;
}

/** ngspice devsup.c DEVpnjlim: limit a junction voltage step from `previous`. */
function pnjlim(proposed: number, previous: number, criticalVoltage: number): number {
  const vt = JUNCTION_VT;
  if (proposed > criticalVoltage && Math.abs(proposed - previous) > 2 * vt) {
    if (previous > 0) {
      const argument = (proposed - previous) / vt;
      return argument > 0
        ? previous + vt * (2 + Math.log(argument - 2))
        : previous - vt * (2 + Math.log(2 - argument));
    }
    return vt * Math.log(proposed / vt);
  }
  if (proposed < 0) {
    const floor = previous > 0 ? -previous - 1 : 2 * previous - 1;
    return Math.max(proposed, floor);
  }
  return proposed;
}

function criticalVoltage(saturationCurrent: number): number {
  return saturationCurrent > 0
    ? JUNCTION_VT * Math.log(JUNCTION_VT / (Math.SQRT2 * saturationCurrent))
    : Infinity;
}

/** Reused [gbs, ceqbs, gbd, ceqbd] buffer; consumed immediately by each stamp. */
const junctionScratch = new Float64Array(4);

/** ngspice devsup.c DEVfetlim: limit a gate voltage step around threshold `vto`. */
function fetlim(vnew: number, vold: number, vto: number): number {
  const vtsthi = Math.abs(2 * (vold - vto)) + 2;
  const vtstlo = Math.abs(vold - vto) + 1;
  const vtox = vto + 3.5;
  const delv = vnew - vold;
  if (vold >= vto) {
    if (vold >= vtox) {
      if (delv <= 0) {
        // going off
        if (vnew >= vtox) return -delv > vtstlo ? vold - vtstlo : vnew;
        return Math.max(vnew, vto + 2);
      }
      // staying on
      return delv >= vtsthi ? vold + vtsthi : vnew;
    }
    // middle region
    return delv <= 0 ? Math.max(vnew, vto - 0.5) : Math.min(vnew, vto + 4);
  }
  // off
  if (delv <= 0) return -delv > vtsthi ? vold - vtsthi : vnew;
  const vtemp = vto + 0.5;
  if (vnew <= vtemp) return delv > vtstlo ? vold + vtstlo : vnew;
  return vtemp;
}

// batchStamp value-slot layout over the unswapped D, G, S and bulk terminals.
const SLOT_DG = 0;
const SLOT_DD = 1;
const SLOT_DS = 2;
const SLOT_SG = 3;
const SLOT_SD = 4;
const SLOT_SS = 5;
const SLOT_BB = 6;
const SLOT_BS = 7;
const SLOT_BD = 8;
const SLOT_SB = 9;
const SLOT_DB = 10;

/** Terminal indices (D, G, S, B) of the G-D, G-S, B-D and B-S capacitances. */
const CHARGE_BRANCHES: ReadonlyArray<readonly [number, number]> = [[1, 0], [1, 2], [3, 0], [3, 2]];
/** {@link CHARGE_BRANCHES} indices of the gate charges (G-D, G-S). */
const MOS_GATE_CHARGES: readonly number[] = [0, 1];

function branchVoltage(ctx: StampContext, positive: number, negative: number): number {
  return (positive >= 0 ? ctx.getVoltage(positive) : 0)
    - (negative >= 0 ? ctx.getVoltage(negative) : 0);
}

export class MOSFET implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = true;
  readonly params: MOSFETParams;
  readonly suppliedParams: Readonly<Record<string, number>>;
  /** Bulk-drain / bulk-source junction saturation currents (mos1temp.c at TNOM). */
  readonly drainSatCur: number;
  readonly sourceSatCur: number;
  private readonly drainVcrit: number;
  private readonly sourceVcrit: number;
  /** Junction voltages used by the previous stamp (ngspice CKTstate0 vbs/vbd). */
  private lastVbs = 0;
  private lastVbd = 0;
  /** Constant G-D, G-S, B-D and B-S capacitances (F), in {@link CHARGE_BRANCHES} order. */
  private readonly capacitances: Float64Array;
  /** Transient charges q = C*v of those capacitances, integrated by the device. */
  readonly integratesTransientCharge: boolean;
  readonly storesCharge: boolean;
  private readonly charges = new TransientChargeState(4);
  /** {@link batchStamp} value slots and the topology lookup they belong to. */
  private batchSlots: Int32Array | null = null;
  private batchSlotKey: ((row: number, col: number) => number) | null = null;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    params: Partial<MOSFETParams> & Record<string, number>,
  ) {
    this.suppliedParams = { ...params };
    const level = params.LEVEL ?? 1;
    this.params = {
      LEVEL: level,
      // mos1set.c, mos2set.c and mos3set.c all default VTO to 0.
      VTO: params.VTO ?? params.VT0 ?? 0,
      KP: params.KP ?? params.KC ?? defaultTransconductance(level, params),
      LAMBDA: params.LAMBDA ?? params.LAMBDA0 ?? 0,
      // cktinit.c CKTdefaultMosW / CKTdefaultMosL (.option defw / defl).
      W: params.W ?? DEFAULT_MOS_WIDTH,
      L: params.L ?? DEFAULT_MOS_LENGTH,
      KF: params.KF ?? 0,
      AF: params.AF ?? 1,
      NLEV: params.NLEV ?? 2,
      TOX: params.TOX,
      polarity: params.polarity ?? 1,
    };
    // mos1load.c: JS*AD / JS*AS only when JS and both areas are non-zero.
    const saturationCurrent = params.IS ?? 1e-14;
    const saturationDensity = params.JS ?? 0;
    const drainArea = params.AD ?? 0;
    const sourceArea = params.AS ?? 0;
    const useDensity = saturationDensity !== 0 && drainArea !== 0 && sourceArea !== 0;
    this.drainSatCur = useDensity ? saturationDensity * drainArea : saturationCurrent;
    this.sourceSatCur = useDensity ? saturationDensity * sourceArea : saturationCurrent;
    this.drainVcrit = criticalVoltage(this.drainSatCur);
    this.sourceVcrit = criticalVoltage(this.sourceSatCur);
    const width = this.params.W;
    this.capacitances = Float64Array.of(
      (this.suppliedParams.CGDO ?? 0) * width,
      (this.suppliedParams.CGSO ?? 0) * width,
      this.suppliedParams.CBD ?? 0,
      this.suppliedParams.CBS ?? 0,
    );
    this.storesCharge = this.capacitances.some(value => value !== 0);
    this.integratesTransientCharge = this.storesCharge;
  }

  private get bulkNode(): number {
    return this.nodes[3] ?? this.nodes[2];
  }

  /**
   * Evaluate both bulk junctions at the given terminal voltages. Writes
   * [gbs, ceqbs, gbd, ceqbd] (ngspice mos1load.c companion terms, polarity
   * domain) into junctionScratch. As in mos1load.c, vbs is limited with
   * DEVpnjlim when vds >= 0 (vbd otherwise) against the previous stamp, so a
   * converged Newton point is evaluated without limiting.
   */
  private evaluateBulkJunctions(vD: number, vS: number, vB: number, gmin: number): Float64Array {
    const polarity = this.params.polarity;
    const vds = polarity * (vD - vS);
    let vbs = polarity * (vB - vS);
    let vbd = vbs - vds;
    if (vds >= 0) {
      vbs = pnjlim(vbs, this.lastVbs, this.sourceVcrit);
      vbd = vbs - vds;
    } else {
      vbd = pnjlim(vbd, this.lastVbd, this.drainVcrit);
      vbs = vbd + vds;
    }
    this.lastVbs = vbs;
    this.lastVbd = vbd;
    const out = junctionScratch;
    bulkJunction(vbs, this.sourceSatCur, gmin, out, 0);
    bulkJunction(vbd, this.drainSatCur, gmin, out, 2);
    out[1] -= out[0] * vbs;
    out[3] -= out[2] * vbd;
    return out;
  }

  limitNewtonStep(previous: Float64Array, candidate: Float64Array): number {
    const [nD, nG, nS] = this.nodes;
    const voltage = (solution: Float64Array, node: number): number =>
      node >= 0 ? solution[node] : 0;
    const terminal = (solution: Float64Array, positive: number, negative: number): number =>
      voltage(solution, positive) - voltage(solution, negative);
    const vgsStep = Math.abs(terminal(candidate, nG, nS) - terminal(previous, nG, nS));
    const vdsStep = Math.abs(terminal(candidate, nD, nS) - terminal(previous, nD, nS));
    const largestStep = Math.max(vgsStep, vdsStep);
    const terminalScale = largestStep > MAX_NEWTON_TERMINAL_STEP
      ? MAX_NEWTON_TERMINAL_STEP / largestStep
      : 1;
    return Math.min(terminalScale, this.gateStepScale(previous, candidate));
  }

  /**
   * mos1load.c applies DEVfetlim to vgs (vds >= 0) or vgd (vds < 0). spice-ts
   * turns the limited gate voltage into a scale on the whole Newton step.
   */
  private gateStepScale(previous: Float64Array, candidate: Float64Array): number {
    const { polarity, VTO } = this.params;
    const [nD, nG, nS] = this.nodes;
    const voltage = (solution: Float64Array, node: number): number =>
      node >= 0 ? solution[node] : 0;
    const previousVds = polarity * (voltage(previous, nD) - voltage(previous, nS));
    const reference = previousVds >= 0 ? nS : nD;
    const previousGate = polarity * (voltage(previous, nG) - voltage(previous, reference));
    const proposedGate = polarity * (voltage(candidate, nG) - voltage(candidate, reference));
    const delta = proposedGate - previousGate;
    if (delta === 0) return 1;
    const limited = fetlim(proposedGate, previousGate, Math.abs(VTO));
    return Math.min(1, Math.max(0, (limited - previousGate) / delta));
  }

  /** Level-1 DC quantities used by the small-signal noise generators. */
  noiseOperatingPoint(solution: Float64Array): MOSFETOperatingPoint {
    const { VTO, KP, LAMBDA, W, L, polarity } = this.params;
    let drainNode = this.nodes[0];
    const gateNode = this.nodes[1];
    let sourceNode = this.nodes[2];
    const drainVoltage = drainNode >= 0 ? solution[drainNode] : 0;
    const gateVoltage = gateNode >= 0 ? solution[gateNode] : 0;
    const sourceVoltage = sourceNode >= 0 ? solution[sourceNode] : 0;
    let vGS = polarity * (gateVoltage - sourceVoltage);
    let vDS = polarity * (drainVoltage - sourceVoltage);

    if (vDS < 0) {
      [drainNode, sourceNode] = [sourceNode, drainNode];
      vGS -= vDS;
      vDS = -vDS;
    }

    const threshold = Math.abs(VTO);
    const aspectRatio = W / L;
    let drainCurrent = 0;
    let transconductance = 0;
    if (vGS > threshold) {
      const overdrive = vGS - threshold;
      if (vDS < overdrive) {
        drainCurrent = KP * aspectRatio * (overdrive * vDS - vDS * vDS / 2)
          * (1 + LAMBDA * vDS);
        transconductance = KP * aspectRatio * vDS * (1 + LAMBDA * vDS);
      } else {
        drainCurrent = (KP * aspectRatio / 2) * overdrive * overdrive
          * (1 + LAMBDA * vDS);
        transconductance = KP * aspectRatio * overdrive * (1 + LAMBDA * vDS);
      }
    }
    return { drainNode, sourceNode, drainCurrent, transconductance };
  }

  stamp(ctx: StampContext): void {
    const { VTO, KP, LAMBDA, W, L, polarity } = this.params;
    const WL = W / L;

    // Get node voltages — may swap drain/source below
    let nD = this.nodes[0];
    const nG = this.nodes[1];
    let nS = this.nodes[2];

    const vD = nD >= 0 ? ctx.getVoltage(nD) : 0;
    const vG = nG >= 0 ? ctx.getVoltage(nG) : 0;
    const vS = nS >= 0 ? ctx.getVoltage(nS) : 0;

    // Internal voltages adjusted for polarity (PMOS flips)
    let vGS = polarity * (vG - vS);
    let vDS = polarity * (vD - vS);

    // Source-drain swap: if vDS < 0, the device operates in reverse mode.
    // Standard SPICE Level 1 handles this by swapping drain and source
    // internally so that vDS >= 0 for the model equations.
    if (vDS < 0) {
      const tmp = nD;
      nD = nS;
      nS = tmp;
      vGS = vGS - vDS; // vG - vD (gate to new effective source)
      vDS = -vDS;       // |vDS|
    }

    // Threshold in polarity-adjusted domain: for PMOS, VTO from model card is
    // negative (e.g. -0.5V). After the polarity flip vGS is positive, so we
    // need |VTO| as the positive threshold.
    const Vth = Math.abs(VTO);

    let ID: number;
    let gm: number;   // dID/dVGS
    let gds: number;  // dID/dVDS

    if (vGS <= Vth) {
      // Cutoff
      ID = 0;
      gm = 0;
      gds = 0;
    } else if (vDS < vGS - Vth) {
      // Linear/triode region
      const vov = vGS - Vth;
      ID = KP * WL * (vov * vDS - vDS * vDS / 2) * (1 + LAMBDA * vDS);
      gm = KP * WL * vDS * (1 + LAMBDA * vDS);
      gds = KP * WL * (vov - vDS) * (1 + LAMBDA * vDS) + KP * WL * (vov * vDS - vDS * vDS / 2) * LAMBDA;
    } else {
      // Saturation region
      const vov = vGS - Vth;
      ID = (KP * WL / 2) * vov * vov * (1 + LAMBDA * vDS);
      gm = KP * WL * vov * (1 + LAMBDA * vDS);
      gds = (KP * WL / 2) * vov * vov * LAMBDA;
    }

    // Add GMIN for convergence
    gds += GMIN;

    // NR companion: ID ≈ gm*(VGS - VGS0) + gds*(VDS - VDS0) + ID0
    // Equivalent current: Ieq = ID0 - gm*VGS0 - gds*VDS0
    const Ieq = ID - gm * vGS - gds * vDS;

    // Physical current into effective drain = polarity * ID
    // The stamps below use the (possibly swapped) nD, nG, nS.
    //
    // dID_node/dvG = gm
    // dID_node/dvD = gds
    // dID_node/dvS = -(gm + gds)

    // Stamp drain row (current into effective drain)
    if (nD >= 0) {
      if (nG >= 0) ctx.stampG(nD, nG, gm);
      if (nD >= 0) ctx.stampG(nD, nD, gds);
      if (nS >= 0) ctx.stampG(nD, nS, -(gm + gds));
      ctx.stampB(nD, -polarity * Ieq);
    }

    // Stamp source row (current into effective source = -current into effective drain)
    if (nS >= 0) {
      if (nG >= 0) ctx.stampG(nS, nG, -gm);
      if (nD >= 0) ctx.stampG(nS, nD, -gds);
      if (nS >= 0) ctx.stampG(nS, nS, gm + gds);
      ctx.stampB(nS, polarity * Ieq);
    }

    // Bulk-source / bulk-drain junctions use the unswapped terminals.
    const [jD, , jS] = this.nodes;
    const jB = this.bulkNode;
    const junction = this.evaluateBulkJunctions(
      vD, vS, jB >= 0 ? ctx.getVoltage(jB) : 0, ctx.gmin ?? DEVICE_GMIN,
    );
    const gbs = junction[0];
    const gbd = junction[2];
    const ceqbs = polarity * junction[1];
    const ceqbd = polarity * junction[3];
    if (jB >= 0) {
      ctx.stampG(jB, jB, gbs + gbd);
      if (jS >= 0) ctx.stampG(jB, jS, -gbs);
      if (jD >= 0) ctx.stampG(jB, jD, -gbd);
      ctx.stampB(jB, -(ceqbs + ceqbd));
    }
    if (jS >= 0) {
      ctx.stampG(jS, jS, gbs);
      if (jB >= 0) ctx.stampG(jS, jB, -gbs);
      ctx.stampB(jS, ceqbs);
    }
    if (jD >= 0) {
      ctx.stampG(jD, jD, gbd);
      if (jB >= 0) ctx.stampG(jD, jB, -gbd);
      ctx.stampB(jD, ceqbd);
    }
  }

  stampDynamic(ctx: StampContext): void {
    for (let index = 0; index < CHARGE_BRANCHES.length; index++) {
      const [positive, negative] = CHARGE_BRANCHES[index];
      this.stampCapacitance(
        ctx, this.nodes[positive], this.nodes[negative], this.capacitances[index],
      );
    }
  }

  stampTransientCharge(ctx: StampContext, integration: ChargeIntegration): void {
    const charges = this.charges;
    charges.begin(integration);
    for (let index = 0; index < CHARGE_BRANCHES.length; index++) {
      const capacitance = this.capacitances[index];
      if (capacitance === 0) continue;
      const [p, n] = CHARGE_BRANCHES[index];
      const positive = this.nodes[p];
      const negative = this.nodes[n];
      const voltage = branchVoltage(ctx, positive, negative);
      stampChargeBranch(
        ctx, positive, negative, charges.current(index, capacitance * voltage),
        charges.factor * capacitance, voltage,
      );
    }
  }

  stampAcceptedChargeCurrent(ctx: StampContext): void {
    for (let index = 0; index < CHARGE_BRANCHES.length; index++) {
      const [p, n] = CHARGE_BRANCHES[index];
      stampChargeCurrent(ctx, this.nodes[p], this.nodes[n], this.charges.acceptedChargeCurrent(index));
    }
  }

  acceptTransientStep(ctx: StampContext): void {
    if (!this.integratesTransientCharge) return;
    for (let index = 0; index < CHARGE_BRANCHES.length; index++) {
      const [p, n] = CHARGE_BRANCHES[index];
      const voltage = branchVoltage(ctx, this.nodes[p], this.nodes[n]);
      this.charges.accept(index, this.capacitances[index] * voltage);
    }
    this.charges.commit();
  }

  resetTransient(): void {
    this.charges.reset();
  }

  /** ngspice MOS1/2/3trunc: the gate charges qgd and qgs only, not the bulk junctions. */
  truncateTransientStep(ctx: StampContext, truncation: ChargeTruncation): number {
    return this.charges.truncationTimestep(truncation, () => this.acceptTransientStep(ctx), MOS_GATE_CHARGES);
  }

  stampAC(ctx: StampContext, _omega: number): void {
    this.stampDynamic(ctx);
  }

  private stampCapacitance(ctx: StampContext, n1: number, n2: number, value: number): void {
    if (value === 0) return;
    if (n1 >= 0) {
      ctx.stampC(n1, n1, value);
      if (n2 >= 0) ctx.stampC(n1, n2, -value);
    }
    if (n2 >= 0) {
      ctx.stampC(n2, n2, value);
      if (n1 >= 0) ctx.stampC(n2, n1, -value);
    }
  }

  /**
   * Value slots of this instance's G entries for the locked topology behind
   * `stampIndex`, in SLOT_* order (-1 where a terminal is ground). Resolved
   * once per topology, like ngspice TSTALLOC matrix pointers.
   */
  private resolveBatchSlots(stampIndex: (row: number, col: number) => number): Int32Array {
    const d = this.nodes[0];
    const g = this.nodes[1];
    const s = this.nodes[2];
    const bulk = this.bulkNode;
    const at = (row: number, col: number): number => (row >= 0 && col >= 0 ? stampIndex(row, col) : -1);
    const slots = Int32Array.of(
      at(d, g), at(d, d), at(d, s), at(s, g), at(s, d), at(s, s),
      at(bulk, bulk), at(bulk, s), at(bulk, d), at(s, bulk), at(d, bulk),
    );
    this.batchSlots = slots;
    this.batchSlotKey = stampIndex;
    return slots;
  }

  /**
   * Batch-stamp multiple MOSFETs with direct typed-array writes,
   * bypassing StampContext closures for better performance on the fast path.
   */
  static batchStamp(
    mosfets: MOSFET[],
    gValues: Float64Array,
    b: Float64Array,
    solution: Float64Array,
    stampIndex: (row: number, col: number) => number,
    gmin: number = DEVICE_GMIN,
  ): void {
    for (let m = 0; m < mosfets.length; m++) {
      const mosfet = mosfets[m];
      const slots = mosfet.batchSlotKey === stampIndex && mosfet.batchSlots !== null
        ? mosfet.batchSlots
        : mosfet.resolveBatchSlots(stampIndex);
      const { VTO, KP, LAMBDA, W, L, polarity } = mosfet.params;
      const WL = W / L;

      // Get node voltages — may swap drain/source below
      let nD = mosfet.nodes[0];
      const nG = mosfet.nodes[1];
      let nS = mosfet.nodes[2];

      const vD = nD >= 0 ? solution[nD] : 0;
      const vG = nG >= 0 ? solution[nG] : 0;
      const vS = nS >= 0 ? solution[nS] : 0;

      // Internal voltages adjusted for polarity (PMOS flips)
      let vGS = polarity * (vG - vS);
      let vDS = polarity * (vD - vS);

      // Source-drain swap for negative vDS. The value slots of the drain and
      // source rows swap with the terminals.
      let slotDG = slots[SLOT_DG], slotDD = slots[SLOT_DD], slotDS = slots[SLOT_DS];
      let slotSG = slots[SLOT_SG], slotSD = slots[SLOT_SD], slotSS = slots[SLOT_SS];
      if (vDS < 0) {
        const tmp = nD;
        nD = nS;
        nS = tmp;
        vGS = vGS - vDS;
        vDS = -vDS;
        slotDG = slots[SLOT_SG]; slotDD = slots[SLOT_SS]; slotDS = slots[SLOT_SD];
        slotSG = slots[SLOT_DG]; slotSD = slots[SLOT_DS]; slotSS = slots[SLOT_DD];
      }

      const Vth = Math.abs(VTO);

      let ID: number;
      let gm: number;
      let gds: number;

      if (vGS <= Vth) {
        // Cutoff
        ID = 0;
        gm = 0;
        gds = 0;
      } else if (vDS < vGS - Vth) {
        // Linear/triode region
        const vov = vGS - Vth;
        ID = KP * WL * (vov * vDS - vDS * vDS / 2) * (1 + LAMBDA * vDS);
        gm = KP * WL * vDS * (1 + LAMBDA * vDS);
        gds = KP * WL * (vov - vDS) * (1 + LAMBDA * vDS) + KP * WL * (vov * vDS - vDS * vDS / 2) * LAMBDA;
      } else {
        // Saturation region
        const vov = vGS - Vth;
        ID = (KP * WL / 2) * vov * vov * (1 + LAMBDA * vDS);
        gm = KP * WL * vov * (1 + LAMBDA * vDS);
        gds = (KP * WL / 2) * vov * vov * LAMBDA;
      }

      // Add GMIN for convergence
      gds += GMIN;

      // NR companion: Ieq = ID0 - gm*VGS0 - gds*VDS0
      const Ieq = ID - gm * vGS - gds * vDS;

      // Stamp drain row — direct array writes using (possibly swapped) nD, nS
      if (nD >= 0) {
        if (nG >= 0) gValues[slotDG] += gm;
        if (nD >= 0) gValues[slotDD] += gds;
        if (nS >= 0) gValues[slotDS] -= (gm + gds);
        b[nD] -= polarity * Ieq;
      }

      // Stamp source row
      if (nS >= 0) {
        if (nG >= 0) gValues[slotSG] -= gm;
        if (nD >= 0) gValues[slotSD] -= gds;
        if (nS >= 0) gValues[slotSS] += (gm + gds);
        b[nS] += polarity * Ieq;
      }

      // Bulk-source / bulk-drain junctions use the unswapped terminals.
      const [jD, , jS] = mosfet.nodes;
      const jB = mosfet.bulkNode;
      const junction = mosfet.evaluateBulkJunctions(vD, vS, jB >= 0 ? solution[jB] : 0, gmin);
      const gbs = junction[0];
      const gbd = junction[2];
      const ceqbs = polarity * junction[1];
      const ceqbd = polarity * junction[3];
      if (jB >= 0) {
        gValues[slots[SLOT_BB]] += gbs + gbd;
        if (jS >= 0) gValues[slots[SLOT_BS]] -= gbs;
        if (jD >= 0) gValues[slots[SLOT_BD]] -= gbd;
        b[jB] -= ceqbs + ceqbd;
      }
      if (jS >= 0) {
        gValues[slots[SLOT_SS]] += gbs;
        if (jB >= 0) gValues[slots[SLOT_SB]] -= gbs;
        b[jS] += ceqbs;
      }
      if (jD >= 0) {
        gValues[slots[SLOT_DD]] += gbd;
        if (jB >= 0) gValues[slots[SLOT_DB]] -= gbd;
        b[jD] += ceqbd;
      }
    }
  }
}
