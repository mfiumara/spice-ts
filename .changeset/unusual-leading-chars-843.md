---
"@spice-ts/core": patch
---

Cards whose first non-blank character is one of `= [ ] ? ( ) & % $ " ! : ,` or a form feed (for example MicroCap `:Label` lines in vendor libraries) are now turned into comments, with their `+` continuations, and reported once per deck as a parse warning carrying ngspice-47's "Unusual leading characters" text; `#` lines are silent comments. Previously spice-ts rejected the deck (#843).
