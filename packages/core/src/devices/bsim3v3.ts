import type {
  ChargeIntegration, ChargeTruncation, DeviceModel, StampContext,
} from './device.js';
import { DEVICE_GMIN } from './device.js';
import { UnsupportedModelParameterError } from '../errors.js';
import { stampChargeCurrent, TransientChargeState } from './charge-state.js';
import type { BSIM3Model, BSIM3Size, BSIM3v3InstanceParams } from './bsim3v3-params.js';
import { BSIM3_REVISION, CONST_VT0, computeBsim3Size, resolveBsim3Model, NOMINAL_TEMPERATURE_K } from './bsim3v3-params.js';
import { fetlim, limvds, pnjlim, stepScale } from './devsup.js';

/** ngspice const.h CONSTCtoK. */
const CTOK = 273.15;
import { createChargeInputs, createDCResult, evaluateDC } from './bsim3v3-dc.js';
import type { BSIM3ChargeParams, BSIM3TerminalCharges } from './bsim3v3-charge.js';
import {
  TERMINAL, chargeParams, createTerminalCharges, evaluateTerminalCharges,
} from './bsim3v3-charge.js';

/** Reused b3ld.c DC result; consumed immediately by each stamp. */
const dcScratch = createDCResult();
/** Reused [gbs, cbs, gbd, cbd] junction buffer. */
const junctionScratch = new Float64Array(4);

