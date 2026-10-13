import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { staticVerdict, stripTerminalNewline } from '../corpus-h/lib.js';

const root = 'benchmarks/corpus/corpus-j';
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
async function main() {
  const scratch = process.argv[2];
  if (!scratch) throw new Error('select.ts <survey-checkouts-directory>');
  const sources = [
    { key: 'esim', repository: 'https://github.com/FOSSEE/eSim', revision: '1a25a46ce15e0ccc35296dd513f40249c089a5a7', license: 'GPL-3.0-only', licenseFile: 'LICENSE', basis: 'Repository README License section explicitly states GNU GPL v3.0. Only standalone Examples decks without vendor libraries or separate notices are admitted.' },
    { key: 'spicesharpparser', repository: 'https://github.com/SpiceSharp/SpiceSharpParser', revision: '8fc01560fe303eeebaeb5cbf5edfe77bf635e1c7', license: 'MIT', licenseFile: 'LICENSE', basis: 'Repository-wide MIT grant; retained verbatim copyright and licence notice. Separate notices excluded.' },
  ];
  const hashes = new Set<string>();
  for (const corpus of await readdir('benchmarks/corpus')) {
    if (corpus === 'corpus-j') continue;
    let entries: Awaited<ReturnType<typeof readdir>> = [];
    try { entries = await readdir(resolve('benchmarks/corpus', corpus, 'fixtures'), { recursive: true }); } catch { continue; }
    for (const path of entries) {
      const full = resolve('benchmarks/corpus', corpus, 'fixtures', String(path));
      let bytes: Buffer;
      try { bytes = await readFile(full); } catch { continue; }
      hashes.add(sha256(bytes)); hashes.add(sha256(stripTerminalNewline(bytes)));
    }
  }
  const circuits = [];
  const exclusions = [];
  for (const source of sources) {
    const checkout = resolve(scratch, `940-${source.key}`);
    const paths = source.key === 'esim'
      ? (await readdir(checkout, { recursive: true })).filter(path => path.endsWith('.cir') || path.endsWith('.cir.out')).sort()
      : execFileSync('git', ['ls-tree', '-r', '--name-only', source.revision], { cwd: checkout, encoding: 'utf8' }).trim().split('\n').filter(path => /\.(cir|sp|net|ckt|spice)$/i.test(path)).sort();
    const bytesAt = (path: string) => source.key === 'esim' ? readFile(resolve(checkout, path)) : Promise.resolve(execFileSync('git', ['show', `${source.revision}:${path}`], { cwd: checkout }));
    const licence = await bytesAt(source.licenseFile);
    const licensePath = `${root}/licenses/${source.key}/${source.licenseFile}`;
    await mkdir(dirname(licensePath), { recursive: true });
    await writeFile(licensePath, licence);
    Object.assign(source, { licensePath, licenseSha256: sha256(licence) });
    for (const upstreamPath of paths) {
      const bytes = await bytesAt(upstreamPath);
      const verdict = staticVerdict(bytes, upstreamPath, new Set(paths));
      const identity = sha256(stripTerminalNewline(bytes));
      const fileSource = /\bpwl\s+file\s*=/i.test(bytes.toString('utf8'));
      const reason = hashes.has(sha256(bytes)) || hashes.has(identity) ? 'already-in-corpus-or-batch' : fileSource ? 'not-self-contained' : verdict.reason;
      // Eight eSim standalone classics, in path order; no simulator is run during selection.
      const cap = source.key === 'esim' && circuits.filter(c => c.source === source.key).length >= 8;
      if (reason || cap) {
        exclusions.push({ source: source.key, upstreamPath, sha256: sha256(bytes), reason: reason ?? 'bounded-batch-cap', detail: fileSource ? 'PWL file source requires unbundled Resources companion' : verdict.reason ? verdict.detail : '' });
        continue;
      }
      if (verdict.reason !== null) throw new Error('unreachable static verdict');
      const sourcePath = `${source.key}/${upstreamPath}`;
      const localPath = `${root}/fixtures/${sourcePath}`;
      await mkdir(dirname(localPath), { recursive: true });
      await writeFile(localPath, bytes);
      circuits.push({ id: `j-${circuits.length + 1}`, source: source.key, upstreamPath, sourcePath, sourceUrl: `${source.repository}/blob/${source.revision}/${upstreamPath}`, revision: source.revision, licence: source.license, sha256: sha256(bytes), bytes: bytes.length, localPath, analyses: verdict.analyses, unmappedAnalyses: verdict.unmappedAnalyses, sameNameAs: [], includeClosure: [] });
      hashes.add(sha256(bytes)); hashes.add(identity);
    }
  }
  if (circuits.length > 20 || circuits.length === 0) throw new Error(`Invalid bounded batch size: ${circuits.length}`);
  await writeFile(`${root}/manifest.json`, JSON.stringify({ schemaVersion: 1, issue: 'https://github.com/mfiumara/spice-ts/issues/940', requestedFixtures: 20, deliveredFixtures: circuits.length, partial: circuits.length < 20, mechanicalAdaptation: 'none', selection: 'Partial source-survey artifact: every statically eligible novel standalone SpiceSharpParser deck, including ngspice-incompatible LTspice A-devices and stochastic mc() filters. The eSim survey (24 example pairs plus 17 PLL/mixed-signal/adder decks) yielded no novel standalone candidates. PWL file sources excluded in addition to unchanged corpus-h static rules. No engine probe or success filter. No derived variants or byte adaptation. Include closure is empty for every selected deck.', sources, circuits, exclusions }, null, 2) + '\n');
  console.log(JSON.stringify({ selected: circuits.map(c => c.sourcePath), exclusions: exclusions.length }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
