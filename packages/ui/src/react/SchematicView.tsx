import { useMemo, useState } from 'react';
import type { CircuitIR } from '../schematic/types.js';
import { layoutSchematic } from '../schematic/layout.js';
import { getSymbol, groundSymbol, GRID } from '../schematic/symbols.js';
import type { SvgElement } from '../schematic/symbols.js';
import type { PlacedComponent } from '../schematic/types.js';
import type { ThemeConfig } from '../core/types.js';
import { resolveTheme } from '../core/theme.js';

export interface SchematicViewProps {
  /** CircuitIR to render as a schematic */
  circuit: CircuitIR;
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

export function SchematicView({ circuit, theme, width = '100%', height = 400, onNodeClick }: SchematicViewProps) {
  const resolvedTheme = resolveTheme(theme ?? 'dark');
  const stroke = resolvedTheme.text;
  const [hovered, setHovered] = useState<PlacedComponent | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const { layout, error } = useMemo(() => {
    try {
      return { layout: layoutSchematic(circuit), error: null };
    } catch (e) {
      return { layout: null, error: e instanceof Error ? e.message : 'Failed to layout schematic' };
    }
  }, [circuit]);

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
    <div style={{ width, height: typeof height === 'number' ? height : undefined, overflow: 'auto', position: 'relative' }}>
      <svg
        viewBox={`0 0 ${padded.width} ${padded.height}`}
        width="100%"
        height="100%"
        style={{ display: 'block', opacity: 0.55 }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Wires */}
        {layout.wires.map((wire, wi) => (
          <g key={`w-${wi}`}>
            {wire.segments.map((seg, si) => (
              <line key={si}
                x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2}
                stroke={stroke} strokeWidth={1.5}
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
          const sym = getSymbol(pc.component.type, pc.component.displayValue ?? '', pc.horizontal, pc.stretchH, pc.stretchW, pc.flipped);
          return (
            <g key={ci} transform={`translate(${pc.x},${pc.y})`}
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => {
                setHovered(pc);
                const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                const svgEl = e.currentTarget.ownerSVGElement as SVGSVGElement;
                const point = svgEl.createSVGPoint();
                point.x = pc.x + sym.width / 2;
                point.y = pc.y;
                const ctm = svgEl.getScreenCTM();
                if (ctm) {
                  const screenPt = point.matrixTransform(ctm);
                  setTooltipPos({ x: screenPt.x - rect.left, y: screenPt.y - rect.top - 8 });
                }
              }}
              onMouseLeave={() => setHovered(null)}
              onClick={() => {
                if (onNodeClick) {
                  const mainPin = pc.pins.find(p => p.net !== '0');
                  if (mainPin) onNodeClick(mainPin.net);
                }
              }}
            >
              {/* Invisible hit area for hover/click */}
              <rect x={-4} y={-4} width={sym.width + 8} height={sym.height + 8}
                fill="transparent" stroke="none" />
              {sym.elements.map((el, i) => renderSvgElement(el, i, stroke))}
            </g>
          );
        })}

        {/* Ground symbols — side pins (left/right edge) get a downward stub first */}
        {layout.components.flatMap((pc, ci) =>
          pc.pins.flatMap((p, pi) => {
            if (p.net !== '0') return [];
            const gnd = groundSymbol();
            const compSym = getSymbol(pc.component.type, pc.component.displayValue ?? '', pc.horizontal, pc.stretchH, pc.stretchW, pc.flipped);
            const symPin = pi < compSym.pins.length ? compSym.pins[pi] : null;
            const isSidePin = symPin !== null && (symPin.dx <= 1 || symPin.dx >= compSym.width - 1);
            const stubLen = GRID * 1.5;
            if (isSidePin) {
              return [(
                <g key={`gnd-${ci}-${pi}`}>
                  <line x1={p.x} y1={p.y} x2={p.x} y2={p.y + stubLen}
                    stroke={stroke} strokeWidth={1.5} strokeLinecap="round" />
                  <g transform={`translate(${p.x - gnd.width / 2},${p.y + stubLen})`}>
                    {gnd.elements.map((el, i) => renderSvgElement(el, i, stroke))}
                  </g>
                </g>
              )];
            }
            return [(
              <g key={`gnd-${ci}-${pi}`} transform={`translate(${p.x - gnd.width / 2},${p.y})`}>
                {gnd.elements.map((el, i) => renderSvgElement(el, i, stroke))}
              </g>
            )];
          })
        )}
      </svg>

      {/* Tooltip */}
      {hovered && (
        <div style={{
          position: 'absolute',
          left: tooltipPos.x,
          top: tooltipPos.y,
          transform: 'translate(-50%, -100%)',
          background: resolvedTheme.tooltipBg,
          border: `1px solid ${resolvedTheme.tooltipBorder}`,
          borderRadius: 4,
          padding: '4px 8px',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          color: resolvedTheme.text,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}>
          <div style={{ fontWeight: 600 }}>{hovered.component.name}</div>
          {hovered.component.displayValue && (
            <div style={{ color: resolvedTheme.textMuted }}>{hovered.component.displayValue}</div>
          )}
        </div>
      )}
    </div>
  );
}