export class BSIM3v3 implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = true;
  /**
   * The ngspice-47 b3ld.c terminal charges qg, qd and qb (CKTstate0
   * BSIM3qg/qd/qb, source charge by neutrality) are integrated as
   * NIintegrate does, with their full nonreciprocal 4x4 Jacobian.
   */
  readonly integratesTransientCharge = true;
  /** {@link truncateTransientStep} bounds every stored charge (BSIM3trunc: qb, qg, qd). */
  readonly truncationCoversCharges = true;
  private readonly charges = new TransientChargeState(CHARGE_ROWS.length);
  private readonly terminalCharges: BSIM3TerminalCharges = createTerminalCharges();
  /**
   * evaluateDC charge inputs of the last {@link stamp} and the polarity-domain
   * physical bias they belong to, so the charge stamp of the same Newton
   * iteration does not repeat the DC evaluation (b3ld.c does both in one load).
   */
  private readonly lastDC = { valid: false, vgs: 0, vds: 0, vbs: 0, inputs: createChargeInputs() };
  /** Bias of the charges currently held in {@link terminalCharges}. */
  private readonly chargeKey = { valid: false, vgs: 0, vds: 0, vbs: 0 };

  /**
   * ngspice-47 BSIM3 model card (b3set.c defaults applied). Its `revision`
   * selects the 3.3.0 device (bsim3/) or a 3.2.x revision of bsim3v32/.
   * Rebuilt by {@link setTemperature} (b3temp.c runs at CKTtemp).
   */
  model: BSIM3Model;
  /** b3temp.c size-dependent parameters of this instance. */
  size: BSIM3Size;
  private chargeInputs: BSIM3ChargeParams;
  private readonly polarity: number;
  /** Parallel multiplier M (ngspice BSIM3m). */
  private readonly multiplier: number;
  /** Device temperature in degrees Celsius (ngspice CKTtemp; BSIM3 has no instance TEMP). */
  private temperature = NOMINAL_TEMPERATURE_K - CTOK;
  /** Junction voltages and threshold of the previous stamp (ngspice CKTstate0 vbs/vbd, BSIM3von). */
  private lastVbs = 0;
  private lastVbd = 0;
  private lastVon: number;
  /** b3v32temp.c (3.2, 3.2.2) instance whose size record supplies this instance's vth0/vfb/vfbzb/u0temp. */
  private sizeRecordDonor?: BSIM3v3;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    private readonly modelParams: Record<string, number>,
    private readonly instanceParams: BSIM3v3InstanceParams | Record<string, number>,
    polarity: number,
    /** The card's VERSION= string (absent: 3.3.0). */
    private readonly version?: string,
  ) {
    this.polarity = polarity;
    [this.model, this.size, this.chargeInputs] = this.temperatureDependent(NOMINAL_TEMPERATURE_K);
    rejectNonQuasiStatic(name, modelParams, instanceParams as Record<string, number>, this.model.revision);
    this.multiplier = this.size.m;
    this.lastVon = polarity * this.size.instVth0;
  }

  /** b3temp.c (b3v32temp.c) model, size-dependent and charge constants at `temperatureK`. */
  private temperatureDependent(temperatureK: number): [BSIM3Model, BSIM3Size, BSIM3ChargeParams] {
    const model = resolveBsim3Model(this.modelParams, this.polarity, temperatureK, this.version);
    let size: BSIM3Size;
    try {
      size = computeBsim3Size(
        model, this.instanceParams as Record<string, number>,
        this.sizeRecordDonor?.instanceParams as Record<string, number> | undefined,
      );
    } catch (error) {
      throw new RangeError(`BSIM3 '${this.name}': ${(error as Error).message}`);
    }
    return [model, size, chargeParams(model, size)];
  }

  /**
   * b3v32temp.c revisions 3.2 / 3.2.2 (#700): take the instance copies vth0,
   * vfb, vfbzb and u0temp from `donor`'s size record, the record ngspice's
   * `pParam` still points at when this instance reuses an earlier geometry.
   * Set by {@link linkBsim3v32SizeRecordReuse}; survives {@link setTemperature}.
   */
  private reuseSizeRecordOf(donor: BSIM3v3): void {
    this.sizeRecordDonor = donor;
    [this.model, this.size, this.chargeInputs] = this.temperatureDependent(this.temperature + CTOK);
    this.lastVon = this.polarity * this.size.instVth0;
    this.lastDC.valid = false;
    this.chargeKey.valid = false;
  }

  /**
   * Link the BSIM3 instances of one ngspice model (in netlist order) the way
   * ngspice-47 b3v32temp.c resolves `pParam` for revisions 3.2 and 3.2.2.
   * ngspice prepends every new instance to its model's list (cktcrte.c), so
   * b3v32temp.c visits them in reverse netlist order; an instance whose
   * (L, W) matches an existing size record keeps `pParam` at the most
   * recently allocated record, i.e. the last newly-seen geometry. Other
   * revisions (3.2.3, 3.2.4, 3.3.0) assign `pParam = here->pParam` and are
   * left unchanged.
   */
  static linkBsim3v32SizeRecordReuse(instances: readonly BSIM3v3[]): void {
    const records: BSIM3v3[] = [];
    let lastAllocated: BSIM3v3 | undefined;
    for (let k = instances.length - 1; k >= 0; k--) {
      const here = instances[k];
      if (here.model.revision > BSIM3_REVISION.V322) continue;
      const { length, width } = here.size;
      const match = records.find(r => r.size.length === length && r.size.width === width);
      if (!match) {
        records.push(here);
        lastAllocated = here;
      } else if (lastAllocated!.size.length !== length || lastAllocated!.size.width !== width) {
        here.reuseSizeRecordOf(lastAllocated!);
      }
    }
  }

  /** Circuit temperature in degrees Celsius (`.options TEMP=`): reruns b3temp.c at it. */
  setTemperature(celsius: number): void {
    this.temperature = celsius;
    [this.model, this.size, this.chargeInputs] = this.temperatureDependent(celsius + CTOK);
    this.lastVon = this.polarity * this.size.instVth0;
    this.lastDC.valid = false;
    this.chargeKey.valid = false;
  }

  getTemperature(): number {
    return this.temperature;
  }

  /** Polarity-domain (NMOS convention) Vgs, Vds and Vbs at a solution. */
  private terminalVoltages(voltage: (node: number) => number): [number, number, number] {
    const [nD, nG, nS, nB] = this.nodes;
    const type = this.polarity;
    const vS = voltage(nS);
    return [type * (voltage(nG) - vS), type * (voltage(nD) - vS), type * (voltage(nB) - vS)];
  }

  limitNewtonStep(previous: Float64Array, candidate: Float64Array): number {
    const read = (solution: Float64Array) => (node: number) => (node >= 0 ? solution[node] : 0);
    const [vgsOld, vdsOld] = this.terminalVoltages(read(previous));
    const [vgsNew, vdsNew] = this.terminalVoltages(read(candidate));
    const vgdOld = vgsOld - vdsOld;
    const vgdNew = vgsNew - vdsNew;
    const von = this.lastVon;
    // b3ld.c limits vgs (vgd in inverse mode) with DEVfetlim and vds with
    // DEVlimvds. spice-ts limits by scaling the whole Newton step.
    const gateScale = vdsOld >= 0
      ? stepScale(vgsOld, vgsNew, fetlim(vgsNew, vgsOld, von))
      : stepScale(vgdOld, vgdNew, fetlim(vgdNew, vgdOld, von));
    const drainScale = vdsOld >= 0
      ? stepScale(vdsOld, vdsNew, limvds(vdsNew, vdsOld))
      : stepScale(-vdsOld, -vdsNew, limvds(-vdsNew, -vdsOld));
    return Math.min(gateScale, drainScale);
  }

  /**
   * b3ld.c source/drain junction diode DC model (acmMod = 0) at the given
   * polarity-domain junction voltages. Writes [gbs, cbs, gbd, cbd].
   */
  private evaluateJunctions(vbs: number, vbd: number, gmin: number): Float64Array {
    const size = this.size;
    const out = junctionScratch;
    junction(vbs, size.sourceSatCurrent, size.vjsm, size.IsEvjsm, this.model, gmin, out, 0);
    junction(vbd, size.drainSatCurrent, size.vjdm, size.IsEvjdm, this.model, gmin, out, 2);
    return out;
  }

  stamp(ctx: StampContext): void {
    const [pD, nG, pS, nB] = this.nodes;
    const type = this.polarity;
    const m = this.multiplier;
    const voltage = (node: number) => (node >= 0 ? ctx.getVoltage(node) : 0);
    const [vgs, vds, vbsRaw] = this.terminalVoltages(voltage);

    // b3ld.c junction limiting against the previous load.
    let vbs = vbsRaw;
    let vbd = vbs - vds;
    if (vds >= 0) {
      vbs = pnjlim(vbs, this.lastVbs, CONST_VT0, this.model.vcrit);
      vbd = vbs - vds;
    } else {
      vbd = pnjlim(vbd, this.lastVbd, CONST_VT0, this.model.vcrit);
      vbs = vbd + vds;
    }
    // Known divergence from b3ld.c (tracked in #638, no behaviour change here):
    // the pnjlim reference is updated on every stamp() call, not once per
    // accepted Newton iterate, and a limited junction step does not raise
    // non-convergence the way ngspice's `Check -> CKTnoncon++` does. DC parity
    // is unaffected (bsim3v3-ngspice-parity.test.ts); revisit with the
    // adder_mos_circ transient investigation.
    this.lastVbs = vbs;
    this.lastVbd = vbd;

    // Bulk junctions stamp on the physical terminals.
    const j = this.evaluateJunctions(vbs, vbd, ctx.gmin ?? DEVICE_GMIN);
    const gbs = m * j[0];
    const gbd = m * j[2];
    const ceqbs = m * type * (j[1] - j[0] * vbs);
    const ceqbd = m * type * (j[3] - j[2] * vbd);
    if (nB >= 0) {
      ctx.stampG(nB, nB, gbs + gbd);
      if (pS >= 0) ctx.stampG(nB, pS, -gbs);
      if (pD >= 0) ctx.stampG(nB, pD, -gbd);
      ctx.stampB(nB, -(ceqbs + ceqbd));
    }
    if (pS >= 0) {
      ctx.stampG(pS, pS, gbs);
      if (nB >= 0) ctx.stampG(pS, nB, -gbs);
      ctx.stampB(pS, ceqbs);
    }
    if (pD >= 0) {
      ctx.stampG(pD, pD, gbd);
      if (nB >= 0) ctx.stampG(pD, nB, -gbd);
      ctx.stampB(pD, ceqbd);
    }

    // b3ld.c reverse mode (BSIM3mode = -1): for Vds < 0 the device is
    // evaluated with drain and source interchanged (Vgd, -Vds, Vbd), and the
    // stamp below is written on the effective drain/source nodes.
    let nD = pD;
    let nS = pS;
    let Vgs = vgs;
    let Vds = vds;
    let Vbs = vbs;
    if (vds < 0) {
      nD = pS;
      nS = pD;
      Vgs = vgs - vds;
      Vds = -vds;
      Vbs = vbd;
    }

    const lastDC = this.lastDC;
    const dc = evaluateDC(this.model, this.size, Vgs, Vds, Vbs, dcScratch, lastDC.inputs);
    lastDC.valid = true;
    lastDC.vgs = vgs;
    lastDC.vds = vds;
    lastDC.vbs = vbs;
    this.lastVon = dc.von;
    // Channel current from the effective drain to the effective source.
    stampControlledCurrent(ctx, type, m, nD, nS, nD, nG, nS, nB, dc.Ids, dc.gm, dc.gds, dc.gmbs, Vgs, Vds, Vbs);
    // Substrate current from the effective drain into the bulk. Stamped even
    // when zero so the bulk row keeps one sparsity pattern in both modes.
    stampControlledCurrent(ctx, type, m, nD, nB, nD, nG, nS, nB, dc.Isub, dc.gbg, dc.gbd, dc.gbb, Vgs, Vds, Vbs);
  }

  /** Charge Jacobian dQ/dV (b3acld.c capacitance matrix) at the operating point in `ctx`. */
  stampDynamic(ctx: StampContext): void {
    const tc = this.evaluateCharges(ctx);
    const m = this.multiplier;
    for (let row = 0; row < 4; row++) {
      const r = this.nodes[row];
      if (r < 0) continue;
      for (let col = 0; col < 4; col++) {
        const c = this.nodes[col];
        const value = tc.jacobian[row * 4 + col];
        if (c >= 0 && value !== 0) ctx.stampC(r, c, m * value);
      }
    }
  }

  stampAC(ctx: StampContext, _omega: number): void {
    this.stampDynamic(ctx);
  }

  /**
   * b3ld.c NIintegrate of qg, qd and qb: each terminal charge current flows
   * into the device at its terminal and out at the source, linearised with
   * CKTag[0] times the charge Jacobian (the gc**b terms).
   */
  stampTransientCharge(ctx: StampContext, integration: ChargeIntegration): void {
    const tc = this.evaluateCharges(ctx);
    const charges = this.charges;
    charges.begin(integration);
    const nodes = this.nodes;
    const nS = nodes[TERMINAL.S];
    const scale = this.multiplier * this.polarity;
    const conductanceScale = charges.factor * this.multiplier;
    for (let index = 0; index < CHARGE_ROWS.length; index++) {
      const row = CHARGE_ROWS[index];
      const into = nodes[row];
      const current = charges.current(index, scale * chargeOf(tc, row));
      let equivalent = current;
      for (let col = 0; col < 4; col++) {
        const node = nodes[col];
        if (node < 0) continue;
        const g = conductanceScale * tc.jacobian[row * 4 + col];
        if (g === 0) continue;
        equivalent -= g * ctx.getVoltage(node);
        if (into >= 0) ctx.stampG(into, node, g);
        if (nS >= 0) ctx.stampG(nS, node, -g);
      }
      if (into >= 0) ctx.stampB(into, -equivalent);
      if (nS >= 0) ctx.stampB(nS, equivalent);
    }
  }

  stampAcceptedChargeCurrent(ctx: StampContext): void {
    const nS = this.nodes[TERMINAL.S];
    for (let index = 0; index < CHARGE_ROWS.length; index++) {
      stampChargeCurrent(ctx, this.nodes[CHARGE_ROWS[index]], nS, this.charges.acceptedChargeCurrent(index));
    }
  }

  acceptTransientStep(ctx: StampContext): void {
    const tc = this.evaluateCharges(ctx);
    const scale = this.multiplier * this.polarity;
    for (let index = 0; index < CHARGE_ROWS.length; index++) {
      this.charges.accept(index, scale * chargeOf(tc, CHARGE_ROWS[index]));
    }
    this.charges.commit();
  }

  resetTransient(): void {
    this.charges.reset();
  }

  /** ngspice BSIM3trunc: CKTterr on qb, qg and qd. */
  truncateTransientStep(ctx: StampContext, truncation: ChargeTruncation): number {
    return this.charges.truncationTimestep(truncation, () => this.acceptTransientStep(ctx));
  }

  /** b3ld.c terminal charges (NMOS convention, per unit multiplier) at the voltages in `ctx`. */
  private evaluateCharges(ctx: StampContext): BSIM3TerminalCharges {
    const [vgs, vds, vbs] = this.terminalVoltages(
      (node: number) => (node >= 0 ? ctx.getVoltage(node) : 0),
    );
    const lastDC = this.lastDC;
    const charges = this.terminalCharges;
    const key = this.chargeKey;
    // BSIM3trunc and the acceptance of one timepoint read the same converged bias.
    if (key.valid && key.vgs === vgs && key.vds === vds && key.vbs === vbs) return charges;
    const reuse = lastDC.valid && lastDC.vgs === vgs && lastDC.vds === vds && lastDC.vbs === vbs;
    evaluateTerminalCharges(
      this.model, this.size, this.chargeInputs, vgs, vds, vbs, charges,
      reuse ? lastDC.inputs : undefined,
    );
    key.valid = true;
    key.vgs = vgs;
    key.vds = vds;
    key.vbs = vbs;
    return charges;
  }
}

