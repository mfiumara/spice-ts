import { InvalidCircuitError } from '../errors.js';

/** MOS1 mos1temp.c/mos1load.c depletion charge at TEMP=TNOM=27 C.
 * CBD/CBS override the bottom CJ*area only; the sidewall contribution remains.
 * Above FC*PB the capacitance continues linearly (charge quadratically).
 */
export class MOS1DepletionCharge {
  private readonly f2: number;
  private readonly f3: number;
  private readonly f4: number;
  readonly active: boolean;

  constructor(
    private readonly bottom: number,
    private readonly sidewall: number,
    private readonly potential: number,
    private readonly grading: number,
    private readonly sideGrading: number,
    private readonly fc: number,
  ) {
    this.active = bottom !== 0 || sidewall !== 0;
    if (this.active && (!(potential > 0) || !(fc < 1))) {
      throw new InvalidCircuitError('MOSFET level 1 junction capacitance requires PB > 0 and FC < 1');
    }
    const arg = 1 - fc;
    const scale = Math.pow(arg, -grading);
    const sideScale = Math.pow(arg, -sideGrading);
    this.f2 = bottom * (1 - fc * (1 + grading)) * scale / arg
      + sidewall * (1 - fc * (1 + sideGrading)) * sideScale / arg;
    this.f3 = (bottom * grading * scale + sidewall * sideGrading * sideScale) / (arg * potential);
    const transition = fc * potential;
    this.f4 = this.reverseCharge(transition) - transition * (this.f2 + transition * this.f3 / 2);
  }

  capacitance(voltage: number): number {
    if (!this.active) return 0;
    if (voltage >= this.fc * this.potential) return this.f2 + this.f3 * voltage;
    const arg = 1 - voltage / this.potential;
    return this.bottom * Math.pow(arg, -this.grading) + this.sidewall * Math.pow(arg, -this.sideGrading);
  }

  charge(voltage: number): number {
    if (!this.active) return 0;
    return voltage < this.fc * this.potential
      ? this.reverseCharge(voltage)
      : this.f4 + voltage * (this.f2 + voltage * this.f3 / 2);
  }

  private reverseCharge(voltage: number): number {
    const logArg = Math.log1p(-voltage / this.potential);
    // The logarithmic limit at grading=1 avoids a removable 0/0 singularity.
    const integral = (grading: number) => grading === 1
      ? -logArg : -Math.expm1((1 - grading) * logArg) / (1 - grading);
    return this.potential * (this.bottom * integral(this.grading) + this.sidewall * integral(this.sideGrading));
  }
}
