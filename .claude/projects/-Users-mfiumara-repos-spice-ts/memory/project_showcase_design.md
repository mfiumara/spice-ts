---
name: Showcase design direction
description: Layout and aesthetic decisions for the spice-ts showcase/product UI
type: project
---

Chosen layout: Original industrial oscilloscope (layout-prototype.html) — phosphor green on deep charcoal, icon rail + sidebar + stacked waveform panels, JetBrains Mono + DM Sans, grid texture background.

**Why:** Feels like real lab equipment (Keysight/Tektronix), professional yet distinctive. User evaluated 5 variants and consistently preferred this direction.

**How to apply:** All showcase UI work should follow this aesthetic. CSS variables are defined in layout-prototype.html.

Easter egg: Vault-Tec CRT terminal theme (layout-prototype-1b.html) should be hidden somewhere in the tool as a fun toggle. Monochrome green, scanlines, VT323 font, bracket icons, terminal language.

Prototype files in `examples/showcase/layout-prototype*.html` — these are static HTML mockups, not yet wired to the real React components.
