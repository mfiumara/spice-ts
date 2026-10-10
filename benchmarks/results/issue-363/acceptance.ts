export const DISTORTION_RELTOL = 0.005;

export interface ErrorMetrics {
  sampleCount: number;
  maximumAbsoluteError: number;
  rmsAbsoluteError: number;
  maximumRelativeError: number;
  rmsRelativeError: number;
}

export function assertDistortionMetricAccepted(
  metrics: ErrorMetrics,
  product: string,
  signal: string,
): void {
  if (metrics.maximumRelativeError > DISTORTION_RELTOL) {
    throw new Error(
      `${product} ${signal}: maximum relative error ${metrics.maximumRelativeError} exceeds ${DISTORTION_RELTOL}`,
    );
  }
}
