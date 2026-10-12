---
"@spice-ts/core": patch
---

Faster transient step control on decks with many linear capacitors or inductors: the CAPtrunc/INDtrunc truncation check now evaluates all charges into one reused buffer and bounds them in a single loop, with no per-charge closure, dispatch or array allocation. Truncation bounds and waveforms are bit-identical (#702).
