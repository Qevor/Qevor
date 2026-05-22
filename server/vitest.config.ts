import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The server is a pure Node app; the parent monorepo has a PostCSS config
  // for the React frontend that Vite would otherwise discover and try to
  // load. Pin postcss to an empty inline config so vitest never walks up
  // the tree looking for tailwindcss.
  css: {
    postcss: { plugins: [] },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.{test,spec}.ts'],
    // The executor and verifier modules read env at construction time. Keep
    // tests hermetic by clearing inherited env.
    env: {
      NODE_ENV: 'test',
    },
  },
});
