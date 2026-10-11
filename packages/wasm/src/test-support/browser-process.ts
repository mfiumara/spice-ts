// Test support for the headless-browser smoke: start Chrome and tear it down
// before its temporary profile directory is removed.
//
// Chrome is a process tree (renderers, GPU/utility helpers, crashpad). Killing
// only the main pid leaves helpers writing into the profile, so a recursive
// removal races them and fails with ENOTEMPTY. The tree therefore runs in its
// own process group, and teardown signals the whole group and waits until no
// member is left.
import { spawn, type ChildProcess } from 'node:child_process';

const GROUP_SIGNALS = process.platform !== 'win32';
const POLL_MS = 25;

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));
}

export function spawnProcessTree(command: string, args: readonly string[]): ChildProcess {
  return spawn(command, args, { stdio: 'ignore', detached: GROUP_SIGNALS });
}

function signalTree(child: ChildProcess, signal: NodeJS.Signals): void {
  try {
    if (GROUP_SIGNALS && child.pid !== undefined) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ESRCH' && code !== 'EPERM') throw error;
  }
}

function treeAlive(child: ChildProcess): boolean {
  // Node reaps the leader and records its exit; until then it may still run.
  if (child.exitCode === null && child.signalCode === null) return true;
  if (!GROUP_SIGNALS || child.pid === undefined) return false;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    // ESRCH: no member left. EPERM: Darwin reports it for a group whose only
    // members are zombies awaiting reaping; they no longer run or write files.
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH' || code === 'EPERM') return false;
    throw error;
  }
}

async function waitForTreeExit(child: ChildProcess, milliseconds: number): Promise<boolean> {
  for (let waited = 0; waited < milliseconds; waited += POLL_MS) {
    if (!treeAlive(child)) return true;
    await delay(POLL_MS);
  }
  return !treeAlive(child);
}

/** Terminates every process in the tree, escalating to SIGKILL, and resolves only once all are gone. */
export async function terminateProcessTree(child: ChildProcess, graceMs = 2_000): Promise<void> {
  if (child.pid === undefined) return;
  signalTree(child, 'SIGTERM');
  if (await waitForTreeExit(child, graceMs)) return;
  signalTree(child, 'SIGKILL');
  if (await waitForTreeExit(child, 10_000)) return;
  throw new Error(`process tree ${child.pid} survived SIGKILL`);
}
