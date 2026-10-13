/**
 * The polynomial of a SPICE2 `POLY(n)` controlled source, as ngspice-47
 * evaluates it in the XSPICE spice2poly code model
 * (src/xspice/icm/spice2poly/icm_spice2poly/cfunc.mod).
 */

/**
 * Advance `pwrseq` to the exponents of the next product term: a literal port
 * of SPICE 2G6 NXTPWR as spice2poly/cfunc.mod carries it. It orders the terms
 * of a 2-D polynomial a, b, a^2, ab, b^2, a^3, ... and of a 3-D one
 * a, b, c, a^2, ab, ac, b^2, bc, c^2, a^3, ...
 */
export function nextPowers(pwrseq: Int32Array): void {
  const pdim = pwrseq.length;
  const at = (index: number) => pwrseq[index - 1];
  const set = (index: number, value: number) => { pwrseq[index - 1] = value; };
  if (pdim === 1) {
    set(1, at(1) + 1);
    return;
  }
  let k = pdim;
  while (at(k) === 0) {
    k--;
    if (k === 0) {
      set(1, at(1) + 1);
      return;
    }
  }
  if (k !== pdim) {
    set(k, at(k) - 1);
    set(k + 1, at(k + 1) + 1);
    return;
  }
  let lowerNonZero = false;
  for (let i = 1; i <= k - 1; i++) {
    if (at(i) !== 0) {
      lowerNonZero = true;
      break;
    }
  }
  if (!lowerNonZero) {
    set(1, at(pdim) + 1);
    set(pdim, 0);
    return;
  }
  let psum = 1;
  k = pdim;
  while (at(k - 1) < 1) {
    psum += at(k);
    set(k, 0);
    k--;
  }
  set(k, at(k) + psum);
  set(k - 1, at(k - 1) - 1);
}

/**
 * The B-source expression of `coef[0] + sum coef[i] * prod inputs[j]**e_ij`
 * with the exponents from {@link nextPowers}, scaled by `multiplier` when
 * given. It keeps spice2poly's evaluation order: each product multiplies the
 * inputs' powers left to right, each power by repeated multiplication
 * (`(x*x)*(y*y)`, as evterm), multiplied by its
 * coefficient, and added to the running sum left to right. Terms beyond the
 * given coefficients are absent (zero), as in spice2poly.
 */
export function polyExpression(inputs: readonly string[], coefficients: readonly string[], multiplier?: string): string {
  const exponents = new Int32Array(inputs.length);
  let sum = `(${coefficients[0]})`;
  for (let i = 1; i < coefficients.length; i++) {
    nextPowers(exponents);
    const powers: string[] = [];
    exponents.forEach((exponent, j) => {
      if (exponent > 0) powers.push(Array(exponent).fill(inputs[j]).reduce((left, x) => `(${left}*${x})`));
    });
    const product = powers.reduce((left, power) => `(${left}*${power})`);
    sum += `+(${coefficients[i]})*${product}`;
  }
  return multiplier === undefined ? sum : `(${sum})*(${multiplier})`;
}
