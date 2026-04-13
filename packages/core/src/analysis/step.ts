import type { StepAnalysis } from '../types.js';

/**
 * Generate the array of parameter values for a .step sweep.
 */
export function generateStepValues(step: StepAnalysis): number[] {
  switch (step.sweepMode) {
    case 'lin': {
      const { start, stop, increment } = step;
      const values: number[] = [];
      const n = Math.round((stop! - start!) / increment!) + 1;
      for (let i = 0; i < n; i++) {
        values.push(start! + i * increment!);
      }
      return values;
    }
    case 'dec': {
      const { start, stop, points } = step;
      const decades = Math.log10(stop! / start!);
      const totalPoints = Math.round(decades * points!);
      const values: number[] = [];
      for (let i = 0; i <= totalPoints; i++) {
        values.push(start! * Math.pow(10, i / points!));
      }
      return values;
    }
    case 'oct': {
      const { start, stop, points } = step;
      const octaves = Math.log2(stop! / start!);
      const totalPoints = Math.round(octaves * points!);
      const values: number[] = [];
      for (let i = 0; i <= totalPoints; i++) {
        values.push(start! * Math.pow(2, i / points!));
      }
      return values;
    }
    case 'list':
      return step.values!.slice();
  }
}
