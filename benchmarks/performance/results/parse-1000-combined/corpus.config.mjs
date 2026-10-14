// Run from packages/core. Only adds receipt capture to the parser corpus.
export default {
  test: {
    include: ['src/parser/**/*.test.ts'],
    setupFiles: [new URL('./corpus-setup.ts', import.meta.url).pathname],
  },
};