/**
 * b3set.c/b3v32set.c resolve nqsMod (and, 3.3.0 only, acnqsMod) per
 * instance: an instance value of 0 or 1 wins, anything else falls back to the
 * card's value, which itself falls back to 0 unless it is 0 or 1. spice-ts
 * implements only the quasi-static charge model, so an effective 1 is
 * rejected instead of silently simulating nqsMod = 0 (#594: on the corpus-f
 * TSMC inverter chain NQSMOD=1 moves ngspice's output by 0.7 V of 2.5 V).
 * Porting NQS is tracked in https://github.com/mfiumara/spice-ts/issues/692.
 */
function rejectNonQuasiStatic(
  name: string, model: Readonly<Record<string, number>>, inst: Readonly<Record<string, number | undefined>>,
  revision: number,
): void {
  const value = (record: Readonly<Record<string, number | undefined>>, key: string): number | undefined => {
    for (const [k, v] of Object.entries(record)) if (k.toLowerCase() === key) return v;
    return undefined;
  };
  const keys = revision >= BSIM3_REVISION.V330 ? ['nqsmod', 'acnqsmod'] : ['nqsmod'];
  for (const key of keys) {
    const card = value(model, key);
    const modelValue = card === 0 || card === 1 ? card : 0;
    const instance = value(inst, key);
    const effective = instance === 0 || instance === 1 ? instance : modelValue;
    if (effective === 1) {
      throw new UnsupportedModelParameterError(
        name, key.toUpperCase(),
        `the BSIM3 ${key === 'nqsmod' ? 'non-quasi-static (NQS) charge model' : 'AC non-quasi-static model'} is not `
          + 'implemented; spice-ts would simulate the quasi-static model (NQSMOD=0) instead',
        { model: 'BSIM3' },
      );
    }
  }
}

