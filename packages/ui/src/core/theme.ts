import type { ThemeConfig } from './types.js';

export const DARK_THEME: ThemeConfig = {
  background: 'hsl(224, 50%, 6%)',
  surface: 'hsl(224, 71%, 4%)',
  border: 'hsl(215, 20%, 17%)',
  grid: 'hsl(215, 20%, 12%)',
  text: 'hsl(210, 40%, 98%)',
  textMuted: 'hsl(215, 20%, 45%)',
  cursor: 'hsl(215, 20%, 40%)',
  tooltipBg: 'hsl(224, 40%, 10%)',
  tooltipBorder: 'hsl(215, 20%, 22%)',
  font: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  fontSize: 11,
};

export const LIGHT_THEME: ThemeConfig = {
  background: 'hsl(210, 40%, 98%)',
  surface: 'hsl(0, 0%, 100%)',
  border: 'hsl(214, 32%, 91%)',
  grid: 'hsl(214, 32%, 91%)',
  text: 'hsl(222, 47%, 11%)',
  textMuted: 'hsl(215, 16%, 47%)',
  cursor: 'hsl(215, 16%, 47%)',
  tooltipBg: 'hsl(0, 0%, 100%)',
  tooltipBorder: 'hsl(214, 32%, 91%)',
  font: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  fontSize: 11,
};

export function mergeTheme(base: ThemeConfig, overrides: Partial<ThemeConfig>): ThemeConfig {
  return { ...base, ...overrides };
}

export function resolveTheme(theme: 'dark' | 'light' | ThemeConfig | undefined): ThemeConfig {
  if (theme === undefined || theme === 'dark') return DARK_THEME;
  if (theme === 'light') return LIGHT_THEME;
  return theme;
}
