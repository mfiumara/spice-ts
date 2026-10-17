---
"@spice-ts/core": patch
---

Replace superseded XSPICE oscillator breakpoint predictions instead of retaining them as permanent events. Ramp-controlled triangle and square transients no longer accumulate stale corners until timestep progress stalls.
