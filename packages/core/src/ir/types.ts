/** SPICE device type letter. */
export type ComponentType = 'R' | 'C' | 'L' | 'V' | 'I' | 'D' | 'Q' | 'M' | 'E' | 'G' | 'H' | 'F' | 'X';

/** A named connection point on a component. */
export interface IRPort {
  /** Port role name: 'p', 'n', 'gate', 'drain', 'source', 'collector', 'base', 'emitter', etc. */
  name: string;
  /** Net/node name this port connects to: '1', 'out', 'vcc', '0' (ground) */
  net: string;
}

/** A circuit component with typed parameters. */
export interface IRComponent {
  /** SPICE device type letter */
  type: ComponentType;
  /** Unique identifier, e.g. 'R1', 'M2' */
  id: string;
  /** Display name */
  name: string;
  /** Named connection points */
  ports: IRPort[];
  /** Device parameters (resistance, capacitance, modelName, channelType, gain, etc.) */
  params: Record<string, number | string | boolean>;
  /** Human-readable value for display: "10k", "NMOS W=10u L=1u" */
  displayValue?: string;
}

/** A flat circuit representation — components and their net connectivity. */
export interface CircuitIR {
  /** All components in the circuit */
  components: IRComponent[];
  /** Unique net names (excluding ground '0') */
  nets: string[];
}
