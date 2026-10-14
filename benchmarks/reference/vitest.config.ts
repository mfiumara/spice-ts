export default {
  root: new URL('.', import.meta.url).pathname,
  test: { globals: true, include: ['canonical.test.ts'] },
};
