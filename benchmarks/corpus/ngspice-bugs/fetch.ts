/**
 * Downloads the ticket attachments of the known-ngspice-bugs corpus (#803) from the public ngspice
 * SourceForge bug tracker into `benchmarks/corpus/ngspice-bugs/fetched/<N>/` (git-ignored) and verifies
 * every file against the SHA-256 recorded in `manifest.json`. Read-only: plain HTTP GETs, no login.
 *
 *   pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts            # every ticket with a runnable deck
 *   pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 745 761    # selected tickets
 *
 * Archives (.zip/.7z/.tar.gz) are stored as downloaded; extract them yourself. Decks that reference
 * absolute Windows include paths (D:/spice_lib/...) need those paths pointed at the extracted files,
 * which is the only edit the triage made to them (see each ticket README).
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { HERE, hasReadme, loadManifest } from './render.js';

async function main(): Promise<void> {
  const manifest = await loadManifest();
  const wanted = new Set(process.argv.slice(2).map(Number));
  const tickets = manifest.tickets.filter(entry => (wanted.size > 0 ? wanted.has(entry.ticket) : hasReadme(entry)));
  let failures = 0;
  for (const entry of tickets) {
    const directory = resolve(HERE, 'fetched', String(entry.ticket));
    await mkdir(directory, { recursive: true });
    for (const attachment of entry.attachments) {
      const response = await fetch(attachment.url);
      if (!response.ok) {
        console.error(`#${entry.ticket} ${attachment.name}: HTTP ${response.status}`);
        failures += 1;
        continue;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      const digest = createHash('sha256').update(bytes).digest('hex');
      if (digest !== attachment.sha256) {
        console.error(`#${entry.ticket} ${attachment.name}: sha256 ${digest} != manifest ${attachment.sha256} (attachment changed upstream)`);
        failures += 1;
      }
      await writeFile(resolve(directory, attachment.name), bytes);
      console.log(`#${entry.ticket} ${attachment.name} ${bytes.length} B`);
      await new Promise(done => setTimeout(done, 300));
    }
  }
  if (failures > 0) process.exit(1);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
