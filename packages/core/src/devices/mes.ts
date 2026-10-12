import type {
  ChargeIntegration, ChargeTruncation, DeviceModel, StampContext,
} from './device.js';
import { stampChargeBranch, stampChargeCurrent, TransientChargeState } from './charge-state.js';
import {
  evaluateMES,
  mesGateCharge,
  MES_JUNCTION_GMIN,
  type MESInstanceParams,
  type MESModel,
} from './mes-model.js';
import { stampCapacitance, stampChannel, stampJunction } from './mesa.js';

/**
 * Intrinsic ngspice MES (`NMF` level 1, Statz) MESFET between drain', gate and
 * source'. RD/RS (divided by AREA) are expanded to series resistors at
 * compile time.
 */
export class MES implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = true;
  /** {@link truncateTransientStep} is the complete ngspice-47 step bound (MEStrunc: qgs, qgd). */
  readonly truncationCoversCharges = true;
  /** qgs/qgd advanced with the four-point qggnew difference of MESload. */
  readonly integratesTransientCharge = true;
  private readonly charges = new TransientChargeState(2);
  /** Gate voltages at the last accepted timepoint (ngspice CKTstate1 vgs/vgd). */
  private acceptedVgs: number | undefined;
  private acceptedVgd: number | undefined;
  private truncating = false;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    readonly model: MESModel,
    readonly instance: MESInstanceParams,
    readonly junctionGmin = MES_JUNCTION_GMIN,
  ) {}

  private voltages(ctx: StampContext): { vgs: number; vgd: number } {
    const [drain, gate, source] = this.nodes;
    const vG = voltage(ctx, gate);
    return { vgs: vG - voltage(ctx, source), vgd: vG - voltage(ctx, drain) };
  }

  stamp(ctx: StampContext): void {
    const [drain, gate, source] = this.nodes;
    const { vgs, vgd } = this.voltages(ctx);
    const point = evaluateMES(vgs, vgd, this.model, this.instance, this.junctionGmin);
    const vds = vgs - vgd;
    stampChannel(ctx, drain, gate, source, point.gm, point.gds,
      point.drainCurrent - point.gm * vgs - point.gds * vds);
    stampJunction(ctx, gate, source, point.gateSourceConductance,
      point.gateSourceCurrent - point.gateSourceConductance * vgs);
    stampJunction(ctx, gate, drain, point.gateDrainConductance,
      point.gateDrainCurrent - point.gateDrainConductance * vgd);
  }

  /** MESacLoad: capacitances qggnew returns at the operating point. */
  stampDynamic(ctx: StampContext): void {
    const [drain, gate, source] = this.nodes;
    const { vgs, vgd } = this.voltages(ctx);
    const { capGS, capGD } = mesGateCharge(vgs, vgd, this.model, this.instance);
    stampCapacitance(ctx, gate, source, capGS);
    stampCapacitance(ctx, gate, drain, capGD);
  }

  /**
   * MESload charges: qgs(n+1) = qgs(n) + (qa - qb + qc - qd) / 2 and
   * qgd(n+1) = qgd(n) + (qa - qc + qb - qd) / 2 with qa..qd = qggnew at
   * (vgs, vgd), (vgs1, vgd), (vgs, vgd1), (vgs1, vgd1).
   */
  private chargeIncrements(vgs: number, vgd: number) {
    const vgs1 = this.acceptedVgs ?? vgs;
    const vgd1 = this.acceptedVgd ?? vgd;
    const a = mesGateCharge(vgs, vgd, this.model, this.instance);
    const qb = mesGateCharge(vgs1, vgd, this.model, this.instance).charge;
    const qc = mesGateCharge(vgs, vgd1, this.model, this.instance).charge;
    const qd = mesGateCharge(vgs1, vgd1, this.model, this.instance).charge;
    return {
      gateSource: 0.5 * (a.charge - qb + qc - qd),
      gateDrain: 0.5 * (a.charge - qc + qb - qd),
      capGS: a.capGS,
      capGD: a.capGD,
    };
  }

  /**
   * Charge `index` advanced by `increment` from the accepted charge. The
   * accepted voltage of every MES charge is recorded as 0, so
   * incrementalCharge(index, increment, 1) is q(n) + increment.
   */
  private advancedCharge(index: number, increment: number): number {
    return this.charges.incrementalCharge(index, increment, 1);
  }

  stampTransientCharge(ctx: StampContext, integration: ChargeIntegration): void {
    const [drain, gate, source] = this.nodes;
    const { vgs, vgd } = this.voltages(ctx);
    const step = this.chargeIncrements(vgs, vgd);
    const charges = this.charges;
    charges.begin(integration);
    const qgs = this.advancedCharge(GATE_SOURCE, step.gateSource);
    const qgd = this.advancedCharge(GATE_DRAIN, step.gateDrain);
    stampChargeBranch(ctx, gate, source, charges.current(GATE_SOURCE, qgs), charges.factor * step.capGS, vgs);
    stampChargeBranch(ctx, gate, drain, charges.current(GATE_DRAIN, qgd), charges.factor * step.capGD, vgd);
  }

  stampAcceptedChargeCurrent(ctx: StampContext): void {
    const [drain, gate, source] = this.nodes;
    stampChargeCurrent(ctx, gate, source, this.charges.acceptedChargeCurrent(GATE_SOURCE));
    stampChargeCurrent(ctx, gate, drain, this.charges.acceptedChargeCurrent(GATE_DRAIN));
  }

  acceptTransientStep(ctx: StampContext): void {
    const { vgs, vgd } = this.voltages(ctx);
    const step = this.chargeIncrements(vgs, vgd);
    const charges = this.charges;
    charges.accept(GATE_SOURCE, this.advancedCharge(GATE_SOURCE, step.gateSource), 0, step.capGS);
    charges.accept(GATE_DRAIN, this.advancedCharge(GATE_DRAIN, step.gateDrain), 0, step.capGD);
    charges.commit();
    if (!this.truncating) {
      this.acceptedVgs = vgs;
      this.acceptedVgd = vgd;
    }
  }

  resetTransient(): void {
    this.charges.reset();
    this.acceptedVgs = undefined;
    this.acceptedVgd = undefined;
  }

  /** ngspice MEStrunc: qgs and qgd. */
  truncateTransientStep(ctx: StampContext, truncation: ChargeTruncation): number {
    this.truncating = true;
    try {
      return this.charges.truncationTimestep(truncation, () => this.acceptTransientStep(ctx));
    } finally {
      this.truncating = false;
    }
  }
}

const GATE_SOURCE = 0;
const GATE_DRAIN = 1;

function voltage(ctx: StampContext, node: number): number {
  return node >= 0 ? ctx.getVoltage(node) : 0;
}
