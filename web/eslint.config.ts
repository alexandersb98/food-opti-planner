import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import reactHooks from 'eslint-plugin-react-hooks'

// The React app's folder (until the swap, ticket 42, the Vue app lives beside it).
const reactFiles = ['src/app/**/*.{ts,tsx}']

const vueOnly = 'The React app must not import the Vue app or its libraries (Vue, vue-i18n, Quasar, .vue files).'

export default defineConfigWithVueTs(
  { ignores: ['dist/**', 'src/api/schema.ts', 'playwright-report/**', 'test-results/**'] },
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,
  { ...reactHooks.configs.flat.recommended, files: reactFiles },
  {
    files: reactFiles,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['vue', 'vue/*', 'vue-i18n', 'vue-i18n/*', 'vue-router', 'vue-router/*', '@vue/*'],
              message: vueOnly,
            },
            { group: ['quasar', 'quasar/*', '@quasar/*'], message: vueOnly },
            { group: ['**/*.vue'], message: vueOnly },
          ],
        },
      ],
    },
  },
)
