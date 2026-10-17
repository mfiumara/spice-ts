import { describe, expect, it } from 'vitest';
import { InvalidCircuitError } from '../../errors.js';
import { parseXspiceInstance, parseXspiceModelCard } from '../../parser/xspice-parser.js';
import { buildXspiceEventNetwork, prepareXspiceInstance } from './compile.js';

describe('XSPICE event network initialization', () => {
  it('rejects transient startup before initialization and permits it after initialization', () => {
    const prepared = prepareXspiceInstance(
      parseXspiceInstance('a1 d pull', 1),
      parseXspiceModelCard('.model pull d_pulldown', 2),
      false, '0',
    );
    const { network } = buildXspiceEventNetwork([prepared])!;
    const beginTransient = () => network.beginTransient(() => {}, 0);

    expect(beginTransient).toThrow(InvalidCircuitError);
    expect(beginTransient).toThrow('XSPICE event-driven instances need initialization before transient analysis');
    expect(network.nodeHistories().get('d')).toEqual([]);

    network.operatingPoint(() => {});
    expect(beginTransient).not.toThrow();
    expect(network.nodeHistories().get('d')).toEqual([{ time: 0, state: '0', strength: 'r' }]);
    network.processEvents(1e-9, 0);
    network.acceptStep(1e-9, true);
    expect(network.nodeHistories().get('d')).toEqual([{ time: 0, state: '0', strength: 'r' }]);
  });
});
