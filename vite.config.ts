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
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  },
  plugins: [
    solid(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      workbox: {
        globPatterns: ['**/*.{js,css,ico,png,wasm}'],
        runtimeCaching: [
          {
            urlPattern: /\.wasm$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'wasm-cache',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      manifest: {
        name: 'Training Log',
        short_name: 'Training',
        theme_color: '#09090b',
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
