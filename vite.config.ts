import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: {
    globals: true,
    exclude: ['**/node_modules/**', 'dist/**', 'evals/terminal-bench/bundle/**', 'evals/polyglot/data/benchmarks/**'],
  },
  lint: {
    categories: {
      correctness: 'warn',
      suspicious: 'warn',
    },
    rules: {
      'no-unused-vars': 'error',
      'no-console': 'off',
      eqeqeq: 'warn',
    },
    ignorePatterns: [
      'dist/**',
      'node_modules/**',
      '.alma-snapshots/**',
      'evals/terminal-bench/bundle/**',
      'coverage/**',
    ],
  },
  fmt: {
    printWidth: 120,
    tabWidth: 2,
    useTabs: false,
    semi: false,
    singleQuote: true,
    trailingComma: 'all',
  },
})
