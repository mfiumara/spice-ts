import { describe, it, expect } from 'vitest';
import { BreakpointQueue } from './breakpoint-queue.js';

describe('BreakpointQueue', () => {
  it('sorts and dedups input times', () => {
    const q = new BreakpointQueue([5e-6, 1e-6, 1e-6, 3e-6, 5e-6], 1e-14);
    expect(q.peek()).toBe(1e-6);
    q.pop();
    expect(q.peek()).toBe(3e-6);
    q.pop();
    expect(q.peek()).toBe(5e-6);
    q.pop();
    expect(q.peek()).toBeUndefined();
  });

  it('treats entries within tolerance as duplicates', () => {
    const q = new BreakpointQueue([1e-6, 1e-6 + 1e-15, 2e-6], 1e-14);
    expect(q.peek()).toBe(1e-6);
    q.pop();
    expect(q.peek()).toBe(2e-6);
  });

  it('filters non-finite and non-positive entries', () => {
    const q = new BreakpointQueue([0, -1e-6, Infinity, NaN, 1e-6], 1e-14);
    expect(q.peek()).toBe(1e-6);
    q.pop();
    expect(q.peek()).toBeUndefined();
  });

  it('isNear returns true only for times within tolerance of the head', () => {
    const q = new BreakpointQueue([1e-6, 2e-6], 1e-14);
    expect(q.isNear(1e-6)).toBe(true);
    expect(q.isNear(1e-6 - 5e-15)).toBe(true);
    expect(q.isNear(0.5e-6)).toBe(false);
    expect(q.isNear(2e-6)).toBe(false); // head is 1e-6, not 2e-6
  });

  it('peek returns undefined when empty', () => {
    const q = new BreakpointQueue([], 1e-14);
    expect(q.peek()).toBeUndefined();
    expect(q.isNear(0)).toBe(false);
    q.pop(); // must not throw
  });

  it('remaining() returns unconsumed entries in order', () => {
    const q = new BreakpointQueue([3e-6, 1e-6, 2e-6], 1e-14);
    expect([...q.remaining()]).toEqual([1e-6, 2e-6, 3e-6]);
    q.pop();
    expect([...q.remaining()]).toEqual([2e-6, 3e-6]);
    q.pop();
    q.pop();
    expect([...q.remaining()]).toEqual([]);
  });
});
