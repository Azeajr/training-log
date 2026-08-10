import { defineConfig } from 'vitest/config'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(() => {
  return {
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**', 'src-solid/**', '.stryker-tmp/**'],
    alias: [
      // In tests, swap the worker-backed SQLite client for an in-process one
      // (sqlite-wasm, no Worker, no OPFS). lib/* and screens/* keep importing
      // from `db/index` and the same SQLiteTable layer — only the underlying
      // RPC target changes. The pattern matches both `./sqlite-client` (from
      // within db/) and `../db/sqlite-client` (from tests).
      { find: /\/sqlite-client$/, replacement: '/sqlite-test-client' },
    ],
    coverage: {
      provider: 'v8' as const,
      reporter: ['text', 'html', 'lcov'],
      include: ['src/lib/**/*.ts', 'src/screens/**/*.tsx', 'src/store/**/*.ts'],
      exclude: ['**/*.test.*', '**/seed.ts'],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  preview: {
    port: 5175,
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  },
  plugins: [
    solid(),
    tailwindcss(),
    VitePWA({
      // injectManifest mode: use the audited custom SW in src/service-worker.ts
      // instead of an auto-generated one. srcDir/filename tell the plugin where
      // to read it; `self.__WB_MANIFEST` is injected with the precache list.
      // The generateSW-only flags now live IN the SW file:
      //   - cleanupOutdatedCaches() called on activate (stale precache evicted)
      //   - clientsClaim skipped  → user keeps refresh-prompt control
      //   - skipWaiting skipped   → refresh stays user-gated (matches CSP)
      srcDir: 'src',
      filename: 'service-worker.ts',
      strategies: 'injectManifest',
      registerType: 'prompt',
      injectManifest: {
        globPatterns: ['**/*.{js,css,ico,png,wasm}'],
        // wasm is precached via globPatterns above and served cache-first in
        // the SW fetch handler (src/service-worker.ts); no runtimeCaching here
        // because vite-plugin-pwa only supports runtimeCaching under generateSW.
      },
      manifest: {
        name: 'Training Log',
        short_name: 'Training',
        theme_color: '#000000',
        background_color: '#09090b',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ]
  }
})
