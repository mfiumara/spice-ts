import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { staticVerdict, stripTerminalNewline } from '../corpus-h/lib.js';

const root = 'benchmarks/corpus/corpus-j';
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const sources = [
  { key: 'ngspice-current', repository: 'https://sourceforge.net/p/ngspice/ngspice', revision: 'a80f6e3e95d51534905b1f23410a951802666656', license: 'BSD-3-Clause', licenseFile: 'COPYING', checkout: 'ngspice-src',
    basis: 'COPYING lines 14-15 explicitly adopt Modified BSD for all source, test and example files except listed paths. Selected examples are outside every exception; inline models are generic authored examples, not vendor libraries.',
    paths: ['examples/measure/rc-meas-ac-control.sp', 'examples/p-to-n-examples/aswitch-pswitch.cir', 'examples/mos/nmos_pmos_BSIM330.sp', 'examples/xspice/original-examples/xspice.deck'] },
  { key: 'spicelib', repository: 'https://github.com/nunobrum/spicelib', revision: 'd8f8ecceeb361741f1f660f03b03ac49697f8700', license: 'GPL-3.0-only', licenseFile: 'LICENSE', checkout: '940-spicelib',
    basis: 'Repository-wide LICENSE GPLv3, pyproject GPL-3.0 and README GNU V3 License. Original examples only, not machine-edited golden output; no vendor models or third-party notices.',
    paths: ['examples/testfiles/test_kicad_nets.cir', 'examples/testfiles/ac_rawtest.net', 'examples/testfiles/ngsteps.net', 'examples/testfiles/sens_ngspice_rawtest.net', 'examples/testfiles/tran_rawtest.net'] },
];
async function main() {
  const scratch = process.argv[2];
  if (!scratch) throw new Error('append-part2.ts <pinned-checkouts-directory>');
  const original = await readFile(`${root}/manifest.json`);
  const manifest = JSON.parse(original.toString());
  if (manifest.circuits.length !== 11) throw new Error('append only once to historical 11-row manifest');
  const seen = new Set<string>();
  for (const directory of await readdir('benchmarks/corpus')) {
    let files;
    try { files = await readdir(resolve('benchmarks/corpus', directory, 'fixtures'), { recursive: true, withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    for (const file of files) {
      if (!file.isFile()) continue;
      const bytes = await readFile(resolve(file.parentPath, file.name));
      seen.add(hash(bytes)); seen.add(hash(stripTerminalNewline(bytes)));
    }
  }
  manifest.historicalManifestSha256 = hash(original);
  for (const { paths, checkout, ...source } of sources) {
    const cwd = resolve(scratch, checkout);
    const blob = (path: string) => execFileSync('git', ['show', `${source.revision}:${path}`], { cwd });
    const license = blob(source.licenseFile);
    const licensePath = `${root}/licenses/${source.key}/${source.licenseFile}`;
    await mkdir(dirname(licensePath), { recursive: true });
    await writeFile(licensePath, license);
    manifest.sources.push({ ...source, licensePath, licenseSha256: hash(license) });
    for (const upstreamPath of paths) {
      const bytes = blob(upstreamPath);
      const verdict = staticVerdict(bytes, upstreamPath, new Set<string>());
      if (verdict.reason) throw new Error(`${upstreamPath}: ${verdict.reason}: ${verdict.detail}`);
      if (seen.has(hash(bytes)) || seen.has(hash(stripTerminalNewline(bytes)))) throw new Error(`duplicate: ${upstreamPath}`);
      const sourcePath = `${source.key}/${upstreamPath}`;
      const localPath = `${root}/fixtures/${sourcePath}`;
      await mkdir(dirname(localPath), { recursive: true });
      await writeFile(localPath, bytes);
      manifest.circuits.push({ id: `j-${manifest.circuits.length + 1}`, source: source.key, upstreamPath, sourcePath,
        sourceUrl: source.key === 'spicelib' ? `${source.repository}/blob/${source.revision}/${upstreamPath}` : `${source.repository}/ci/${source.revision}/tree/${upstreamPath}`,
        revision: source.revision, licence: source.license, sha256: hash(bytes), bytes: bytes.length, localPath,
        analyses: verdict.analyses, unmappedAnalyses: verdict.unmappedAnalyses, sameNameAs: [], includeClosure: [] });
      seen.add(hash(bytes)); seen.add(hash(stripTerminalNewline(bytes)));
    }
  }
  manifest.deliveredFixtures = manifest.circuits.length;
  manifest.partial = manifest.deliveredFixtures < manifest.requestedFixtures;
  manifest.part2Selection = 'Nine explicitly selected original standalone examples, novel exact and terminal-newline-stripped input hashes. Prioritise ngspice-native filter, switch, CMOS and XSPICE amplifier plus KiCad and spicelib analysis decks. All nine outcomes retained even if ngspice fails. No spice-ts-success filter, fixture adaptation, golden-output padding or vendor libraries. Historical 11 rows and receipts unchanged.';
  await writeFile(`${root}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`appended ${manifest.deliveredFixtures - 11}; total ${manifest.deliveredFixtures}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
