// @ts-check
import js from '@eslint/js';
import angular from 'angular-eslint';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * Shared flat config for the monorepo. The Angular apps keep their own
 * node_modules outside the npm workspace, but ESLint resolves this file by
 * walking up from wherever it runs, so `npm run lint` at the root and each
 * package's own lint script all see the same rules.
 */
export default tseslint.config(
  {
    ignores: ['**/node_modules/', '**/dist/', '**/coverage/', '**/.angular/', '**/out-tsc/', '.claude/'],
  },

  // Every TypeScript file: NestJS API, workers, shared packages and the Angular apps.
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  // Angular apps: selector conventions plus linting of inline component templates.
  {
    files: ['apps/*/src/**/*.ts'],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
    },
  },
  {
    files: ['apps/*/src/**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },

  // Last, so it wins: switches off every rule that would fight Prettier.
  prettier,
);
