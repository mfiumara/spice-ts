// AST body edits on a benchmark-only COPY of built JS. No source or dist edits.
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { rcLadderTran } from './scaling-m2-fixture.mjs';
const require = createRequire(new URL('../../packages/core/package.json', import.meta.url));
const ts = require('typescript');
export const targets = {
  'Circuit.compile': 'compile',
  'GilbertPeierlsSolver.factorize': 'factor',
  'GilbertPeierlsSolver.solve': 'solve',
  buildCompanionSystem: 'loadStamp',
  stampStaticDevices: 'loadStamp',
  stampDynamicDevices: 'loadStamp',
  'ColumnRecorder.record': 'outputMaterialization',
  'ColumnRecorder.flush': 'outputMaterialization',
  'TransientResult.constructor': 'outputMaterialization',
};

// Exclusive self times. Children (including original #960 spans) are subtracted.
export const residualTargets = {
  ...targets,
  'TransientSimImpl.constructor': 'driverSetup',
  'TransientSimImpl.advanceSolution': 'driverAdvanceSelf',
  'TransientSimImpl.selectStep': 'timestepSelection',
  'TransientSimImpl.processEvents': 'eventControl',
  'TransientSimImpl.checkLTE': 'nodeLTE',
  'TransientSimImpl.chargeTruncationTimestep': 'chargeTruncation',
  'TransientSimImpl.orderAfterAcceptedStep': 'orderControl',
  'TransientSimImpl.acceptTransientStep': 'acceptHistory',
  'TransientSimImpl.stampPrevB': 'staticHistorySelf',
  attemptStep: 'newtonAttemptSelf',
  solveLinearized: 'linearSolveSelf',
  isConvergedTransient: 'convergenceCheck',
};

export function instrument(source, filename, counts, selectedTargets = targets) {
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const edits = [];
  function visit(node) {
    let name;
    if (ts.isFunctionDeclaration(node)) name = node.name?.text;
    if (ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)) {
      const parent = node.parent;
      const className = parent.name?.text ?? (ts.isVariableDeclaration(parent.parent) ? parent.parent.name.text : undefined);
      name = className + '.' + (ts.isConstructorDeclaration(node) ? 'constructor' : node.name?.getText(tree));
    }
    if (selectedTargets[name] && node.body) {
      counts[name] = (counts[name] ?? 0) + 1;
      const category = JSON.stringify(selectedTargets[name]);
      edits.push([node.body.getStart(tree) + 1, `\nconst __rc1kSpan = globalThis.__rc1k.enter(${category}); try {\n`]);
      edits.push([node.body.end - 1, '\n} finally { globalThis.__rc1k.leave(__rc1kSpan); }\n']);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  for (const [at, text] of edits.sort((a, b) => b[0] - a[0])) source = source.slice(0, at) + text + source.slice(at);
  return source;
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const destination = resolve(process.argv[2]);
  mkdirSync(destination, { recursive: true });
  const selectedTargets = process.argv.includes('--residual') ? residualTargets : targets;
  const counts = {}, hashes = {};
  for (const mode of ['control', 'instrumented']) {
    const directory = join(destination, mode);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'package.json'), '{"type":"module"}\n');
    for (const name of readdirSync('packages/core/dist').filter(n => n.endsWith('.js'))) {
      const source = readFileSync(join('packages/core/dist', name), 'utf8');
      const code = mode === 'instrumented' ? instrument(source, name, counts, selectedTargets) : source;
      writeFileSync(join(directory, name), code);
      hashes[mode + '/' + name] = createHash('sha256').update(code).digest('hex');
    }
  }
  for (const name of Object.keys(selectedTargets)) if (counts[name] !== 1) throw new Error(`expected exactly one ${name}, got ${counts[name]}`);
  const deck = rcLadderTran(1000).netlist;
  const deckSha256 = createHash('sha256').update(deck).digest('hex');
  if (deckSha256 !== '0944ed6b76f64f56c8e04b48919f1e12b9de19df4e5a08708c4be314fa7a91b7') throw new Error('deck differs from #958');
  writeFileSync(join(destination, 'rc1k.cir'), deck);
  writeFileSync(join(destination, '.spiceinit'), 'option klu\n');
  writeFileSync(join(destination, 'prepared.json'), JSON.stringify({ counts, hashes, deckSha256, targets: selectedTargets }, null, 2) + '\n');
}
