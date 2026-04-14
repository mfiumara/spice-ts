import { useMemo } from 'react';
import { buildSchematicGraph } from '../schematic/graph.js';
import { layoutSchematic } from '../schematic/layout.js';
import { getSymbol, groundSymbol, GRID } from '../schematic/symbols.js';
import type { SvgElement } from '../schematic/symbols.js';
import type { ThemeConfig } from '../core/types.js';
import { resolveTheme } from '../core/theme.js';

export interface SchematicViewProps {
  /** SPICE netlist string to render */
  netlist: string;
  /** Theme preset or custom config */
  theme?: 'dark' | 'light' | ThemeConfig;
  /** Width of the container */
  width?: number | string;
  /** Height of the container */
  height?: number | string;
  /** Called when a net node is clicked (future probe hookup) */
  onNodeClick?: (node: string) => void;
}

function renderSvgElement(el: SvgElement, i: number, stroke: string) {
  const common = { key: i, stroke, strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (el.tag) {
    case 'path':
      return <path {...common} d={el.attrs.d as string} fill={(el.attrs.fill as string) ?? 'none'} />;
    case 'line':
      return <line {...common} x1={el.attrs.x1} y1={el.attrs.y1} x2={el.attrs.x2} y2={el.attrs.y2} />;
    case 'circle':
      return <circle {...common} cx={el.attrs.cx} cy={el.attrs.cy} r={el.attrs.r} fill={(el.attrs.fill as string) ?? 'none'} />;
    case 'polyline':
      return <polyline {...common} points={el.attrs.points as string} fill={(el.attrs.fill as string) ?? 'none'} />;
    case 'text':
      return (
        <text key={i} x={el.attrs.x} y={el.attrs.y}
          fill={stroke} fontSize={el.attrs['font-size'] ?? 10}
          fontFamily="'JetBrains Mono', monospace"
        >
          {el.text}
        </text>
      );
    default:
      return null;
  }
}

export function SchematicView({ netlist, theme, width = '100%', height = 400, onNodeClick }: SchematicViewProps) {
  const resolvedTheme = resolveTheme(theme ?? 'dark');
  const stroke = resolvedTheme.text;

  const { layout, error } = useMemo(() => {
    try {
      const graph = buildSchematicGraph(netlist);
      return { layout: layoutSchematic(graph), error: null };
    } catch (e) {
      return { layout: null, error: e instanceof Error ? e.message : 'Failed to parse netlist' };
    }
  }, [netlist]);

  if (error) {
    return (
      <div style={{
        width, height, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: resolvedTheme.textMuted,
      }}>
        Schematic error: {error}
      </div>
    );
  }

  if (!layout || layout.components.length === 0) {
    return (
      <div style={{
        width, height, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: resolvedTheme.textMuted,
      }}>
        No components to display
      </div>
    );
  }

  const { bounds } = layout;
  const padded = { width: bounds.width + GRID, height: bounds.height + GRID };

  return (
    <div style={{ width, height: typeof height === 'number' ? height : undefined, overflow: 'auto' }}>
      <svg
        viewBox={`0 0 ${padded.width} ${padded.height}`}
        width="100%"
        height="100%"
        style={{ display: 'block' }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Wires */}
        {layout.wires.map((wire, wi) => (
          <g key={`w-${wi}`}>
            {wire.segments.map((seg, si) => (
              <line key={si}
                x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2}
                stroke={stroke} strokeWidth={1.5} opacity={0.7}
              />
            ))}
          </g>
        ))}

        {/* Junctions */}
        {layout.junctions.map((j, i) => (
          <circle key={`j-${i}`} cx={j.x} cy={j.y} r={3} fill={stroke} />
        ))}

        {/* Components */}
        {layout.components.map((pc, ci) => {
          const sym = getSymbol(pc.component.type, pc.component.displayValue);
          return (
            <g key={ci} transform={`translate(${pc.x},${pc.y})`}>
              {/* Symbol */}
              {sym.elements.map((el, i) => renderSvgElement(el, i, stroke))}

              {/* Pin dots */}
              {sym.pins.map((p, i) => (
                <circle key={`p-${i}`} cx={p.dx} cy={p.dy} r={2.5}
                  fill={stroke} opacity={0.7}
                  style={{ cursor: onNodeClick ? 'pointer' : undefined }}
                  onClick={() => onNodeClick?.(pc.pins[i]?.net ?? '')}
                />
              ))}

              {/* Component name (designator) label */}
              <text
                x={sym.width / 2} y={-6}
                textAnchor="middle" fill={stroke}
                fontSize={10} fontFamily="'JetBrains Mono', monospace"
                opacity={0.8}
              >
                {pc.component.name}
              </text>

              {/* Value label */}
              <text
                x={sym.width / 2} y={sym.height + 12}
                textAnchor="middle" fill={stroke}
                fontSize={9} fontFamily="'JetBrains Mono', monospace"
                opacity={0.5}
              >
                {pc.component.displayValue}
              </text>
            </g>
          );
        })}

        {/* Ground symbols */}
        {layout.components.flatMap((pc, ci) =>
          pc.pins.filter(p => p.net === '0').map((p, gi) => {
            const gnd = groundSymbol();
            return (
              <g key={`gnd-${ci}-${gi}`} transform={`translate(${p.x - gnd.width / 2},${p.y})`}>
                {gnd.elements.map((el, i) => renderSvgElement(el, i, stroke))}
              </g>
            );
          })
        )}
      </svg>
    </div>
  );
}
