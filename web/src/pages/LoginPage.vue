<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api/client'

const route = useRoute()
const router = useRouter()

const password = ref('')
const busy = ref(false)
const error = ref<'wrong' | 'failed' | null>(null)

async function logIn() {
  busy.value = true
  error.value = null
  try {
    const { response } = await api.POST('/api/login', { body: { password: password.value } })
    if (response.ok) {
      const redirect = route.query.redirect
      await router.replace(typeof redirect === 'string' && redirect.startsWith('/') ? redirect : '/')
      return
    }
    error.value = response.status === 401 ? 'wrong' : 'failed'
  } catch {
    error.value = 'failed'
  } finally {
    busy.value = false
  }
  password.value = ''
}
</script>

<template>
  <q-layout view="hHh lpR fFf">
    <q-header elevated>
      <q-toolbar>
        <q-toolbar-title>{{ $t('app.title') }}</q-toolbar-title>
      </q-toolbar>
    </q-header>

    <q-page-container class="app-column">
      <q-page padding>
        <h1 class="text-h5">
          {{ $t('login.title') }}
        </h1>
        <q-form
          class="q-gutter-md"
          @submit="logIn"
        >
          <q-input
            v-model="password"
            type="password"
            outlined
            autofocus
            autocomplete="current-password"
            :label="$t('login.password')"
            :error="error !== null"
            :error-message="error ? $t(`login.${error}`) : ''"
          />
          <q-btn
            type="submit"
            color="primary"
            :label="$t('login.submit')"
            :loading="busy"
            :disable="!password"
          />
        </q-form>
      </q-page>
    </q-page-container>
  </q-layout>
</template>
