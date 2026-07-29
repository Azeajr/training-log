export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  // Name the plugins explicitly. Stryker's default discovery globs
  // '@stryker-mutator/*' relative to its own package, and under pnpm's isolated
  // node_modules that directory only holds core/api/instrumenter/util — the
  // runner and checker are invisible, so the run dies with "Cannot find
  // TestRunner plugin \"vitest\"". Explicit ids resolve from the project root.
  plugins: ['@stryker-mutator/vitest-runner', '@stryker-mutator/typescript-checker'],
  vitest: { configFile: 'vite.config.ts' },
  testFiles: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  mutate: ['src/lib/**/*.ts', '!src/lib/**/*.test.ts'],
  reporters: ['html', 'json', 'clear-text', 'progress'],
  thresholds: { high: 80, low: 60, break: 40 },
  coverageAnalysis: 'perTest',
  inPlace: true,
  disableTypeChecks: false,
  cleanTempDir: 'always',
}