/** Terminals whose charge ngspice integrates (BSIM3qg, BSIM3qd, BSIM3qb), in state order. */
const CHARGE_ROWS: readonly number[] = [TERMINAL.G, TERMINAL.D, TERMINAL.B];

function chargeOf(tc: BSIM3TerminalCharges, terminal: number): number {
  return terminal === TERMINAL.G ? tc.qg : terminal === TERMINAL.D ? tc.qd : tc.qb;
}

/**
 * Stamp a current `current` (NMOS convention) flowing into node `into` and out
 * of node `outOf`, controlled by the polarity-domain Vgs, Vds and Vbs of the
 * effective drain/gate/source/bulk nodes, with derivatives gG, gD, gB.
 */
function stampControlledCurrent(
  ctx: StampContext, type: number, m: number,
  into: number, outOf: number,
  nD: number, nG: number, nS: number, nB: number,
  current: number, gG: number, gD: number, gB: number,
  Vgs: number, Vds: number, Vbs: number,
): void {
  const ceq = m * type * (current - gG * Vgs - gD * Vds - gB * Vbs);
  const gs = -(gG + gD + gB);
  for (const [row, sign] of [[into, 1], [outOf, -1]] as const) {
    if (row < 0) continue;
    const s = sign * m;
    if (nG >= 0) ctx.stampG(row, nG, s * gG);
    if (nD >= 0) ctx.stampG(row, nD, s * gD);
    if (nB >= 0) ctx.stampG(row, nB, s * gB);
    if (nS >= 0) ctx.stampG(row, nS, s * gs);
    ctx.stampB(row, -sign * ceq);
  }
}

