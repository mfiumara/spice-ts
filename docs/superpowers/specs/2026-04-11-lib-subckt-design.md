# `.lib` File Loading & `.subckt` Subcircuit Support

**Date:** 2026-04-11
**Status:** Draft

## Summary

Add support for SPICE library files (`.lib`) and subcircuit definitions (`.subckt`) to `@spice-ts/core`. This enables loading vendor device models, process corner selection, hierarchical circuit design, and full ecosystem compatibility with ngspice/LTspice netlists.

The approach uses a **two-phase parsing pipeline**: an async preprocessor handles text-level transforms (`.include`, `.lib`/`.endl`, `.param`), producing a flattened netlist that the existing parser extends to handle `.subckt` definitions and `X` device instantiation.

## Goals

- **User convenience:** load vendor model libraries instead of manually typing `.model` cards
- **Accuracy/fidelity:** enable realistic simulations with real-world device parameters (process-specific BSIM params, vendor-characterized models)
- **Ecosystem compatibility:** accept netlists that reference external `.lib` files, matching ngspice/LTspice conventions
- **Platform-agnostic:** core never does I/O — consumers provide an async resolver callback for file content

## Non-Goals

- File I/O helpers (Node `fs` wrappers, browser fetch utilities) — consumer responsibility
- Full SPICE-P language compliance (`.func`, `.global`, conditional `.if`/`.else`)
- Encrypted/obfuscated model files

---

## Architecture

### Two-Phase Pipeline

```
Raw input (netlist + .lib content)
        │
        ▼
┌─────────────────────┐
│   Preprocessor      │  Phase 1: text-level transforms
│                     │
│  .include → resolve │  (async, calls user-provided resolver)
│  .lib/.endl → select│  (section guard filtering)
│  .param → substitute│  (expression evaluation + substitution)
└────────┬────────────┘
         │
         ▼
   Flattened netlist string
   (only: .model, .subckt/.ends, device lines, analysis commands)
         │
         ▼
┌─────────────────────┐
│   Parser (existing) │  Phase 2: circuit building
│                     │
│  + .subckt/.ends    │  (new: collect SubcktDefinition)
│  + X device lines   │  (new: subcircuit instantiation)
└────────┬────────────┘
         │
         ▼
   Circuit (with subcircuit definitions)
         │
         ▼
┌─────────────────────┐
│   compile()         │  Phase 3: flatten subcircuits into devices
│                     │
│  X instances →      │  (expand to internal nodes + devices)
│  DeviceModel[]      │
└─────────────────────┘
```

The preprocessor lives in `src/parser/preprocessor.ts`. It is a pure async function: string in, string out. Independently testable, no coupling to the parser's internals.

---

## `.param` Expression Evaluation

### Syntax

```spice
.param vdd = 1.8
.param rload = 10k
.param gm = {2 * ids / vov}
.param width = {lmin * 10}
```

### Expression Evaluator

A minimal recursive-descent math expression parser implemented in `src/parser/expression.ts`.

**Supported operators:** `+`, `-`, `*`, `/`, `**`, unary `-`
**Supported functions:** `sqrt`, `abs`, `log`, `ln`, `exp`, `min`, `max`, `pow`
**Parentheses:** full nesting
**Number literals:** integer, float, scientific notation (`1e-6`), SI suffixes (`10k`, `1u`)

The evaluator takes an expression string and a variable map (`Record<string, number>`), returns a number.

### Scoping

- **Top-level `.param`:** evaluated by the preprocessor. The flattened output contains only literal numbers.
- **`.param` inside `.subckt`:** NOT evaluated by the preprocessor. These survive into the parser and are stored as part of `SubcktDefinition`. They are evaluated during `compile()` when `X` devices are expanded and actual parameter values are known.

### Substitution

The preprocessor scans token values for `{expr}` delimiters and replaces them with the evaluated numeric result. Bare parameter references (without braces) in value positions are also substituted.

---

## `.lib` / `.endl` Section Selection

### File Format

```spice
* vendor_models.lib

.lib TT
.model nch nmos(VTO=0.5 KP=120u LAMBDA=0.04)
.model pch pmos(VTO=-0.5 KP=60u LAMBDA=0.05)
.endl TT

.lib FF
.model nch nmos(VTO=0.4 KP=140u LAMBDA=0.04)
.model pch pmos(VTO=-0.4 KP=70u LAMBDA=0.05)
.endl FF

.lib SS
.model nch nmos(VTO=0.6 KP=100u LAMBDA=0.04)
.model pch pmos(VTO=-0.6 KP=50u LAMBDA=0.05)
.endl SS
```

### Usage

```spice
.lib 'vendor_models.lib' TT
```

This is a combined `.include` + section selection: resolve the file via the async resolver, then extract only the lines between `.lib TT` and `.endl TT`.

### Preprocessor Behavior

