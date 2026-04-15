import type { IRComponent } from '@spice-ts/core';

/** Pin location on a placed component. */
export interface Pin {
  /** Net name this pin connects to */
  net: string;
  /** Absolute x position */
  x: number;
  /** Absolute y position */
  y: number;
}

/** A component with computed position in the schematic. */
export interface PlacedComponent {
  component: IRComponent;
  /** Top-left x on the grid */
  x: number;
  /** Top-left y on the grid */
  y: number;
  /** Rotation in degrees: 0, 90, 180, 270 */
  rotation: number;
  /** Pin positions after placement + rotation */
  pins: Pin[];
}

/** A wire segment connecting two points. */
export interface WireSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** A wire connecting pins on the same net. */
export interface Wire {
  net: string;
  segments: WireSegment[];
}

/** A junction where 3+ wires meet. */
export interface Junction {
  x: number;
  y: number;
}

/** Fully positioned schematic ready for SVG rendering. */
export interface SchematicLayout {
  components: PlacedComponent[];
  wires: Wire[];
  junctions: Junction[];
  bounds: { width: number; height: number };
}
