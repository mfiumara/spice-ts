import { describe, expect, it } from 'vitest';
import { parseDiodeInstanceParams } from './diode-parser.js';

describe('parseDiodeInstanceParams', () => {
  it('accepts positional AREA plus named PJ and M geometry', () => {
    expect(parseDiodeInstanceParams(['D1', '1', '0', 'DMOD', '2', 'PJ=3', 'M=4'], 4))
      .toEqual({ AREA: 2, PJ: 3, M: 4 });
  });

  it.each(['OFF', 'IC=0.2', 'TEMP=50', 'DTEMP=5', 'UNKNOWN=1'])(
    'rejects unsupported trailing field %s',
    field => {
      expect(() => parseDiodeInstanceParams(['D1', '1', '0', 'DMOD', field], 4))
        .toThrow(`Unsupported diode parameter: '${field}'`);
    },
  );

  it('rejects the ngspice thermal-node form with a typed self-heating error (#490)', () => {
    expect(() => parseDiodeInstanceParams(['D1', '1', '0', 'tj', 'dmod', 'thermal'], 4))
      .toThrow("Unsupported diode thermal node 'tj' (model 'dmod'): diode self-heating is not implemented");
    expect(() => parseDiodeInstanceParams(['D1', '1', '0', 'dmod', 'thermal'], 4))
      .toThrow("Unsupported diode instance flag: 'THERMAL' (diode self-heating is not implemented)");
  });

  it('validates geometry domains', () => {
    expect(() => parseDiodeInstanceParams(['D1', '1', '0', 'DMOD', 'AREA=0'], 4))
      .toThrow('Diode AREA must be greater than zero');
    expect(() => parseDiodeInstanceParams(['D1', '1', '0', 'DMOD', 'PJ=-1'], 4))
      .toThrow('Diode PJ must be non-negative');
    expect(() => parseDiodeInstanceParams(['D1', '1', '0', 'DMOD', 'M=0'], 4))
      .toThrow('Diode M must be greater than zero');
  });
});
