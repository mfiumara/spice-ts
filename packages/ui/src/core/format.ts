const SI_PREFIXES: [number, string][] = [
  [1e-15, 'f'], [1e-12, 'p'], [1e-9, 'n'], [1e-6, 'µ'],
  [1e-3, 'm'], [1, ''], [1e3, 'k'], [1e6, 'M'], [1e9, 'G'], [1e12, 'T'],
];

export function formatSI(value: number): string {
  if (value === 0) return '0';
  const abs = Math.abs(value);
  let bestPrefix = '';
  let bestScale = 1;
  for (const [scale, prefix] of SI_PREFIXES) {
    if (abs >= scale * 0.9999) {
      bestScale = scale;
      bestPrefix = prefix;
    }
  }
  const scaled = value / bestScale;
  const formatted = parseFloat(scaled.toPrecision(4)).toString();
  return `${formatted}${bestPrefix}`;
}

export function formatTime(seconds: number): string { return `${formatSI(seconds)}s`; }
export function formatFrequency(hz: number): string { return `${formatSI(hz)}Hz`; }
export function formatVoltage(volts: number): string { return `${formatSI(volts)}V`; }
export function formatCurrent(amps: number): string { return `${formatSI(amps)}A`; }

export function formatDB(db: number): string {
  const rounded = Math.round(db * 10) / 10;
  return `${rounded === Math.floor(rounded) ? rounded.toString() : rounded.toString()}dB`;
}

export function formatPhase(degrees: number): string {
  const rounded = Math.round(degrees * 10) / 10;
  return `${rounded === Math.floor(rounded) ? rounded.toString() : rounded.toString()}°`;
}
