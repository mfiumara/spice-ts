import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';
import { gunzipSync } from 'node:zlib';
import {
  CATEGORIES,
  EXPECTED_BASES,
  HERE,
  NGSPICE_VERDICTS,
  REPRODUCES,
  SPICE_TS_VERDICTS,
  type Manifest,
  type TicketEntry,
  hasReadme,
  loadManifest,
  outcome,
  renderAll,
} from './render.js';

const MAX_COMMITTED_DECK_BYTES = 3072;

async function deck(path: string): Promise<string> {
  return readFile(resolve(HERE, path), 'utf8');
}

async function core(): Promise<{ simulate: (netlist: string) => Promise<any>; parse: (netlist: string) => any }> {
  return import(pathToFileURL(resolve(HERE, '../../../packages/core/dist/index.js')).href);
}

function entry(manifest: Manifest, ticket: number): TicketEntry {
  const found = manifest.tickets.find(e => e.ticket === ticket);
  assert.ok(found, `ticket #${ticket} in manifest`);
  return found;
}

describe('ngspice-bugs manifest', () => {
  it('#737: committed oracle diagnostics contain only allowlisted metadata, never source text', async () => {
    const text = await readFile(resolve(HERE, 'oracle-737.json'), 'utf8');
    assert.doesNotMatch(text, /\.(?:subckt|model|include)\b|b\.x\w*\.[^ ]*\s+[^ ]+\s+[^ ]+\s+v=/i);
    const receipt = JSON.parse(text);
    for (const row of receipt.rows) {
      if (row.spiceTs.status === 'failed') {
        assert.equal(typeof row.spiceTs.error, 'object');
        assert.deepEqual(Object.keys(row.spiceTs.error).sort(), ['code', 'sha256']);
      }
      for (const run of row.ngspice) {
        assert.equal(typeof run.diagnostics, 'object');
        assert.deepEqual(Object.keys(run.diagnostics).sort(), ['code', 'sha256']);
        assert.match(run.diagnostics.sha256, /^[a-f0-9]{64}$/);
        assert.ok(['completed', 'parse-error', 'timestep-too-small', 'failed'].includes(run.diagnostics.code));
        assert.ok(!('error' in run), 'no free-form spawn error');
      }
    }
  });

  it('#737: fresh archive preparation materializes only the exact derived pin', async () => {
    const { prepare737 } = await import('./prepare-737.js');
    const directory = await mkdtemp(resolve(tmpdir(), 'prepare-737-test-'));
    try {
      const source = resolve(directory, 'source');
      const fetched = resolve(directory, 'fetched');
      await mkdir(source);
      await mkdir(fetched);
      // Synthetic source, not redistributed vendor material.
      const original = 'Synthetic preparation fixture\r\n.include "D:/spice_lib/test.lib"\r\n.op\r\n.end\r\n';
      const expected = 'Synthetic preparation fixture\n.include spice_lib/test.lib\n.op\n.end\n';
      const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
      await writeFile(resolve(source, 'OPA890Test.cir'), original);
      execFileSync('tar', ['-cf', resolve(fetched, 'Test.zip'), '-C', source, 'OPA890Test.cir']);
      const pins = { archiveSha256: hash(await readFile(resolve(fetched, 'Test.zip'))), deckSha256: hash(expected), deckName: 'OPA890Test.local.cir' };
      assert.equal(existsSync(resolve(fetched, pins.deckName)), false);
      await prepare737(fetched, pins);
      assert.equal(await readFile(resolve(fetched, pins.deckName), 'utf8'), expected);
      await rm(resolve(fetched, pins.deckName));
      await assert.rejects(prepare737(fetched, { ...pins, deckSha256: '0'.repeat(64) }), /deck pin mismatch/);
      assert.equal(existsSync(resolve(fetched, pins.deckName)), false);
      await assert.rejects(prepare737(fetched, { ...pins, archiveSha256: '0'.repeat(64) }), /archive pin mismatch/);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('#803: bounded recovery preserves the five original pins and never scores gaps', async () => {
    const recovery = JSON.parse(await readFile(resolve(HERE, 'reconstruction-803.json'), 'utf8'));
    const manifest = await loadManifest();
    assert.equal(recovery.rows.length, 5);
    assert.equal(new Set(recovery.rows.map((row: any) => `${row.ticket}/${row.deck}`)).size, 5);
    for (const row of recovery.rows) {
      const ticket = entry(manifest, row.ticket);
      assert.equal(ticket.uncommittedDecks.find(deck => deck.name === row.deck)?.sha256, row.expectedSha256);
      assert.equal(row.status, 'provenance-gap');
      assert.deepEqual(row.matches, []);
      assert.ok(row.attemptCount > 1000);
      assert.match(row.attemptedHashSetSha256, /^[a-f0-9]{64}$/);
      assert.ok(row.examples.length > 1);
      for (const attempt of row.examples) {
        assert.match(attempt.sha256, /^[a-f0-9]{64}$/);
        assert.notEqual(attempt.sha256, row.expectedSha256);
      }
      assert.notEqual(ticket.spiceTs.verdict, 'right');
    }
  });

  it('#737: partial OP oracle is not a complete transient correctness win', async () => {
    const receipt = JSON.parse(await readFile(resolve(HERE, 'oracle-737.json'), 'utf8'));
    assert.equal(receipt.rows.length, 5);
    const ticket = entry(await loadManifest(), 737);
    assert.notEqual(ticket.spiceTs.verdict, 'right');
    assert.equal(receipt.rows[0].sha256, ticket.uncommittedDecks[0].sha256);
    assert.equal(receipt.rows[0].spiceTs.finalTime, 0.01);
    for (const row of receipt.rows.slice(0, 4)) {
      assert.ok(row.ngspice.every((run: any) => run.exitCode !== 0));
    }
    const op = receipt.rows.at(-1);
    assert.equal(op.name, 'NEW-op');
    const native = op.ngspice.find((run: any) => run.mode === 'ltps');
    assert.equal(native.exitCode, 0);
    assert.equal(native.plots[0].points, 1);
    // Publish disagreement, not a tolerance-tuned pass on a different analysis.
    const reference = native.plots[0].signals['i(v159)'][0].re;
    assert.ok(Math.abs(op.spiceTs.currents.V159 - reference) > 1e-4);
  });

  it('lists every harvested ticket once, sorted, with valid enums', async () => {
    const manifest = await loadManifest();
    assert.equal(manifest.tickets.length, manifest.harvest.count);
    const numbers = manifest.tickets.map(e => e.ticket);
    assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b));
    assert.equal(new Set(numbers).size, numbers.length);
    for (const e of manifest.tickets) {
      assert.match(e.url, /^https:\/\/sourceforge\.net\/p\/ngspice\/bugs\/\d+\/$/);
      assert.ok(['open', 'open-accepted'].includes(e.status), `#${e.ticket} status`);
      assert.ok((CATEGORIES as readonly string[]).includes(e.category), `#${e.ticket} category`);
      assert.ok((NGSPICE_VERDICTS as readonly string[]).includes(e.ngspice47.verdict), `#${e.ticket} ngspice47`);
      assert.ok((NGSPICE_VERDICTS as readonly string[]).includes(e.ngspiceMaster.verdict), `#${e.ticket} master`);
      assert.ok((SPICE_TS_VERDICTS as readonly string[]).includes(e.spiceTs.verdict), `#${e.ticket} spice-ts`);
      assert.ok((EXPECTED_BASES as readonly string[]).includes(e.expectedBasis), `#${e.ticket} basis`);
      assert.ok((REPRODUCES as readonly string[]).includes(e.reproducesOnNgspice47), `#${e.ticket} reproduces`);
      // A spice-ts "wrong" verdict must be tracked by an issue (charter: file every case where spice-ts is also wrong).
      if (e.spiceTs.verdict === 'wrong') assert.match(e.spiceTsIssue ?? '', /^https:\/\/github\.com\/mfiumara\/spice-ts\/issues\/\d+$/, `#${e.ticket} issue`);
      if (!e.simulatorRelevant || !e.runnableDeck) assert.equal(outcome(e), 'not-simulated');
    }
  });

  it('commits only small decks, byte-identical to the recorded hashes', async () => {
    const manifest = await loadManifest();
    for (const e of manifest.tickets) {
      for (const file of e.committedDecks) {
        assert.ok(file.path.startsWith(`tickets/${e.ticket}/`), file.path);
        const bytes = await readFile(resolve(HERE, file.path));
        assert.ok(bytes.length <= MAX_COMMITTED_DECK_BYTES, `${file.path} is ${bytes.length} B`);
        assert.equal(bytes.length, file.bytes, file.path);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
      }
      if (e.committedDecks.length > 0) assert.ok(hasReadme(e), `#${e.ticket} commits decks but is not a runnable simulator ticket`);
    }
  });

  it('generated NGSPICE_BUGS.md and ticket READMEs are up to date', async () => {
    const files = renderAll(await loadManifest());
    for (const [path, text] of files) {
      assert.equal(await readFile(path, 'utf8').catch(() => ''), text, `${path} is stale: run render.ts`);
    }
  });
});

/**
 * Pins the spice-ts side of the verdicts that the summary reports as "ngspice defective, spice-ts correct",
 * against the expected answers (not against ngspice). Requires `pnpm build` (imports packages/core/dist).
 */
describe('ngspice-bugs spice-ts verdicts', () => {
  it('#871: unchanged arg/temper cards match independent lexical-shadowing answers', async () => {
    const manifest = await loadManifest();
    assert.equal(outcome(entry(manifest, 871)), 'spice-ts-correct');
    const { simulate, parse } = await core();
    const arg = await simulate(await deck('tickets/871/arg_capture_cards.cir'));
    assert.equal(arg.dc.current('V1'), -1);

    const temperDeck = await deck('tickets/871/temper_capture_cards.cir');
    const resistor = parse(temperDeck).compile().devices.find((device: { name: string }) => device.name === 'R1');
    assert.ok(resistor, 'temper deck resolves R1');
    const bits = (value: number): bigint => {
      const view = new DataView(new ArrayBuffer(8));
      view.setFloat64(0, value);
      return view.getBigUint64(0);
    };
    // ngspice-47 binary rawfile probe: {twice(3)} -> 0x4018000000000001,
    // unlike bare 6. #782/#1032 preserve this INPevaluate round-trip (see PR evidence).
    assert.equal(bits(resistor.resistance), 0x4018000000000001n);
    const temper = await simulate(temperDeck);
    const current = temper.dc.current('V1');
    assert.equal(current, -1 / resistor.resistance);
    assert.equal(bits(current), 0xbfc5555555555554n);
    // 1/6 lies in [2^-3, 2^-2): its binary64 ulp is 2^(-3 - 52).
    assert.ok(Math.abs(current + 1 / 6) <= 4 * 2 ** -55, `I(V1) = ${current}`);
    assert.ok(Math.abs(current - (-1 / 56)) > 0.1, 'distinct from ngspice lexical capture of temper + 1');
  });

  it('#812: receipts cover the original 25 tickets without substituting unpinned decks', async () => {
    const lines = gunzipSync(await readFile(resolve(HERE, 'refresh-812.jsonl.gz'))).toString('utf8').trim().split('\n').map(line => JSON.parse(line));
    const rows = lines.slice(1);
    assert.equal(rows.length, 43);
    assert.equal(new Set(rows.map(row => row.ticket)).size, 25);
    const manifest = await loadManifest();
    for (const row of rows) {
      const ticket = entry(manifest, row.ticket);
      assert.ok(ticket.spiceTs.evidence.startsWith('#812 refresh d8ab9d33'));
      if (row.receipt.status === 'provenance-gap') {
        assert.equal(row.receipt.actualSha256, null);
        assert.ok(ticket.uncommittedDecks.some(file => file.sha256 === row.receipt.expectedSha256));
        assert.equal(ticket.spiceTs.verdict, 'unsupported');
      } else {
        assert.ok([...ticket.committedDecks, ...ticket.uncommittedDecks].some(file => file.sha256 === row.receipt.netlistSha256));
      }
    }
  });

  for (const [ticket, a, b] of [
    [877, 'tickets/877/repro_a_cards.cir', 'tickets/877/repro_b_cards.cir'],
    [878, 'tickets/878/repro_l2_a_cards.cir', 'tickets/878/repro_l2_b_cards.cir'],
  ] as const) {
    it(`#${ticket}: drain currents do not depend on the order of the Z cards`, async () => {
      const manifest = await loadManifest();
      assert.equal(outcome(entry(manifest, ticket)), 'spice-ts-correct');
      const { simulate } = await core();
      const first = await simulate(await deck(a));
      const second = await simulate(await deck(b));
      for (const source of ['vd1', 'vd2']) {
        const x = first.dc.current(source);
        const y = second.dc.current(source);
        assert.ok(Number.isFinite(x) && Number.isFinite(y));
        assert.ok(Math.abs(x - y) <= 1e-12 * Math.max(Math.abs(x), Math.abs(y)), `${source}: ${x} vs ${y}`);
      }
      // The forward-biased device (vds = +1 V) absorbs power: its source current is negative.
      assert.ok(first.dc.current('vd2') < 0);
    });
  }

  it('#651: VDMOS with a small ksubthres sweeps to the analytic strong-inversion current', async () => {
    const manifest = await loadManifest();
    assert.equal(outcome(entry(manifest, 651)), 'spice-ts-correct');
    const { simulate } = await core();
    const result = await simulate(await deck('tickets/651/ksubthres_nch_cards.sp'));
    const current = result.dcSweep.current('VD') as Float64Array;
    assert.equal(current.length, 401);
    assert.ok(current.every(Number.isFinite));
    // ID = (Kp/2)(Vgs - Vto - Rs ID)^2 (1 + lambda (Vds - (Rd + Rs) ID)) at VG = 4 V, VD = 10 V.
    const expected = 5.827026843146154;
    assert.ok(Math.abs(-current[400] - expected) <= 1e-6 * expected, `I(VD) = ${current[400]}`);
  });

  for (const [ticket, path] of [[688, 'tickets/688/print.cir'], [849, 'tickets/849/rhs_size_bare_current_node_repro.cir']] as const) {
    it(`#${ticket}: an ill-posed topology is diagnosed instead of producing numbers`, async () => {
      const manifest = await loadManifest();
      assert.equal(entry(manifest, ticket).spiceTs.verdict, 'right');
      const { simulate } = await core();
      await assert.rejects(simulate(await deck(path)), /[Ss]ingular/);
    });
  }

  // Fetch-only decks (vendor libraries are not committed): run `fetch.ts 685 740 763` first
  // (#685: unzip TestVT.zip in fetched/685).
  // The manifest's edit is applied in memory: absolute .include paths become the attachment basename.
  for (const [ticket, libraries, tolerance, decks] of [
    [685, 'TestVT/Model', 1e-5, [['TestVT/TestDI_DMG6968UDM.cir', 1e-7, -1.35033248753e-8]]],
    [740, '.', 1e-6, [['circuit.cir', 1e-8, -1.959222e-8], ['split.cir', 1e-7, -1.973652e-8]]],
    [763, '.', 1e-6, [['netlistwithR5.cir', 1e-7, -5.649621e-7], ['ResistorSplitR5.cir', 1e-7, -5.649621e-7]]],
  ] as const) {
    const dir = resolve(HERE, 'fetched', String(ticket));
    it(`#${ticket}: the DC-source decks complete and hold ngspice-47's operating point`, {
      skip: existsSync(resolve(dir, decks[0][0])) ? false : `run fetch.ts ${ticket} (and extract its archive) first`,
    }, async () => {
      const manifest = await loadManifest();
      assert.equal(outcome(entry(manifest, ticket)), 'spice-ts-correct');
      const { simulate } = await core();
      for (const [name, stop, operatingPoint] of decks) {
        const text = (await readFile(resolve(dir, name), 'utf8'))
          .replace(/\r\n/g, '\n')
          .replace(/(\.include\s+)"[^"]*\/([^"/]+)"/gi, '$1$2');
        const result = await (simulate as (netlist: string, options: object) => Promise<any>)(text, {
          resolveInclude: (include: string) => readFile(resolve(dir, libraries, include), 'utf8'),
        });
        const time = result.transient.time as number[];
        const current = result.transient.current('V1') as number[];
        assert.ok(Math.abs(time[time.length - 1] - stop) <= 1e-9 * stop, `${name} stops at ${time[time.length - 1]}`);
        assert.ok(Math.abs(current[0] - operatingPoint) <= tolerance * Math.abs(operatingPoint), `${name} i(V1)(0) = ${current[0]}`);
        // DC source: after 1 ns the current holds the operating point (round-off only).
        for (let i = 0; i < time.length; i++) {
          if (time[i] < 1e-9) continue;
          assert.ok(Math.abs(current[i] - operatingPoint) <= 1e-3 * Math.abs(operatingPoint), `${name} i(V1)(${time[i]}) = ${current[i]}`);
        }
      }
    });
  }

  // Fetch-only: run `fetch.ts 505` first. dot.cir is Vsetpoint.cir without its `.control version .endc` block.
  const potentiometer = resolve(HERE, 'fetched', '505');
  it('#505: three-argument limit() clamps the wiper and the transient completes deterministically', {
    skip: existsSync(potentiometer) ? false : 'run fetch.ts 505 first',
  }, async () => {
    const manifest = await loadManifest();
    assert.equal(outcome(entry(manifest, 505)), 'spice-ts-correct');
    const { simulate } = await core();
    const text = (await readFile(resolve(potentiometer, 'Vsetpoint.cir'), 'utf8')).replace('.control\nversion\n.endc\n', '');
    const result = await (simulate as (netlist: string, options: object) => Promise<any>)(text, {
      resolveInclude: (include: string) => readFile(resolve(potentiometer, include), 'utf8'),
    });
    const time = result.transient.time as number[];
    assert.ok(Math.abs(time[time.length - 1] - 0.3) <= 1e-12, `stops at ${time[time.length - 1]}`);
    // ngspice-47 with `set ngbehavior=ps` (compatibility clamp limit): V(vset)(0.3 s) = 4.807534111921781e-3.
    const vset = result.transient.voltage('vset') as number[];
    assert.ok(Math.abs(vset[vset.length - 1] - 4.807534111921781e-3) <= 1e-9, `V(vset) = ${vset[vset.length - 1]}`);
  });
});
