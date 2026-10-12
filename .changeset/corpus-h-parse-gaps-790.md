---
"@spice-ts/core": patch
---

Accept five ngspice-47 card forms that corpus-h decks use (#790): a bare `.probe` (read as `.probe alli`), `.options` names ngspice-47 does not recognise (ignored with a parse warning; known-but-unimplemented names stay rejected), `.options interp` (output-only, warned), `.options tnom=27`, `.four`/`.fourier` cards (accepted with a warning; the Fourier table is not computed), non-ASCII unit text after a number (`27°C`), `(n+ n-)` node pairs on E/G/F/H cards, and bare `.ic`/`.nodeset` cards.