/**
 * b3ld.c source/drain junction diode (acmMod = 0); writes [g, i] at `offset`.
 * Above vjm (IJTH > 0) revision 3.2 (b3v32ld.c) linearises with slope
 * (Is + IJTH) / Nvtm through IJTH at vjm; later revisions use Is * exp(vjm / Nvtm).
 */
function junction(
  v: number, satCurrent: number, vjm: number, isEvjm: number, model: BSIM3Model,
  gmin: number, out: Float64Array, offset: number,
): void {
  const nvtm = model.vtm * model.jctEmissionCoeff;
  if (satCurrent <= 0.0) {
    out[offset] = gmin;
    out[offset + 1] = gmin * v;
  } else if (model.ijth === 0.0 || v < vjm) {
    const ev = Math.exp(v / nvtm);
    out[offset] = satCurrent * ev / nvtm + gmin;
    out[offset + 1] = satCurrent * (ev - 1.0) + gmin * v;
  } else if (model.revision === BSIM3_REVISION.V32) {
    const t0 = (satCurrent + model.ijth) / nvtm;
    out[offset] = t0 + gmin;
    out[offset + 1] = model.ijth + gmin * v + t0 * (v - vjm);
  } else {
    const t0 = isEvjm / nvtm;
    out[offset] = t0 + gmin;
    out[offset + 1] = isEvjm - satCurrent + t0 * (v - vjm) + gmin * v;
  }
}

