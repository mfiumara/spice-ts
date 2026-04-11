import type { DeviceModel, StampContext } from './device.js';

export interface MOSFETParams {
  VTO: number;
  KP: number;
  LAMBDA: number;
  W: number;
  L: number;
  polarity: number; // 1 for NMOS, -1 for PMOS
}

const GMIN = 1e-12;

export class MOSFET implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = true;
  readonly params: MOSFETParams;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    params: Partial<MOSFETParams> & Record<string, number>,
  ) {
    this.params = {
      VTO: params.VTO ?? 1,
      KP: params.KP ?? 2e-5,
      LAMBDA: params.LAMBDA ?? 0,
      W: params.W ?? 1,
      L: params.L ?? 1,
      polarity: params.polarity ?? 1,
    };
  }

  stamp(ctx: StampContext): void {
    const { VTO, KP, LAMBDA, W, L, polarity } = this.params;
    const WL = W / L;
    const [nD, nG, nS] = this.nodes;

    // Get node voltages
    const vD = nD >= 0 ? ctx.getVoltage(nD) : 0;
    const vG = nG >= 0 ? ctx.getVoltage(nG) : 0;
    const vS = nS >= 0 ? ctx.getVoltage(nS) : 0;

    // Internal voltages adjusted for polarity (PMOS flips)
    const vGS = polarity * (vG - vS);
    const vDS = polarity * (vD - vS);

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

    // Physical current into drain = polarity * ID
    // VGS = polarity*(vG - vS), VDS = polarity*(vD - vS)
    // dVGS/dvG = polarity, dVGS/dvS = -polarity
    // dVDS/dvD = polarity, dVDS/dvS = -polarity
    //
    // ID_node = polarity * (gm*VGS + gds*VDS + Ieq)
    //
    // dID_node/dvG = polarity * gm * polarity = gm
    // dID_node/dvD = polarity * gds * polarity = gds
    // dID_node/dvS = polarity * (-gm*polarity - gds*polarity) = -(gm + gds)
    //
    // IS_node = -ID_node (KCL, gate draws no current)
    // dIS_node/dvG = -gm
    // dIS_node/dvD = -gds
    // dIS_node/dvS = gm + gds

    // Stamp drain row (current into drain)
    if (nD >= 0) {
      if (nG >= 0) ctx.stampG(nD, nG, gm);
      if (nD >= 0) ctx.stampG(nD, nD, gds);
      if (nS >= 0) ctx.stampG(nD, nS, -(gm + gds));
      ctx.stampB(nD, -polarity * Ieq);
    }

    // Stamp source row (current into source = -current into drain)
    if (nS >= 0) {
      if (nG >= 0) ctx.stampG(nS, nG, -gm);
      if (nD >= 0) ctx.stampG(nS, nD, -gds);
      if (nS >= 0) ctx.stampG(nS, nS, gm + gds);
      ctx.stampB(nS, polarity * Ieq);
    }
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
    posMap: Int32Array,
    systemSize: number,
  ): void {
    const n = systemSize;
    for (let m = 0; m < mosfets.length; m++) {
      const mosfet = mosfets[m];
      const { VTO, KP, LAMBDA, W, L, polarity } = mosfet.params;
      const WL = W / L;
      const nD = mosfet.nodes[0];
      const nG = mosfet.nodes[1];
      const nS = mosfet.nodes[2];

      // Get node voltages
      const vD = nD >= 0 ? solution[nD] : 0;
      const vG = nG >= 0 ? solution[nG] : 0;
      const vS = nS >= 0 ? solution[nS] : 0;

      // Internal voltages adjusted for polarity (PMOS flips)
      const vGS = polarity * (vG - vS);
      const vDS = polarity * (vD - vS);

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

      // Stamp drain row (current into drain) — direct array writes
      if (nD >= 0) {
        if (nG >= 0) gValues[posMap[nD * n + nG]] += gm;
        if (nD >= 0) gValues[posMap[nD * n + nD]] += gds;
        if (nS >= 0) gValues[posMap[nD * n + nS]] -= (gm + gds);
        b[nD] -= polarity * Ieq;
      }

      // Stamp source row (current into source = -current into drain)
      if (nS >= 0) {
        if (nG >= 0) gValues[posMap[nS * n + nG]] -= gm;
        if (nD >= 0) gValues[posMap[nS * n + nD]] -= gds;
        if (nS >= 0) gValues[posMap[nS * n + nS]] += (gm + gds);
        b[nS] += polarity * Ieq;
      }
    }
  }
}
