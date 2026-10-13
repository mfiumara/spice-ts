// ngspice devsup.c Newton-step voltage limiters shared by the device models.

/** devsup.c DEVfetlim. */
export function fetlim(vnew: number, vold: number, vto: number): number {
  const vtsthi = Math.abs(2 * (vold - vto)) + 2;
  const vtstlo = Math.abs(vold - vto) + 1;
  const vtox = vto + 3.5;
  const delv = vnew - vold;
  if (vold >= vto) {
    if (vold >= vtox) {
      if (delv <= 0) {
        if (vnew >= vtox) return -delv > vtstlo ? vold - vtstlo : vnew;
        return Math.max(vnew, vto + 2);
      }
      return delv >= vtsthi ? vold + vtsthi : vnew;
    }
    return delv <= 0 ? Math.max(vnew, vto - 0.5) : Math.min(vnew, vto + 4);
  }
  if (delv <= 0) return -delv > vtsthi ? vold - vtsthi : vnew;
  const vtemp = vto + 0.5;
  if (vnew <= vtemp) return delv > vtstlo ? vold + vtstlo : vnew;
  return vtemp;
}

/** devsup.c DEVlimvds. */
export function limvds(vnew: number, vold: number): number {
  if (vold >= 3.5) {
    if (vnew > vold) return Math.min(vnew, 3 * vold + 2);
    return vnew < 3.5 ? Math.max(vnew, 2) : vnew;
  }
  return vnew > vold ? Math.min(vnew, 4) : Math.max(vnew, -0.5);
}

/** devsup.c DEVpnjlim. */
export function pnjlim(vnew: number, vold: number, vt: number, vcrit: number): number {
  if (vnew > vcrit && Math.abs(vnew - vold) > vt + vt) {
    if (vold > 0) {
      const arg = (vnew - vold) / vt;
      return arg > 0
        ? vold + vt * (2 + Math.log(arg - 2))
        : vold - vt * (2 + Math.log(2 - arg));
    }
    return vt * Math.log(vnew / vt);
  }
  if (vnew < 0) {
    const arg = vold > 0 ? -1 * vold - 1 : 2 * vold - 1;
    if (vnew < arg) return arg;
  }
  return vnew;
}

/** Fraction of the step from `previous` to `proposed` that the limited value keeps, clamped to [0, 1]. */
export function stepScale(previous: number, proposed: number, limited: number): number {
  const delta = proposed - previous;
  if (delta === 0) return 1;
  return Math.min(1, Math.max(0, (limited - previous) / delta));
}
