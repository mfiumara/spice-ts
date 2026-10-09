# @spice-ts/circuit-json

Bidirectional conversion between tscircuit `circuit-json` documents and the spice-ts `CircuitIR`.

```ts
import { fromCircuitJSON, toCircuitJSON } from '@spice-ts/circuit-json';
```

`fromCircuitJSON` supports simple resistors, capacitors, enhancement-mode MOSFETs, BJTs, source ports, source nets, and source traces. PCB, schematic, and CAD elements produce nonfatal `LAYOUT_ONLY` diagnostics. Unsupported simulation elements or parameters produce error diagnostics and no circuit value.

`toCircuitJSON` refuses any lossy conversion by default. Pass `{ allowLossy: true }` to receive the representable subset; the result remains marked `lossy` and retains the same ordered `LOSSY_EXPORT` diagnostics.

Diagnostics are deterministic and sorted by `path`, then `code`, then `elementId`.
