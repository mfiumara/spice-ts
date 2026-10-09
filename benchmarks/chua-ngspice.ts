#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const fixturePath = resolve('benchmarks/circuits/chua-issue-48.cir');
const workdir = mkdtempSync(join(tmpdir(), 'spicets-chua-'));
const netlistPath = join(workdir, 'chua-ngspice.cir');
const dataPath = join(workdir, 'chua.dat');

try {
  const fixture = readFileSync(fixturePath, 'utf8');
  const portableTran = fixture.replace(
    '.tran 0 200 0 0.2 uic',
    '.tran 0.2 200 0 0.2 uic',
  );
  if (portableTran === fixture) {
    throw new Error('Expected LTspice .tran directive was not found in the Chua fixture');
  }

  const runnable = portableTran.replace(/\.end\s*$/i, '').concat(`
.control
set filetype=ascii
run
wrdata ${dataPath} time v(x) v(y) v(out) i(L8)
quit
.endc
.end
`);
  writeFileSync(netlistPath, runnable);

  execFileSync('ngspice', ['-b', netlistPath], {
    encoding: 'utf8',
    timeout: 120_000,
  });
  const rows = readFileSync(dataPath, 'utf8')
    .trim()
    .split('\n')
    .map(line => line.trim().split(/\s+/).map(Number))
    .map(values => ({
      time: values[0],
      x: values[3],
      y: values[5],
      out: values[7],
      iL8: values[9],
    }));

  const after20 = rows.filter(row => row.time >= 20);
  const yMean = after20.reduce((sum, row) => sum + row.y, 0) / after20.length;
  let yMeanCrossings = 0;
  for (let index = 1; index < after20.length; index++) {
    if ((after20[index - 1].y - yMean) * (after20[index].y - yMean) < 0) {
      yMeanCrossings++;
    }
  }

  const versionOutput = execFileSync('ngspice', ['--version'], { encoding: 'utf8' });
  const version = versionOutput.match(/ngspice-(\d+)/)?.[0] ?? 'ngspice (version not parsed)';
  console.log(JSON.stringify({
    simulator: version,
    fixture: fixturePath,
    adaptation: 'Changed only .tran tstep from LTspice 0 to ngspice-compatible 0.2',
    acceptedPoints: rows.length,
    stopTime: rows.at(-1)?.time,
    after20: {
      yMin: Math.min(...after20.map(row => row.y)),
      yMax: Math.max(...after20.map(row => row.y)),
      yMean,
      yMeanCrossings,
    },
  }, null, 2));
} finally {
  rmSync(workdir, { recursive: true, force: true });
}