1. `.lib <filename> <section>` — resolve the file, extract only the named section
2. `.lib <section>` (no filename, inside an already-loaded file) — marks the start of a named section; kept or discarded based on which section was requested
3. Content **outside** any `.lib`/`.endl` block is always included (unconditional content — common for shared subcircuits or params)
4. Sections can contain `.include` directives, resolved recursively

### Cycle Detection

The preprocessor tracks a visited set of `(filename, section)` pairs and throws a `ParseError` on cycles.

---

## `.include` Resolution

### Syntax

```spice
.include 'models/standard.lib'
.include "passives.lib"
.include custom_diodes.lib
```

### Preprocessor Behavior

1. Encounters `.include <path>` — calls the user-provided async resolver with the path string (stripped of quotes)
2. The resolver returns the file content as a string
3. The preprocessor recursively processes the included content (included files can themselves contain `.include`, `.lib`, `.param`, etc.)
4. The result replaces the `.include` line in the flattened output
5. Same cycle detection as `.lib` — tracks visited filenames, throws on cycles
6. Recursion depth limit: 64 levels, throws `ParseError` if exceeded

### Resolver Signature

```typescript
type IncludeResolver = (path: string) => Promise<string>;
```

The consumer decides how to map the path to content — `fetch()`, `fs.readFile()`, in-memory map, IndexedDB lookup, etc.

---

## Subcircuit Definition & Instantiation

### Definition Syntax

```spice
.subckt inv in out vdd vss W=1u L=100n
M1 out in vdd vdd PMOD W={W*2} L={L}
M2 out in vss vss NMOD W={W} L={L}
.ends inv
```

Interface pins (`in`, `out`, `vdd`, `vss`) are the subcircuit's ports. `W` and `L` are parameters with defaults. Everything inside is internal — device lines, `.model` cards, nested `.subckt`, `.param`.

### Instantiation Syntax

```spice
X1 a b vdd gnd inv W=2u
X2 c d vdd gnd inv L=200n
```

`X` prefix, then port connections in order, then subcircuit name, then optional parameter overrides.

### Phase Responsibilities

| Concern | Where |
|---------|-------|
| Collecting `.subckt`/`.ends` blocks | Parser (Phase 2) |
| Storing `SubcktDefinition` objects | `Circuit` class (alongside `_models`) |
| Parsing `X` device lines | Parser (Phase 2) |
| Expanding `X` into real devices | `compile()` (Phase 3) |

### SubcktDefinition Type

```typescript
interface SubcktDefinition {
  name: string;
  ports: string[];                    // interface pin names
  params: Record<string, number>;     // default parameter values
  body: string[];                     // raw lines inside the block (unparsed)
}
```

The body is stored as raw lines rather than pre-parsed, because parameter substitution (`{W*2}`) cannot happen until instantiation when actual values are known.

### Expansion During `compile()`

When the compiler encounters an `X` descriptor:

1. **Look up** the `SubcktDefinition` by name
2. **Merge params:** `{ ...subcktDefaults, ...instanceOverrides }`
3. **Evaluate** `.param` expressions within the body using merged params
4. **Create node namespace:** internal nodes get prefixed (e.g., node `mid` in `X1` becomes `X1.mid`). Port nodes map to the actual connected nodes. Ground (`0`) is never prefixed.
5. **Parse** the substituted body lines into device descriptors
6. **Recursively expand** any nested `X` instances (subcircuits can instantiate other subcircuits)
7. **Add** the resulting devices to the flat device list

### Node Namespace Example

```spice
.subckt buf in out vdd vss
X1 in mid vdd vss inv
X2 mid out vdd vss inv
.ends

X3 a b vdd gnd buf
```

Expansion of `X3`:
- Port mapping: `in→a`, `out→b`, `vdd→vdd`, `vss→gnd`
- Internal node: `mid` → `X3.mid`
- Nested `X3.X1`: ports map through (`in→a`, `mid→X3.mid`, `vdd→vdd`, `vss→gnd`)
- Nested `X3.X2`: ports map through (`mid→X3.mid`, `out→b`, `vdd→vdd`, `vss→gnd`)

### Model Scoping

`.model` cards inside a `.subckt` are local to that subcircuit. During expansion, device model lookup checks subcircuit-local models first, then falls back to global models.

### Recursion Depth Limit

64 levels for nested subcircuit expansion.

---

## API Changes

### New Types (`types.ts`)

```typescript
/** Async resolver for .include and .lib file references */
type IncludeResolver = (path: string) => Promise<string>;

/** Subcircuit definition parsed from .subckt/.ends block */
interface SubcktDefinition {
  name: string;
  ports: string[];
  params: Record<string, number>;
  body: string[];
}
```

### SimulationOptions Extension

```typescript
interface SimulationOptions {
  // ... existing fields ...

  /** Resolver for .include and .lib file directives */
  resolveInclude?: IncludeResolver;
}
```

### New Functions

