import { execFileSync, spawnSync } from 'node:child_process';
import { basename } from 'node:path';

// Compare additions, not all tracked files: historical benchmark receipts may
// still be required by offline hash checks. Disable rename detection so a rename
// from an ordinary file into a prohibited filename cannot bypass the guard.
try {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--base')) {
    throw new Error('Usage: node scripts/check-agent-artifacts.mjs [--base <commit>]');
  }
  let base = args[1];
  if (!base) {
    const result = spawnSync('git', ['merge-base', 'HEAD', 'origin/main'], { encoding: 'utf8' });
    base = result.status === 0 ? result.stdout.trim() : 'HEAD';
  }
  const commit = execFileSync('git', ['rev-parse', '--verify', `${base}^{commit}`], { encoding: 'utf8' }).trim();
  const files = execFileSync('git', [
    'diff', '--cached', '--no-renames', '--diff-filter=A', '--name-only', '-z', commit, '--',
  ], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const forbidden = files.filter((file) => file.endsWith('.log') || /POTETO.*\.md$/.test(basename(file)));
  if (forbidden.length) {
    console.error('New tracked agent artifacts are prohibited:\n' + forbidden.map((file) => `  ${file}`).join('\n'));
    console.error('Put evidence in the PR body or a single README receipt, never raw logs.');
    process.exitCode = 1;
  } else {
    console.log('Agent artifact check passed (no new tracked *.log or *POTETO*.md files).');
  }
} catch (error) {
  console.error(`Agent artifact check failed: ${error.message}`);
  process.exitCode = 1;
}
