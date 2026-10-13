import type { DeviceModel, StampContext } from './device.js';

/** ngspice-47 resistor instance parameters beyond the nominal resistance. */
export interface ResistorParameters {
  /** First-order temperature coefficient (1/°C). */
  tc1?: number;
  /** Second-order temperature coefficient (1/°C²). */
  tc2?: number;
  /** Exponential temperature coefficient; when given the factor is `1.01^(tce*dT)`. */
  tce?: number;
  /** Nominal temperature in °C (default 27). */
  tnom?: number;
  /** Instance temperature `TEMP` in °C; replaces the circuit temperature and ignores `DTEMP`. */
  temperature?: number;
  /** Instance `DTEMP` in °C, added to the circuit temperature when no `TEMP` is given. */
  deltaTemperature?: number;
  /** Parallel multiplier `M` (default 1). */
  multiplier?: number;
  /** Instance `SCALE` factor (default 1). */
  scale?: number;
  /** Nominal AC resistance (`ac=`), used by AC, noise and pole-zero analyses. */
  acResistance?: number;
  /** `noisy=0` makes the resistor noiseless in `.noise` (default true). */
  noisy?: boolean;
  /** `.model R` flicker-noise coefficient KF (not simulated). */
  flickerCoefficient?: number;
  /** ngspice-47 warnings from resolving the resistance, surfaced as `'model'` warnings. */
  warnings?: readonly string[];
}

export class Resistor implements DeviceModel {
  readonly branches: number[];
  readonly isNonlinear = false;
  /** Effective DC resistance after temperature, `SCALE` and `M`. */
  resistance = 0;
  /** Effective DC conductance, ngspice RESconduct = M / (R * factor * SCALE). */
  conductance = 0;
  /** Effective AC conductance (ngspice RESacConduct) when `ac=` is given. */
  acConductance: number | undefined;
  private nominalResistance: number;
  private temperature = 27;
  readonly modelWarnings?: readonly string[];

  private readonly parameters: ResistorParameters;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    resistance: number,
    readonly branchIndex?: number,
    parameters: ResistorParameters = {},
  ) {
    // Own copy: `.sens` perturbs the instance M and SCALE in place.
    this.parameters = { ...parameters };
    this.branches = branchIndex === undefined ? [] : [branchIndex];
    this.nominalResistance = resistance;
    if (parameters.warnings?.length) this.modelWarnings = parameters.warnings;
    this.applyTemperature();
  }

  /** False when the instance sets `noisy=0`. */
  get noisy(): boolean {
    return this.parameters.noisy ?? true;
  }

  get flickerCoefficient(): number {
    return this.parameters.flickerCoefficient ?? 0;
  }

  get hasAcResistance(): boolean {
    return this.parameters.acResistance !== undefined;
  }

  setParameter(value: number): void {
    this.nominalResistance = value;
    this.applyTemperature();
  }

  getParameter(): number {
    return this.nominalResistance;
  }

  /** Instance parallel multiplier `M` (ngspice RESm). */
  get multiplier(): number {
    return this.parameters.multiplier ?? 1;
  }

  setMultiplier(value: number): void {
    this.parameters.multiplier = value;
    this.applyTemperature();
  }

  /** Instance `SCALE` factor (ngspice RESscale). */
  get scale(): number {
    return this.parameters.scale ?? 1;
  }

  setScale(value: number): void {
    this.parameters.scale = value;
    this.applyTemperature();
  }

  /** Set the circuit temperature (°C); an instance `TEMP` still overrides it. */
  setTemperature(value: number): void {
    this.temperature = value;
    this.applyTemperature();
  }

  /**
   * Instance temperature in °C (ngspice REStemp + RESdtemp, restemp.c): the
   * instance `TEMP` if given, else the circuit temperature plus `DTEMP`. It
   * sets both the TC1/TC2/TCE resistance and the thermal noise (resnoise.c).
   */
  getTemperature(): number {
    const { temperature, deltaTemperature = 0 } = this.parameters;
    return temperature ?? this.temperature + deltaTemperature;
  }

  // ngspice-47 restemp.c RESupdate_conduct.
  private applyTemperature(): void {
    const { tc1 = 0, tc2 = 0, tce, tnom = 27, multiplier = 1, scale = 1, acResistance } = this.parameters;
    const delta = this.getTemperature() - tnom;
    const factor = tce !== undefined
      ? Math.pow(1.01, tce * delta)
      : ((tc2 * delta) + tc1) * delta + 1;
    this.resistance = this.nominalResistance * factor * scale / multiplier;
    this.conductance = multiplier / (this.nominalResistance * factor * scale);
    this.acConductance = acResistance === undefined
      ? undefined
      : multiplier / (acResistance * factor * scale);
  }

  stamp(ctx: StampContext): void {
    this.stampWith(ctx, this.resistance, this.conductance);
  }

  /** AC, noise and pole-zero stamp: ngspice RESacload/RESpzLoad use the AC conductance. */
  stampSmallSignal(ctx: StampContext): void {
    if (this.acConductance === undefined) {
      this.stamp(ctx);
      return;
    }
    this.stampWith(ctx, 1 / this.acConductance, this.acConductance);
  }

  private stampWith(ctx: StampContext, resistance: number, g: number): void {
    const [n1, n2] = this.nodes;

    if (this.branchIndex !== undefined) {
      const bi = ctx.numNodes + this.branchIndex;

      // Branch form: KCL includes I, while V(1) - V(2) = R * I.
      // Unlike a conductance stamp, this remains finite and exact at R = 0.
      if (n1 >= 0) ctx.stampG(n1, bi, 1);
      if (n2 >= 0) ctx.stampG(n2, bi, -1);
      if (n1 >= 0) ctx.stampG(bi, n1, 1);
      if (n2 >= 0) ctx.stampG(bi, n2, -1);
      ctx.stampG(bi, bi, -resistance);
      return;
    }

    if (n1 >= 0) ctx.stampG(n1, n1, g);
    if (n2 >= 0) ctx.stampG(n2, n2, g);
    if (n1 >= 0 && n2 >= 0) {
      ctx.stampG(n1, n2, -g);
      ctx.stampG(n2, n1, -g);
    }
  }
}
