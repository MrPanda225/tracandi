import { defineConfig } from 'vitest/config';

// Deux projets : tests unitaires (co-localisés, *.test.ts, sans réseau ni base)
// et tests d'intégration (tests/integration, MySQL de test jobpilot_test).
export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      { test: { name: 'unit', include: ['src/**/*.test.ts'], environment: 'node' } },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } }, // tests d'intégration en série : base partagée
          testTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/modules/**', 'src/llm/**', 'src/scraper/**'],
      exclude: ['**/*.test.ts'],
      thresholds: { lines: 80 }, // ENF-MAI-01
    },
  },
});
