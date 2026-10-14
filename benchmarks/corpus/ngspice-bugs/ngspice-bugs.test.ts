import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
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

async function core(): Promise<{ simulate: (netlist: string) => Promise<any> }> {
  return import(pathToFileURL(resolve(HERE, '../../../packages/core/dist/index.js')).href);
}

function entry(manifest: Manifest, ticket: number): TicketEntry {
  const found = manifest.tickets.find(e => e.ticket === ticket);
  assert.ok(found, `ticket #${ticket} in manifest`);
  return found;
}

describe('ngspice-bugs manifest', () => {
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
    const { simulate } = await core();
    for (const [name, expected] of [['arg_capture_cards.cir', -1], ['temper_capture_cards.cir', -1 / 6]] as const) {
      const result = await simulate(await deck(`tickets/871/${name}`));
      assert.equal(result.dc.current('V1'), expected);
    }
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
