import { describe, it, expect } from 'vitest';
import { formatSI, formatTime, formatFrequency, formatVoltage, formatCurrent, formatPhase, formatDB } from './format.js';

describe('formatSI', () => {
  it('formats values with SI prefixes', () => {
    expect(formatSI(1e-12)).toBe('1p');
    expect(formatSI(1e-9)).toBe('1n');
    expect(formatSI(1e-6)).toBe('1µ');
    expect(formatSI(1e-3)).toBe('1m');
    expect(formatSI(1)).toBe('1');
    expect(formatSI(1e3)).toBe('1k');
    expect(formatSI(1e6)).toBe('1M');
    expect(formatSI(1e9)).toBe('1G');
  });

  it('formats fractional values', () => {
    expect(formatSI(2.5e-3)).toBe('2.5m');
    expect(formatSI(47e3)).toBe('47k');
    expect(formatSI(3.3e-6)).toBe('3.3µ');
  });

  it('formats zero', () => { expect(formatSI(0)).toBe('0'); });
  it('formats negative values', () => { expect(formatSI(-5e-3)).toBe('-5m'); });
  it('limits decimal places', () => { expect(formatSI(1.23456e3)).toBe('1.235k'); });
});

describe('formatTime', () => {
  it('appends s suffix', () => {
    expect(formatTime(1e-3)).toBe('1ms');
    expect(formatTime(2.5e-6)).toBe('2.5µs');
    expect(formatTime(1)).toBe('1s');
  });
});

describe('formatFrequency', () => {
  it('appends Hz suffix', () => {
    expect(formatFrequency(1e3)).toBe('1kHz');
    expect(formatFrequency(1e6)).toBe('1MHz');
    expect(formatFrequency(100)).toBe('100Hz');
  });
});

describe('formatVoltage', () => {
  it('appends V suffix', () => {
    expect(formatVoltage(5)).toBe('5V');
    expect(formatVoltage(3.3e-3)).toBe('3.3mV');
  });
});

describe('formatCurrent', () => {
  it('appends A suffix', () => {
    expect(formatCurrent(1e-3)).toBe('1mA');
    expect(formatCurrent(5e-6)).toBe('5µA');
  });
});

describe('formatDB', () => {
  it('formats with dB suffix', () => {
    expect(formatDB(0)).toBe('0dB');
    expect(formatDB(-3)).toBe('-3dB');
    expect(formatDB(-20.5)).toBe('-20.5dB');
  });
});

describe('formatPhase', () => {
  it('formats with degree suffix', () => {
    expect(formatPhase(0)).toBe('0°');
    expect(formatPhase(-90)).toBe('-90°');
    expect(formatPhase(-45.5)).toBe('-45.5°');
  });
});
