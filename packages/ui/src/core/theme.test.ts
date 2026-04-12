import { describe, it, expect } from 'vitest';
import { DARK_THEME, LIGHT_THEME, mergeTheme, resolveTheme } from './theme.js';
import type { ThemeConfig } from './types.js';

describe('theme', () => {
  it('DARK_THEME has all required fields', () => {
    expect(DARK_THEME.background).toBeDefined();
    expect(DARK_THEME.surface).toBeDefined();
    expect(DARK_THEME.border).toBeDefined();
    expect(DARK_THEME.grid).toBeDefined();
    expect(DARK_THEME.text).toBeDefined();
    expect(DARK_THEME.textMuted).toBeDefined();
    expect(DARK_THEME.cursor).toBeDefined();
    expect(DARK_THEME.tooltipBg).toBeDefined();
    expect(DARK_THEME.tooltipBorder).toBeDefined();
    expect(DARK_THEME.font).toBeDefined();
    expect(DARK_THEME.fontSize).toBeGreaterThan(0);
  });

  it('LIGHT_THEME has all required fields', () => {
    expect(LIGHT_THEME.background).toBeDefined();
    expect(LIGHT_THEME.text).toBeDefined();
    expect(LIGHT_THEME.fontSize).toBeGreaterThan(0);
  });

  it('mergeTheme overrides specific fields', () => {
    const merged = mergeTheme(DARK_THEME, { fontSize: 16, background: '#000' });
    expect(merged.fontSize).toBe(16);
    expect(merged.background).toBe('#000');
    expect(merged.text).toBe(DARK_THEME.text);
  });

  it('mergeTheme returns base unchanged when overrides is empty', () => {
    const merged = mergeTheme(DARK_THEME, {});
    expect(merged).toEqual(DARK_THEME);
  });

  it('resolveTheme returns DARK_THEME for "dark"', () => {
    expect(resolveTheme('dark')).toEqual(DARK_THEME);
  });

  it('resolveTheme returns LIGHT_THEME for "light"', () => {
    expect(resolveTheme('light')).toEqual(LIGHT_THEME);
  });

  it('resolveTheme returns custom ThemeConfig as-is', () => {
    const custom: ThemeConfig = { ...DARK_THEME, fontSize: 20 };
    expect(resolveTheme(custom)).toBe(custom);
  });

  it('resolveTheme defaults to DARK_THEME for undefined', () => {
    expect(resolveTheme(undefined)).toEqual(DARK_THEME);
  });
});
