import eslint from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/dist-types/**', '**/*.js', 'coverage/**', 'docs/**/*.html'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/restrict-template-expressions': 'off',
    },
  },
  {
    files: [
      'packages/battle-execution/src/{candidateExecution,candidatePreparation,candidateResult,executionPlan,targetContext}.ts',
      'packages/calculation-application/src/{rankingScenario,targetContext}.ts',
    ],
    rules: {
      'no-nested-ternary': 'error',
      complexity: ['error', 70],
      'max-lines-per-function': ['error', { max: 275, skipBlankLines: true, skipComments: true }],
    },
  },
);
