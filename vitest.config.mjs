import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.mjs'],
    globalSetup: ['tests/global-setup.mjs']
  }
});
