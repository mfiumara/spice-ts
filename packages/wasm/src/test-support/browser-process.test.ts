import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { spawnProcessTree, terminateProcessTree } from './browser-process.js';

// A stand-in for Chrome: the leader starts a helper (like Chrome's renderer or
// crashpad handler) that keeps writing into the profile directory, records the
// helper pid, and idles until it is signalled.
const HELPER = `
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
let index = 0;
setInterval(() => { writeFileSync(join(process.argv[1], 'entry-' + index++), 'x'); }, 5);
`;
const LEADER = `
const { spawn } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const helper = spawn(process.execPath, ['-e', ${JSON.stringify(HELPER)}, process.argv[1]], { stdio: 'ignore' });
writeFileSync(join(process.argv[1], 'helper.pid'), String(helper.pid));
setInterval(() => {}, 1_000);
`;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(condition: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 400; attempt++) {
    if (await condition()) return;
    await new Promise(resolveDelay => setTimeout(resolveDelay, 25));
  }
  throw new Error('condition never became true');
}

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
});

describe('browser smoke process teardown', () => {
  it('stops helper processes so the profile directory can be removed', async () => {
    const profile = await mkdtemp(join(process.env.TMPDIR ?? tmpdir(), 'spice-ts-process-tree-'));
    const leader = spawnProcessTree(process.execPath, ['-e', LEADER, profile]);
    let helperPid = 0;
    cleanup.push(async () => {
      if (helperPid && isAlive(helperPid)) process.kill(helperPid, 'SIGKILL');
      if (leader.exitCode === null && leader.signalCode === null) leader.kill('SIGKILL');
      await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    });
    await waitFor(async () => {
      const names = await readdir(profile);
      return names.includes('helper.pid') && names.some(name => name.startsWith('entry-'));
    });
    helperPid = Number(await readFile(join(profile, 'helper.pid'), 'utf8'));

    await terminateProcessTree(leader);

    expect(leader.exitCode !== null || leader.signalCode !== null).toBe(true);
    expect(isAlive(helperPid)).toBe(false);
    // Nothing writes into the profile any more, so a plain removal succeeds.
    await rm(profile, { recursive: true });
  }, 30_000);
});
