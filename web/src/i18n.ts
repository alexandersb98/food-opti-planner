import { createI18n } from 'vue-i18n'
import en from './i18n/en.json'

// English only for now (GUI spec decision 6); Swedish is added as another file.
export function makeI18n() {
  return createI18n({ legacy: false, locale: 'en', messages: { en } })
}
