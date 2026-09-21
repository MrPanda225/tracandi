import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      'max-params': ['error', 3],
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      // Sécurité : pas d'injection HTML brute (XSS)
      'no-restricted-syntax': ['error', { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'Interdit (XSS) : voir .claude/rules/frontend.md' }],
    },
  },
);
