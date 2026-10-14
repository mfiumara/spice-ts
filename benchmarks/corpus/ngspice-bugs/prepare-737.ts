/** Materialize the original #737 derived deck from its hash-verified fetch-only archive.
 * Run after fetch.ts 737, before refresh.ts or oracle-737.ts. No new pins.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HERE, loadManifest } from './render.js';

type PreparationPins = { archiveSha256: string; deckSha256: string; deckName: string };
const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

export async function prepare737(directory: string, pins: PreparationPins): Promise<void> {
  const archive = resolve(directory, 'Test.zip');
  if (hash(await readFile(archive)) !== pins.archiveSha256) throw new Error('archive pin mismatch');
  execFileSync('tar', ['-xf', archive, '-C', directory], { stdio: 'ignore' });
  const original = (await readFile(resolve(directory, 'OPA890Test.cir'), 'utf8'))
    .replace(/\r\n/g, '\n')
    .replace(/(\.include\s+)"[A-Za-z]:\/([^"]+)"/gi, '$1$2');
  if (hash(original) !== pins.deckSha256) throw new Error('original deck pin mismatch');
  await writeFile(resolve(directory, pins.deckName), original);
}

async function main(): Promise<void> {
  const entry = (await loadManifest()).tickets.find(item => item.ticket === 737)!;
  const archive = entry.attachments.find(item => item.name === 'Test.zip')!;
  const deck = entry.uncommittedDecks[0];
  await prepare737(resolve(HERE, 'fetched/737'), { archiveSha256: archive.sha256, deckSha256: deck.sha256, deckName: deck.name });
  console.log(JSON.stringify({ ticket: 737, deck: deck.name, sha256: deck.sha256, bytes: deck.bytes }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('737 preparation failed; check archive/deck pins and extraction'); process.exitCode = 1; });
}
