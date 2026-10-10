export const XYCE_WAVEFORM_RELTOL = 0.005;

export interface ErrorMetrics {
  points: number;
  maxAbsolute: number;
  rmsAbsolute: number;
  maxRelative: number;
  rmsRelative: number;
}

export function compareWaveform(
  actual: number[],
  reference: number[],
  temperatureC: number,
): ErrorMetrics {
  if (actual.length === 0 || actual.length !== reference.length) {
    throw new Error(`TEMP ${temperatureC}: waveform lengths must match and be non-zero`);
  }

  const absolute = actual.map((value, index) => Math.abs(value - reference[index]));
  const relative = absolute.map((error, index) => (
    error / Math.max(Math.abs(reference[index]), 1e-12)
  ));
  const rms = (values: number[]) => Math.sqrt(
    values.reduce((sum, value) => sum + value * value, 0) / values.length,
  );
  const result = {
    points: actual.length,
    maxAbsolute: Math.max(...absolute),
    rmsAbsolute: rms(absolute),
    maxRelative: Math.max(...relative),
    rmsRelative: rms(relative),
  };

  if (result.maxRelative > XYCE_WAVEFORM_RELTOL) {
    const measured = Number(result.maxRelative.toPrecision(12));
    throw new Error(
      `TEMP ${temperatureC}: max relative waveform error ${measured} exceeds ${XYCE_WAVEFORM_RELTOL}`,
    );
  }

  return result;
}
