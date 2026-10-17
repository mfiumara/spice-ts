// Run: spice-heavy pnpm exec tsx benchmarks/vbic-op/reference.ts
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readNgspiceRawFile } from '../corpus/corpus-f/raw-stream.js';

async function main(): Promise<void> {
  const original = readFileSync('benchmarks/corpus/corpus-f/fixtures/examples/vbic/DFF_Y_ECL.sp', 'utf8');
  const deck = original.slice(0, original.indexOf('.SAVE')) + '.op\n.end\n';
  if (!execFileSync('ngspice', ['--version'], { encoding: 'utf8' }).includes('ngspice-47')) {
    throw new Error('Reference requires ngspice-47');
  }
  const scratch = mkdtempSync(join(tmpdir(), 'vbic-op-'));
  try {
    const path = join(scratch, 'probe.cir');
    const raw = join(scratch, 'probe.raw');
    writeFileSync(path, deck);
    execFileSync('ngspice', ['-n', '-b', '-r', raw, path], {
      env: { ...process.env, SPICE_ASCIIRAWFILE: '1', DISPLAY: '' }, stdio: 'pipe', timeout: 30000,
    });
    const op = (await readNgspiceRawFile(raw)).find(p => p.plotName.toLowerCase().includes('operating point'));
    if (!op) throw new Error('Missing operating point');
    writeFileSync('benchmarks/vbic-op/ngspice-47.json', JSON.stringify({
      version: 'ngspice-47', deck, sha256: createHash('sha256').update(deck).digest('hex'), signals: op.signals,
    }) + '\n');
    console.info(JSON.stringify({ q: op.signals['v(q)'] }));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
