export default {
  packageManager: 'npm',
  testRunner: 'vitest',
  vitest: { configFile: 'vite.config.ts' },
  mutate: ['src/lib/**/*.ts', '!src/lib/**/*.test.ts'],
  reporters: ['html', 'clear-text', 'progress'],
  thresholds: { high: 80, low: 60, break: 40 },
  coverageAnalysis: 'perTest',
}
