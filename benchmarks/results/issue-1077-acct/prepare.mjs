// Generate separately instrumented bundles without changing simulator sources.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const out = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(out, '../../..');
const coreRequire = createRequire(resolve(root, 'packages/core/package.json'));
const require = createRequire(coreRequire.resolve('tsup/package.json'));
const { build } = require('esbuild');
const ts = createRequire(resolve(root, 'packages/core/package.json'))('typescript');
const targets = {
  'analysis/transient.ts': { solveTransient: 'transient' },
  'analysis/transient-driver.ts': { advanceSolution: 'advance', stampPrevB: 'historyRestamp' },
  'analysis/transient-step.ts': { attemptStep: 'attempt' },
  'mna/companion.ts': { buildCompanionSystem: 'loadStamp' },
  'analysis/transient-columns.ts': { record: 'output', flush: 'output' },
};
const manifest = [];
mkdirSync(resolve(out, '.generated'), { recursive: true });
for (const instrumented of [false, true]) {
  await build({ entryPoints: [resolve(root, 'packages/core/src/index.ts')], bundle: true,
    platform: 'node', format: 'esm', target: 'es2022', sourcemap: true,
    external: ['eecircuit-engine'], outfile: resolve(out, `.generated/${instrumented ? 'instrumented' : 'control'}.mjs`),
    plugins: instrumented ? [{ name: 'acct', setup(b) {
      b.onLoad({ filter: /\.ts$/ }, ({ path }) => {
        const key = relative(resolve(root, 'packages/core/src'), path);
        if (!(key in targets)) return;
        const source = readFileSync(path, 'utf8');
        const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
        const edits = [];
        function visit(node) {
          const name = node.name?.getText(ast);
          const bucket = targets[key][name];
          if (bucket && node.body && ts.isBlock(node.body)) {
            edits.push([node.body.getStart(ast) + 1, `const __acct = globalThis.__acct.enter('${bucket}'); try {`]);
            edits.push([node.body.end - 1, `} finally { globalThis.__acct.exit('${bucket}', __acct); }`]);
            manifest.push({ file: key, function: name, bucket });
          }
          // Only transient linear solves, excluding the DC operating point.
          if (key === 'analysis/transient-step.ts' && ts.isCallExpression(node)
              && ['solver.factorize', 'solver.solve'].includes(node.expression.getText(ast))) {
            const bucket = node.expression.getText(ast).endsWith('factorize') ? 'factor' : 'solve';
            edits.push([node.getStart(ast), `globalThis.__acct.measure('${bucket}', () => `]);
            edits.push([node.end, ')']);
            manifest.push({ file: key, call: node.expression.getText(ast), bucket });
          }
          ts.forEachChild(node, visit);
        }
        visit(ast);
        if (key === 'mna/companion.ts') {
          const start = source.indexOf('  if (assembler.isFastPath && assembler.topologyNnz > 0)');
          const end = source.indexOf('\n  // Gear-2 bootstraps');
          const charge = source.indexOf('  for (const device of plan.charged)');
          if (start < 0 || end < 0 || charge < 0) throw new Error('Companion phase markers changed');
          edits.push([start, "const __static = globalThis.__acct.enter('deviceStaticDynamic'); try {\n"]);
          edits.push([end, "} finally { globalThis.__acct.exit('deviceStaticDynamic', __static); }\n"]);
          edits.push([charge, "const __charge = globalThis.__acct.enter('deviceCharge'); try {\n"]);
          edits.push([source.lastIndexOf('}'), "} finally { globalThis.__acct.exit('deviceCharge', __charge); }\n"]);
          manifest.push({ file: key, bucket: 'deviceStaticDynamic', scope: 'static and dynamic stamp dispatch block' },
            { file: key, bucket: 'deviceCharge', scope: 'charge stamp loop' });
        }
        let contents = source;
        for (const [pos, text] of edits.sort((a, b) => b[0] - a[0])) contents = contents.slice(0, pos) + text + contents.slice(pos);
        return { contents, loader: 'ts' };
      });
    } }] : [],
  });
}
writeFileSync(resolve(out, 'instrumentation.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Built control and diagnostic; production source tree unchanged.');
