import { useMemo, useState, type KeyboardEvent } from 'react';
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
  /** Called when a net node or wire is activated. */
  onNodeClick?: (node: string) => void;
  /** Called when a component branch is activated. */
  onBranchClick?: (component: string) => void;
  /** Active probes, used to color-link the schematic to waveform traces. */
  probes?: readonly SchematicProbe[];
}

export interface SchematicProbe {
  kind: 'voltage' | 'current';
  target: string;
  color: string;
}

// Klein's signature stroke weight — heavier than a drafting pen, lighter than
// a marker. Used for symbol bodies, wires, and ground stubs so the schematic
// reads consistently bold across every primitive.
const STROKE_W = 2.2;
const BRANCH_CURRENT_TYPES = new Set(['V', 'L', 'E', 'H']);

function renderSvgElement(el: SvgElement, i: number, stroke: string) {
  // `key` must be passed directly, not via spread — React warns otherwise.
  const common = { stroke, strokeWidth: STROKE_W, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (el.tag) {
    case 'path':
      return <path key={i} {...common} d={el.attrs.d as string} fill={(el.attrs.fill as string) ?? 'none'} />;
    case 'line':
      return <line key={i} {...common} x1={el.attrs.x1} y1={el.attrs.y1} x2={el.attrs.x2} y2={el.attrs.y2} />;
    case 'circle':
      return <circle key={i} {...common} cx={el.attrs.cx} cy={el.attrs.cy} r={el.attrs.r} fill={(el.attrs.fill as string) ?? 'none'} />;
    case 'polyline':
      return <polyline key={i} {...common} points={el.attrs.points as string} fill={(el.attrs.fill as string) ?? 'none'} />;
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

export function SchematicView({
  circuit,
  theme,
  width = '100%',
  height = 400,
  onNodeClick,
  onBranchClick,
  probes = [],
}: SchematicViewProps) {
  const resolvedTheme = resolveTheme(theme ?? 'dark');
  const stroke = resolvedTheme.text;
  const [hovered, setHovered] = useState<PlacedComponent | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const nodeProbe = (net: string) => probes.find((probe) => probe.kind === 'voltage' && probe.target === net);
  const branchProbe = (component: string) => probes.find((probe) => probe.kind === 'current' && probe.target === component);
  const activateOnKey = (event: KeyboardEvent, activate: () => void) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate();
    }
  };

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
    <div style={{ width, height, overflow: 'auto', position: 'relative' }}>
      <svg
        viewBox={`0 0 ${padded.width} ${padded.height}`}
        width="100%"
        height="100%"
        style={{ display: 'block', opacity: 0.55 }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Wires */}
        {layout.wires.map((wire, wi) => {
          const probe = nodeProbe(wire.net);
          const wireStroke = probe?.color ?? stroke;
          return (
          <g key={`w-${wi}`}
            role="button"
            tabIndex={0}
            aria-label={`Probe voltage at ${wire.net}`}
            aria-pressed={probe != null}
            data-probe-color={probe?.color}
            style={{ cursor: onNodeClick ? 'pointer' : undefined }}
            onClick={() => onNodeClick?.(wire.net)}
            onKeyDown={(event) => activateOnKey(event, () => onNodeClick?.(wire.net))}
          >
            {wire.segments.map((seg, si) => (
              <line key={si}
                x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2}
                stroke={wireStroke} strokeWidth={probe ? STROKE_W + 1.4 : STROKE_W}
              />
            ))}
            {probe && wire.segments[0] && (
              <circle
                cx={(wire.segments[0].x1 + wire.segments[0].x2) / 2}
                cy={(wire.segments[0].y1 + wire.segments[0].y2) / 2}
                r={5}
                fill={probe.color}
                stroke={resolvedTheme.surface}
                strokeWidth={1.5}
                pointerEvents="none"
              />
            )}
          </g>
          );
        })}

        {/* Junctions */}
        {layout.junctions.map((j, i) => (
          <circle key={`j-${i}`} cx={j.x} cy={j.y} r={3} fill={stroke} />
        ))}

        {/* Components */}
        {layout.components.map((pc, ci) => {
          const sym = getSymbol(pc.component.type, pc.component.displayValue ?? '', pc.horizontal, pc.stretchH, pc.stretchW, pc.flipped);
          const canProbeBranch = BRANCH_CURRENT_TYPES.has(pc.component.type);
          const probe = canProbeBranch ? branchProbe(pc.component.name) : undefined;
          const componentStroke = probe?.color ?? stroke;
          return (
            <g key={ci} transform={`translate(${pc.x},${pc.y})`}
              role={canProbeBranch ? 'button' : undefined}
              tabIndex={canProbeBranch ? 0 : undefined}
              aria-label={canProbeBranch ? `Probe current through ${pc.component.name}` : undefined}
              aria-pressed={canProbeBranch ? probe != null : undefined}
              data-probe-color={probe?.color}
              style={{ cursor: canProbeBranch && onBranchClick ? 'pointer' : undefined, color: componentStroke }}
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
              onClick={canProbeBranch ? () => onBranchClick?.(pc.component.name) : undefined}
              onKeyDown={canProbeBranch ? (event) => activateOnKey(event, () => onBranchClick?.(pc.component.name)) : undefined}
            >
              {/* Invisible hit area for hover/click */}
              <rect x={-4} y={-4} width={sym.width + 8} height={sym.height + 8}
                fill="transparent" stroke="none" />
              {sym.elements.map((el, i) => renderSvgElement(el, i, componentStroke))}
              {probe && (
                <circle cx={sym.width - 2} cy={2} r={5} fill={probe.color}
                  stroke={resolvedTheme.surface} strokeWidth={1.5} pointerEvents="none" />
              )}
            </g>
          );
        })}

        {/* Node hit targets cover single-pin nets that have no routed wire. */}
        {[...new Map(layout.components.flatMap(pc => pc.pins).map(pin => [pin.net, pin])).values()]
          .filter((pin) => !layout.wires.some((wire) => wire.net === pin.net))
          .map((pin) => {
          const probe = nodeProbe(pin.net);
          return (
            <circle key={`node-${pin.net}`}
              cx={pin.x} cy={pin.y} r={probe ? 5 : 7}
              fill={probe?.color ?? 'transparent'}
              stroke={probe?.color ?? 'transparent'}
              strokeWidth={2}
              role="button"
              tabIndex={0}
              aria-label={`Probe voltage at ${pin.net}`}
              aria-pressed={probe != null}
              data-probe-color={probe?.color}
              style={{ cursor: onNodeClick ? 'pointer' : undefined }}
              onClick={(event) => { event.stopPropagation(); onNodeClick?.(pin.net); }}
              onKeyDown={(event) => activateOnKey(event, () => onNodeClick?.(pin.net))}
            />
          );
        })}

        {/* Ground symbols — unified to a single horizontal rail.
            All `0`-net pins land on the same Y so the ground glyphs read as a
            common rail along the bottom of the schematic. Each pin draws a
            vertical stub down to that rail; pins already at the rail draw no
            stub. Side pins (left/right edge of their host symbol) force the
            rail down by `stubLen` to give breathing room from the body. */}
        {(() => {
          const stubLen = GRID * 1.5;
          const gnd = groundSymbol();
          const gndPins = layout.components.flatMap((pc, ci) =>
            pc.pins.flatMap((p, pi) => {
              if (p.net !== '0') return [];
              const compSym = getSymbol(pc.component.type, pc.component.displayValue ?? '', pc.horizontal, pc.stretchH, pc.stretchW, pc.flipped);
              const symPin = pi < compSym.pins.length ? compSym.pins[pi] : null;
              const isSidePin = symPin !== null && (symPin.dx <= 1 || symPin.dx >= compSym.width - 1);
              return [{ ci, pi, p, isSidePin }];
            })
          );
          if (gndPins.length === 0) return null;
          const gndY = Math.max(...gndPins.map(g => g.isSidePin ? g.p.y + stubLen : g.p.y));
          return gndPins.map(({ ci, pi, p }) => {
            const stub = gndY - p.y;
            return (
              <g key={`gnd-${ci}-${pi}`}>
                {stub > 0.5 && (
                  <line x1={p.x} y1={p.y} x2={p.x} y2={gndY}
                    stroke={stroke} strokeWidth={STROKE_W} strokeLinecap="round" />
                )}
                <g transform={`translate(${p.x - gnd.width / 2},${gndY})`}>
                  {gnd.elements.map((el, i) => renderSvgElement(el, i, stroke))}
                </g>
              </g>
            );
          });
        })()}
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
