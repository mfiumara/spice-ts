import { describe, expect, it } from 'vitest';
import {
  ORDER_ONE_RECOVERY_RUN,
  PROGRESS_WINDOW_STEPS,
  TransientProgressMonitor,
} from './transient-progress.js';

describe('TransientProgressMonitor', () => {
  it('never requests order-1 for unverified steps that no LTE rejection forced', () => {
    // A user TSTEP at or below the LTE floor accepts every step unchecked.
    // Injecting Backward Euler there damps lossless LC tanks (PR #377 review).
    const monitor = new TransientProgressMonitor(5e-14);
    let time = 0;
    for (let step = 0; step < 10 * ORDER_ONE_RECOVERY_RUN; step++) {
      time += 5e-14;
      expect(monitor.accept(time, 5e-14, false)).toBe('continue');
    }
  });

  it('requests one order-1 step after a sustained run of LTE-unverified acceptances', () => {
    const monitor = new TransientProgressMonitor(1e-4);
    monitor.lteRejected();
    let time = 0;
    for (let step = 1; step < ORDER_ONE_RECOVERY_RUN; step++) {
      time += 5e-14;
      expect(monitor.accept(time, 5e-14, false)).toBe('continue');
    }
    time += 5e-14;
    expect(monitor.accept(time, 5e-14, false)).toBe('reduce-order');
    time += 5e-14;
    expect(monitor.accept(time, 5e-14, false)).toBe('continue');
  });

  it('restarts the unverified run after an LTE-verified acceptance', () => {
    const monitor = new TransientProgressMonitor(1e-4);
    monitor.lteRejected();
    let time = 0;
    for (let step = 1; step < ORDER_ONE_RECOVERY_RUN; step++) {
      time += 5e-14;
      monitor.accept(time, 5e-14, false);
    }
    time += 1e-12;
    expect(monitor.accept(time, 1e-12, true)).toBe('continue');
    monitor.lteRejected();
    for (let step = 1; step < ORDER_ONE_RECOVERY_RUN; step++) {
      time += 5e-14;
      expect(monitor.accept(time, 5e-14, false)).toBe('continue');
    }
  });

  it('stops counting unverified steps once an LTE check passes again', () => {
    const monitor = new TransientProgressMonitor(1e-4);
    monitor.lteRejected();
    let time = 1e-12;
    expect(monitor.accept(time, 1e-12, true)).toBe('continue');
    for (let step = 0; step < 10 * ORDER_ONE_RECOVERY_RUN; step++) {
      time += 5e-14;
      expect(monitor.accept(time, 5e-14, false)).toBe('continue');
    }
  });

  it('reports a stall when a full window of accepted steps barely advances time', () => {
    const monitor = new TransientProgressMonitor(1e-4);
    let time = 1e-4;
    const verdicts = new Set<string>();
    for (let step = 0; step < 2 * PROGRESS_WINDOW_STEPS; step++) {
      // Alternate verified/unverified so the order-1 recovery never fires.
      const dt = step % 2 === 0 ? 5e-14 : 1e-13;
      time += dt;
      const verdict = monitor.accept(time, dt, step % 2 === 1);
      verdicts.add(verdict);
      if (verdict === 'stalled') break;
    }
    expect(verdicts.has('stalled')).toBe(true);
  });

  it('does not report a stall for a user-requested sub-picosecond timestep', () => {
    const monitor = new TransientProgressMonitor(1e-13);
    let time = 0;
    const verdicts = new Set<string>();
    for (let step = 0; step < 2 * PROGRESS_WINDOW_STEPS + 1; step++) {
      time += 1e-13;
      verdicts.add(monitor.accept(time, 1e-13, true));
    }
    expect([...verdicts]).toEqual(['continue']);
  });

  it('forgets earlier progress after reset()', () => {
    const monitor = new TransientProgressMonitor(1e-4);
    monitor.lteRejected();
    let time = 0;
    for (let step = 1; step < ORDER_ONE_RECOVERY_RUN; step++) {
      time += 5e-14;
      monitor.accept(time, 5e-14, false);
    }
    monitor.reset();
    monitor.lteRejected();
    time = 5e-14;
    expect(monitor.accept(time, 5e-14, false)).toBe('continue');
  });
});
