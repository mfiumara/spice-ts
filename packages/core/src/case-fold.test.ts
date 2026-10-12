import { describe, expect, it } from 'vitest';
import { CaseFoldedNameSet, CaseInsensitiveMap, getCaseInsensitive } from './case-fold.js';

describe('CaseFoldedNameSet', () => {
  it('keeps the first spelling and resolves every case variant to it', () => {
    const set = new CaseFoldedNameSet();
    set.add('Out').add('OUT').add('in');
    expect([...set]).toEqual(['Out', 'in']);
    expect(set.has('out')).toBe(true);
    expect(set.canonical('oUT')).toBe('Out');
    expect(set.canonical('missing')).toBe('missing');
  });

  it('deletes and clears across case variants', () => {
    const set = new CaseFoldedNameSet();
    set.add('Out').add('in');
    expect(set.delete('OUT')).toBe(true);
    expect(set.delete('out')).toBe(false);
    expect([...set]).toEqual(['in']);
    set.clear();
    expect(set.size).toBe(0);
    expect(set.has('in')).toBe(false);
    set.add('IN');
    expect([...set]).toEqual(['IN']);
  });
});

describe('CaseInsensitiveMap', () => {
  it('stores one entry per folded key under its first spelling', () => {
    const map = new CaseInsensitiveMap<number>();
    map.set('L1', 1).set('l1', 2).set('l2', 3);
    expect([...map]).toEqual([['L1', 2], ['l2', 3]]);
    expect(map.get('l1')).toBe(2);
    expect(map.has('L2')).toBe(true);
    expect(map.get('L3')).toBeUndefined();
  });

  it('deletes and clears across case variants', () => {
    const map = new CaseInsensitiveMap<number>();
    map.set('V1', 1).set('v2', 2);
    expect(map.delete('v1')).toBe(true);
    expect(map.delete('V1')).toBe(false);
    expect([...map.keys()]).toEqual(['v2']);
    map.clear();
    expect(map.size).toBe(0);
    expect(map.has('v2')).toBe(false);
  });
});

describe('getCaseInsensitive', () => {
  it('prefers an exact key, then a case-insensitive one', () => {
    const map = new Map([['Out', 1], ['out', 2]]);
    expect(getCaseInsensitive(map, 'out')).toBe(2);
    expect(getCaseInsensitive(map, 'OUT')).toBe(1);
    expect(getCaseInsensitive(map, 'nope')).toBeUndefined();
  });
});
