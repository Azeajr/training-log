export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: { configFile: 'vite.config.ts' },
  testFiles: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  mutate: ['src/lib/**/*.ts', '!src/lib/**/*.test.ts', '!src/lib/exportImport.ts'],
  reporters: ['html', 'json', 'clear-text', 'progress'],
  thresholds: { high: 80, low: 60, break: 40 },
  coverageAnalysis: 'perTest',
  inPlace: true,
  disableTypeChecks: false,
  cleanTempDir: 'always',
}