```typescript
/** Preprocess a netlist: resolve includes, select lib sections, evaluate top-level params */
export async function preprocess(
  netlist: string,
  resolver?: IncludeResolver,
): Promise<string>;

/** Async parse — runs preprocessor, then parser */
export async function parseAsync(
  netlist: string,
  resolver?: IncludeResolver,
): Promise<Circuit>;
```

The existing sync `parse()` remains unchanged for netlists with no `.include`/`.lib` directives. It gains support for `.subckt`/`.ends` and `X` device lines (these don't require async). If `parse()` encounters `.include` or `.lib <file>` directives, it throws a `ParseError` directing the user to use `parseAsync()` with a resolver.

`simulate()` is already async. When `resolveInclude` is provided in options, it calls `parseAsync()` internally. If the netlist contains `.include`/`.lib` directives and no `resolveInclude` is provided, `simulate()` throws a `ParseError` with a clear message.

### Circuit Class Extensions

```typescript
class Circuit {
  // ... existing methods ...

  /** Register a subcircuit definition */
  addSubcircuit(def: SubcktDefinition): void;

  /** Instantiate a subcircuit */
  addSubcircuitInstance(
    name: string,
    ports: string[],
    subcktName: string,
    params?: Record<string, number>,
  ): void;
}
```

### Usage Examples

```typescript
// Sync — no libraries, works as before
const result = await simulate(`
  V1 in 0 DC 5
  R1 in out 1k
  R2 out 0 2k
  .op
`);

// With library resolution
const result = await simulate(netlist, {
  resolveInclude: async (path) => {
    const resp = await fetch(`/libs/${path}`);
    return resp.text();
  },
});

// Standalone preprocessing (debugging)
const flat = await preprocess(rawNetlist, resolver);
console.log(flat); // inspect flattened output

// Programmatic subcircuit
const circuit = new Circuit();
circuit.addSubcircuit({
  name: 'inv',
  ports: ['in', 'out', 'vdd', 'vss'],
  params: { W: 1e-6, L: 100e-9 },
  body: [
    'M1 out in vdd vdd PMOD W={W*2} L={L}',
    'M2 out in vss vss NMOD W={W} L={L}',
  ],
});
circuit.addSubcircuitInstance('X1', ['a', 'b', 'vdd', 'gnd'], 'inv', { W: 2e-6 });
```

---

## File Organization

All changes within `packages/core/src/`:

```
parser/
  index.ts              (existing — add parseAsync, .subckt/.ends, X device parsing)
  tokenizer.ts          (existing — no changes)
  model-parser.ts       (existing — no changes)
  preprocessor.ts       (new — .include, .lib/.endl, top-level .param)
  expression.ts         (new — math expression evaluator for {expr})

circuit.ts              (existing — add SubcktDefinition storage, X descriptors,
                         subcircuit expansion in compile())

types.ts                (existing — add SubcktDefinition, IncludeResolver)
index.ts                (existing — export new public types + preprocess + parseAsync)
```

Two new files, four files extended. No new directories — preprocessor and expression evaluator are parser concerns, so they live in `parser/`.

---

## Testing Strategy

### Expression Evaluator (`expression.ts`)

- Arithmetic: `1+2`, `3*4/2`, operator precedence, parentheses
- Functions: `sqrt(4)`, `abs(-1)`, `log(1)`, `exp(0)`
- Variables: `{W*2}` with a variable map, undefined variable errors
- Edge cases: nested parens, negative numbers, scientific notation (`1e-6`), SI suffixes

### Preprocessor (`preprocessor.ts`)

- `.param` substitution at top level
- `.include` resolution with a mock resolver
- `.lib`/`.endl` section selection — correct section extracted, unconditional content included
- `.lib <file> <section>` combined fetch + filter
- Recursive includes (A includes B includes C)
- Cycle detection — throws on circular `.include` or `.lib`
- Depth limit — throws at 64 levels
- Passthrough — netlist with no directives comes out unchanged

### Parser Extensions (`.subckt`, `X` devices)

- `.subckt`/`.ends` collected into `SubcktDefinition`
- `X` device lines parsed into descriptors with ports + params
- Nested `.subckt` definitions
- `.model` inside `.subckt` bodies

### Subcircuit Expansion in `compile()`

- Simple expansion — internal nodes get prefixed
- Port mapping — interface pins connect to external nodes
- Parameter override — instance params override subckt defaults
- Nested subcircuit expansion (subckt instantiating another subckt)
- Model scoping — local `.model` preferred over global
- Ground node handling — `0` never gets prefixed
- Error cases: undefined subcircuit name, wrong port count

### End-to-End Integration

- Inverter subcircuit with MOSFET models → DC operating point
- Buffer (nested subcircuits) → transient simulation
- `.lib` file with corners → correct model selected
- Full flow: `.include` → `.lib` section → `.subckt` → expansion → simulation matches expected values
