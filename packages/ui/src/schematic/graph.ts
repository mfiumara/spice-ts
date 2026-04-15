import type { SchematicComponent, SchematicGraph } from './types.js';

const DEVICE_PREFIXES = new Set(['R','C','L','V','I','D','Q','M','E','G','F','H','X']);

/**
 * Extract a schematic graph from a SPICE netlist string.
 * Lightweight tokenizer — does not depend on @spice-ts/core.
 */
export function buildSchematicGraph(netlist: string): SchematicGraph {
  const components: SchematicComponent[] = [];
  const netSet = new Set<string>();

  for (const rawLine of netlist.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('*') || line.startsWith('.') || line.startsWith('+')) continue;

    const tokens = line.split(/\s+/);
    if (tokens.length < 2) continue;

    const name = tokens[0];
    const type = name[0].toUpperCase();
    if (!DEVICE_PREFIXES.has(type)) continue;

    const comp = parseDeviceLine(type, name, tokens);
    if (comp) {
      components.push(comp);
      for (const n of comp.nodes) {
        if (n !== '0') netSet.add(n);
      }
    }
  }

  return { components, nets: [...netSet] };
}

function parseDeviceLine(type: string, name: string, tokens: string[]): SchematicComponent | null {
  switch (type) {
    case 'R':
    case 'C':
    case 'L':
      return { type, name, nodes: [tokens[1], tokens[2]], displayValue: tokens[3] ?? '' };

    case 'V':
    case 'I':
      return { type, name, nodes: [tokens[1], tokens[2]], displayValue: tokens.slice(3).join(' ') };

    case 'D':
      return { type, name, nodes: [tokens[1], tokens[2]], displayValue: tokens[3] ?? '' };

    case 'Q':
      return { type, name, nodes: [tokens[1], tokens[2], tokens[3]], displayValue: tokens[4] ?? '' };

    case 'M': {
      // SPICE: M name drain gate source [bulk] model [params]
      // Remap to [gate, drain, source] to match symbol pin order
      const modelIdx = tokens.findIndex((t, i) => i >= 4 && t && !t.includes('='));
      const modelName = modelIdx >= 0 ? tokens[modelIdx] : '';
      return { type, name, nodes: [tokens[2], tokens[1], tokens[3]], displayValue: modelName };
    }

    case 'E':
    case 'G':
      // SPICE VCVS: E name n+ n- nc+ nc- gain
      // Remap to [nc+, nc-, n+] = [+input, -input, output] to match opamp symbol pins
      return { type, name, nodes: [tokens[3], tokens[4], tokens[1]], displayValue: tokens[5] ?? '' };

    case 'F':
    case 'H':
      return { type, name, nodes: [tokens[1], tokens[2]], displayValue: tokens[4] ?? '' };

    default:
      return null;
  }
}
