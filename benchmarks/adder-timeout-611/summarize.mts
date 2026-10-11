/**
 * Issue #611 / #604: fold the per-run outputs of run.sh into results.json.
 * Usage: pnpm exec tsx benchmarks/adder-timeout-611/summarize.mts <OUT dir> > benchmarks/adder-timeout-611/results.json
 * Machine/host-load/tree facts come from environment variables set by the operator
 * (see README); nothing is inferred.
 */
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const out = process.argv[2];
if (!out) {
  console.error('usage: summarize.mts <OUT dir>');
  process.exit(2);
}
const json = async (name: string) => JSON.parse(await readFile(resolve(out, name), 'utf8'));

async function ngspice(deck: string) {
  const log = await readFile(resolve(out, `${deck}.ngspice.log`), 'utf8');
  const value = (key: string): number => {
    const match = log.match(new RegExp(`${key}\\s*=\\s*([\\d.eE+-]+)`));
    if (!match) throw new Error(`${deck}: no "${key}" in ngspice acct output`);
    return Number(match[1]);
  };
  return {
    acceptedTimepoints: value('Accepted timepoints'),
    rejectedTimepoints: value('Rejected timepoints'),
    transientIterations: value('Transient iterations'),
    transientAnalysisSeconds: value('Transient analysis time'),
    loadSeconds: value('Transient load time'),
    factorSeconds: value('Transient factor time'),
    solveSeconds: value('Transient solve time'),
    truncSeconds: value('Transient trunc time'),
    wallSecondsIncludingSpiceHeavyQueue: Number(await readFile(resolve(out, `${deck}.ngspice.wall`), 'utf8')),
  };
}

async function run(name: string) {
  const { snapshots: _snapshots, core: _core, ...rest } = await json(name);
  return {
    ...rest,
    fixture: basename(rest.fixture),
    msPerNewtonIteration: Number((rest.final.wallMs / rest.final.newtonIterations).toFixed(4)),
  };
}

async function compare(name: string) {
  const { spiceTsPoints, ngspicePoints, spiceTsEnd, threshold, worst, signals } = await json(name);
  return { spiceTsPoints, ngspicePoints, spiceTsEnd, threshold, worst, signals };
}

async function profile(name: string) {
  const { busyMs, split, top } = await json(name);
  return { busyMs, split, top: top.slice(0, 12) };
}

const decks = Object.fromEntries((await readFile(resolve(out, 'decks.sha256'), 'utf8')).trim().split('\n')
  .map(line => line.split(/\s+/)).map(([hash, path]) => [basename(path), hash]));

const result = {
  issues: [611, 604],
  machine: {
    cpu: process.env.MACHINE_CPU ?? null,
    os: process.env.MACHINE_OS ?? null,
    node: process.version,
    ngspice: process.env.NGSPICE_VERSION ?? null,
    hostLoad: process.env.HOST_LOAD ?? null,
  },
  spiceTsTree: process.env.SPICE_TS_TREE ?? null,
  decks: {
    'adder_bip.cir': { sha256: decks['adder_bip.cir'], source: 'corpus-f examples/digital/compare/adder_bip.cir, identical bytes' },
    'adder_bip_body.cir': { sha256: decks['adder_bip_body.cir'], source: 'adder_bip.cir without its .control block (ngspice single-run counters only)' },
    'adder_mos_body.cir': {
      sha256: decks['adder_mos_body.cir'],
      source: 'corpus-f examples/digital/compare/adder_mos.cir without its .control block, outputs kept as `.save V(9) V(10) V(11) V(12) V(13)`; same circuit as examples/mos/adder_mos.cir; both engines read these bytes',
    },
  },
  ngspice47: {
    'adder_bip (fixture; ngspice -b runs the deck twice, batch + .control run, counters cumulative)': await ngspice('adder_bip'),
    'adder_bip_body (single run)': await ngspice('adder_bip_body'),
    'adder_mos_body (single run)': await ngspice('adder_mos_body'),
  },
  spiceTs: {
    adder_bip: {
      baseline: await run('adder_bip.baseline.json'),
      experimentNoNodeLte: await run('adder_bip.no-node-lte.json'),
      profile30s: await profile('adder_bip.profile-split.json'),
    },
    adder_mos_body: {
      baseline: await run('adder_mos_body.baseline.json'),
      experimentNoNodeLte: await run('adder_mos_body.no-node-lte.json'),
      profile30s: await profile('adder_mos_body.profile-split.json'),
    },
  },
  parityVsNgspice47: {
    adder_bip: {
      baselineWindowUntilBound: await compare('adder_bip.baseline.compare.json'),
      experimentNoNodeLteFullRun: await compare('adder_bip.no-node-lte.compare.json'),
    },
    adder_mos_body: {
      baselineWindowUntilBound: await compare('adder_mos_body.baseline.compare.json'),
      experimentNoNodeLteFullRun: await compare('adder_mos_body.no-node-lte.compare.json'),
    },
  },
};
console.log(JSON.stringify(result, null, 2));
