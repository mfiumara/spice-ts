// Project-authored MIT fixtures. Unmodified bytes used by both engines.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { m2Netlist, M2_CIRCUITS } from '../../scaling-m2-fixture.mjs';
const directory = new URL('./decks/', import.meta.url);
mkdirSync(directory, { recursive: true });
const manifest = [];
for (const size of [1000, 10000, 50000]) {
  for (const circuit of M2_CIRCUITS) {
    const { netlist, actualNodes, probe } = m2Netlist(circuit, size);
    const file = `decks/${circuit}-${size}.cir`;
    writeFileSync(new URL(file, import.meta.url), netlist);
    manifest.push({ circuit, size, actualNodes, probe, file, deckSha256: createHash('sha256').update(netlist).digest('hex') });
  }
}
writeFileSync(new URL('./decks.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n');
