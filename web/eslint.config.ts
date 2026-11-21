import reactHooks from 'eslint-plugin-react-hooks'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'

// The React app's folder.
const reactFiles = ['src/app/**/*.{ts,tsx}']

// The framework-neutral stores (tickets 06, 07) import no React.
const storeFiles = ['src/app/stores/**/*.ts']
const neutralOnly = 'A store is framework-neutral: no React (read it with useSyncExternalStore elsewhere).'

export default defineConfig(
  { ignores: ['dist/**', 'src/api/schema.ts', 'playwright-report/**', 'test-results/**', 'screenshots/**'] },
  { files: ['**/*.{ts,tsx}'], extends: [tseslint.configs.recommended] },
  { ...reactHooks.configs.flat.recommended, files: reactFiles },
  {
    files: storeFiles,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react/*', 'react-dom', 'react-dom/*', 'react-router', 'react-router/*'],
              message: neutralOnly,
            },
          ],
        },
      ],
    },
  },
)
