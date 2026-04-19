import type { CircuitIR, IRComponent } from '@spice-ts/core';

export type { CircuitIR, IRComponent };
export type { IRPort, ComponentType } from '@spice-ts/core';

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
  /** True when the component uses its horizontal-orientation symbol variant
   * (e.g. a capacitor between two nets on the same rail). */
  horizontal?: boolean;
  /** Total height (in pixels) requested for a stretchable vertical symbol so
   * its pins sit flush on the top and bottom rank rails. */
  stretchH?: number;
  /** Total width requested for a stretchable horizontal symbol (e.g. a
   * feedback capacitor spanning the chain width). */
  stretchW?: number;
  /** True when the symbol must be flipped along its primary axis so its
   * directional graphics (e.g. a diode triangle) stay consistent with the
   * net polarity after a rank-driven pin swap. */
  flipped?: boolean;
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
