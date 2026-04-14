/** A component extracted from a netlist for schematic rendering. */
export interface SchematicComponent {
  /** Device type letter: 'R', 'C', 'L', 'V', 'I', 'D', 'Q', 'M', 'E', 'G', 'F', 'H' */
  type: string;
  /** Device instance name, e.g. 'R1', 'M1' */
  name: string;
  /** Net names this component connects to, in netlist order */
  nodes: string[];
  /** Human-readable value string for display, e.g. '1k', '100n', 'DC 5' */
  displayValue: string;
}

/** Abstract circuit graph for schematic rendering. */
export interface SchematicGraph {
  components: SchematicComponent[];
  /** All unique net names (excluding ground '0') */
  nets: string[];
}

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
  component: SchematicComponent;
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
