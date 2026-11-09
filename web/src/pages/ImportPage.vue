<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { api } from '../api/client'
import { errorType } from '../api/errors'
import EditorHeader from '../components/EditorHeader.vue'
import { setImportedDraft } from '../importDraft'

// I1: paste a recipe, the AI makes a draft, and the recipe editor opens it
// for review. Nothing is stored until Save there.
const { t, te } = useI18n()
const router = useRouter()

const text = ref('')
const running = ref(false)
const error = ref('')
// Whether the server has an AI key; unknown (read failed) counts as no.
const configured = ref(false)

onMounted(async () => {
  setImportedDraft(null) // no stale draft from an earlier import
  try {
    const { data } = await api.GET('/api/health')
    configured.value = data?.ai_configured === true
  } catch {
    configured.value = false
  }
})

const canImport = computed(() => configured.value && !running.value && text.value.trim() !== '')

async function run() {
  if (!canImport.value) return
  running.value = true
  error.value = ''
  try {
    const { data, error: failure } = await api.POST('/api/recipe-imports', { body: { text: text.value } })
    if (data) {
      setImportedDraft(data)
      await router.push('/recipes/new')
      return
    }
    const type = errorType(failure)
    error.value = type && te(`import.error.${type}`) ? t(`import.error.${type}`) : t('import.error.other')
  } catch {
    error.value = t('import.error.other')
  } finally {
    running.value = false
  }
}
</script>

<template>
  <q-page padding>
    <EditorHeader
      back="/recipes"
      :title="$t('import.title')"
    />
    <p class="text-grey-8">
      {{ $t('import.intro') }}
    </p>
    <q-form
      class="q-gutter-y-md"
      @submit="run"
    >
      <q-input
        v-model="text"
        class="import-text"
        type="textarea"
        outlined
        autogrow
        :readonly="running"
        :aria-label="$t('import.text')"
        :label="$t('import.text')"
      />
      <div
        v-if="error"
        class="import-error text-negative"
        role="alert"
      >
        {{ error }}
      </div>
      <div
        v-if="!configured"
        class="needs-key text-grey-8"
      >
        {{ $t('import.needsKey') }}
      </div>
      <q-btn
        type="submit"
        color="primary"
        no-caps
        :disable="!canImport"
        :loading="running"
        :label="running ? $t('import.reading') : $t('import.run')"
      />
    </q-form>
  </q-page>
</template>
