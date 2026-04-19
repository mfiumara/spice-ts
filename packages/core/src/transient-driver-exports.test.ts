import { describe, it, expect } from 'vitest';
import * as api from './index.js';

describe('@spice-ts/core public exports', () => {
  it('exports createTransientSim', () => {
    expect(typeof api.createTransientSim).toBe('function');
  });
});
