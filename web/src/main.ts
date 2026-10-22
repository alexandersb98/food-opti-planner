import '@quasar/extras/material-icons/material-icons.css'
import 'quasar/src/css/index.sass'
import { Quasar } from 'quasar'
import { createApp } from 'vue'
import App from './App.vue'
import { makeI18n } from './i18n'
import { makeRouter } from './router'

createApp(App).use(Quasar).use(makeI18n()).use(makeRouter()).mount('#app')
