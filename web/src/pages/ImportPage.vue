<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { api } from '../api/client'
import { errorType } from '../api/errors'
import EditorHeader from '../components/EditorHeader.vue'
import { setImportedDraft } from '../importDraft'

// I1: give a link to a recipe page or paste the recipe text, the AI makes a
// draft, and the recipe editor opens it for review. Nothing is stored until
// Save there. Both inputs keep their text when switching and after an error.
const { t, te } = useI18n()
const router = useRouter()

const mode = ref<'link' | 'text'>('link')
const link = ref('')
const text = ref('')
const running = ref(false)
const error = ref('')
// Whether the server has an AI key; unknown (read failed) counts as no.
// null until health has answered, so the hint doesn't flash.
const configured = ref<boolean | null>(null)

onMounted(async () => {
  setImportedDraft(null) // no stale draft from an earlier import
  try {
    const { data } = await api.GET('/api/health')
    configured.value = data?.ai_configured === true
  } catch {
    configured.value = false
  }
})

const pasting = computed(() => mode.value === 'text')
const active = computed(() => (pasting.value ? text.value : link.value))
const canImport = computed(() => configured.value === true && !running.value && active.value.trim() !== '')

async function run() {
  if (!canImport.value) return
  running.value = true
  error.value = ''
  try {
    const { data, error: failure } = await api.POST('/api/recipe-imports', {
      body: pasting.value ? { text: text.value } : { url: link.value.trim() },
    })
    if (data) {
      setImportedDraft(data)
      await router.push('/recipes/new')
      return
    }
    const type = errorType(failure)
    const key = type === 'no_recipe' && !pasting.value ? 'no_recipe_page' : type
    error.value = key && te(`import.error.${key}`) ? t(`import.error.${key}`) : t('import.error.other')
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
      <q-toggle
        v-model="mode"
        class="import-switch"
        true-value="text"
        false-value="link"
        :label="$t('import.pasteText')"
        :aria-label="$t('import.pasteText')"
      />
      <q-input
        v-if="!pasting"
        v-model="link"
        class="import-link"
        type="url"
        inputmode="url"
        autocomplete="off"
        outlined
        :readonly="running"
        :aria-label="$t('import.link')"
        :label="$t('import.link')"
        :hint="$t('import.linkHint')"
      />
      <q-input
        v-else
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
        v-if="configured === false"
        class="needs-key text-grey-8"
      >
        {{ $t('import.needsKey') }}
      </div>
      <q-btn
        type="submit"
        color="primary"
        no-caps
        :disable="!canImport"
      >
        <template v-if="running">
          <q-spinner class="q-mr-sm" />
          {{ $t('import.reading') }}
        </template>
        <template v-else>
          {{ $t('import.run') }}
        </template>
      </q-btn>
    </q-form>
  </q-page>
</template>
