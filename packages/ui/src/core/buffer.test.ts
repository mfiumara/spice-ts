import { describe, it, expect } from 'vitest';
import { GrowableBuffer } from './buffer.js';

describe('GrowableBuffer', () => {
  it('starts empty with given initial capacity', () => {
    const buf = new GrowableBuffer(16);
    expect(buf.length).toBe(0);
    expect(buf.capacity).toBe(16);
  });

  it('appends values and grows length', () => {
    const buf = new GrowableBuffer(4);
    buf.push(1); buf.push(2); buf.push(3);
    expect(buf.length).toBe(3);
    expect(buf.get(0)).toBe(1);
    expect(buf.get(1)).toBe(2);
    expect(buf.get(2)).toBe(3);
  });

  it('doubles capacity when full', () => {
    const buf = new GrowableBuffer(2);
    buf.push(1); buf.push(2);
    expect(buf.capacity).toBe(2);
    buf.push(3);
    expect(buf.capacity).toBe(4);
    expect(buf.length).toBe(3);
    expect(buf.get(2)).toBe(3);
  });

  it('toArray returns a copy of the data', () => {
    const buf = new GrowableBuffer(4);
    buf.push(10); buf.push(20);
    const arr = buf.toArray();
    expect(arr).toEqual(new Float64Array([10, 20]));
    arr[0] = 999;
    expect(buf.get(0)).toBe(10);
  });

  it('clear resets length but keeps capacity', () => {
    const buf = new GrowableBuffer(4);
    buf.push(1); buf.push(2);
    buf.clear();
    expect(buf.length).toBe(0);
    expect(buf.capacity).toBe(4);
  });

  it('slice returns a sub-view as regular number array', () => {
    const buf = new GrowableBuffer(8);
    for (let i = 0; i < 5; i++) buf.push(i * 10);
    expect(buf.slice(1, 4)).toEqual([10, 20, 30]);
  });
});
