import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Traduction outillée des règles de .claude/rules/clean-code.md
export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    // Analyse typée : nécessaire à no-floating-promises / no-misused-promises (règle « aucune promesse flottante »)
    languageOptions: {
      parserOptions: { projectService: { allowDefaultProject: ['eslint.config.js'] }, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      'max-params': ['error', 3],
      complexity: ['warn', 10],
      'max-lines-per-function': ['warn', { max: 60, skipBlankLines: true, skipComments: true }],
      'max-depth': ['warn', 3],
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
      'prefer-const': 'error',
      'no-param-reassign': 'error',
    },
  },
  {
    // Express identifies error middleware by its arity: exactly 4 parameters (err, req, res, next).
    // Scoped to the single file that defines it; every other function stays limited to 3.
    files: ['src/lib/error-handler.ts'],
    rules: { 'max-params': ['error', 4] },
  },
  {
    files: ['**/*.test.ts', 'tests/**'],
    rules: { 'max-lines-per-function': 'off' },
  },
);
