import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    // Tests start local HTTP servers on random ports; keep files isolated.
    pool: 'forks',
  },
});
