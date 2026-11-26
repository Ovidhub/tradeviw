import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.test.ts', 'apps/**/lib/**/*.test.ts'],
    environment: 'node',
    reporters: ['default'],
  },
  resolve: {
    // The web app imports core by package name; point it at the source so tests
    // exercise the same files the bundler does.
    alias: { '@tradeviw/core': new URL('./packages/core/src/index.ts', import.meta.url).pathname },
  },
});
