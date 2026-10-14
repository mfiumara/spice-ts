import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(new URL('../../packages/core/package.json', import.meta.url));
export default {
  resolve: { alias: { vitest: join(dirname(require.resolve('vitest/package.json')), 'dist/index.js') } },
  test: { include: ['benchmarks/performance/rc1k-attribution.test.ts'] },
};
