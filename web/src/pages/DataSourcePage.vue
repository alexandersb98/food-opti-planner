<script setup lang="ts">
// A data source (S2), read-only but for its colour: version, when it was
// imported, attribution, and a searchable list of its columns.
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api/client'
import type { DataSource } from '../api/types'
import EditorHeader from '../components/EditorHeader.vue'
import LoadState from '../components/LoadState.vue'
import { useLoad } from '../composables/useLoad'

const route = useRoute()
const key = String(route.params.key)

const { data: source, loading, failed, load } = useLoad(
  () => api.GET('/api/data-sources/{key}', { params: { path: { key } } }),
  null as DataSource | null,
)

// Quasar's QInput passes `type` on to the browser's input but does not list
// "color" among the types it knows.
const COLOUR_INPUT = 'color' as 'text'

const search = ref<string | null>('')
// Columns in the server's order (active by name, withdrawn last), narrowed by
// the search; unlike other lists they are not re-sorted.
const shown = computed(() => {
  const text = (search.value ?? '').trim().toLocaleLowerCase()
  return (source.value?.columns ?? []).filter((column) => column.name.toLocaleLowerCase().includes(text))
})

const imported = computed(() => (source.value ? new Date(source.value.imported_at).toLocaleString() : ''))

// The colour picker's value; saved when the picker closes (`change`), not on
// every drag (`input`).
const colour = ref('')
const saveFailed = ref(false)
watch(
  () => source.value?.colour,
  (stored) => {
    if (stored) colour.value = stored
  },
  { immediate: true },
)

async function saveColour() {
  if (!source.value || colour.value === source.value.colour) return
  saveFailed.value = false
  try {
    const { data } = await api.PATCH('/api/data-sources/{key}', {
      params: { path: { key } },
      body: { colour: colour.value },
    })
    if (data) source.value = data
    else saveFailed.value = true
  } catch {
    saveFailed.value = true
  }
  if (saveFailed.value) colour.value = source.value?.colour ?? ''
}
</script>

<template>
  <q-page padding>
    <EditorHeader
      :title="source?.name ?? ''"
      back="/settings"
    />
    <LoadState
      :loading="loading"
      :failed="failed"
      :message="$t('dataSource.loadFailed')"
      @retry="load"
    >
      <template v-if="source">
        <dl class="q-my-none">
          <dt class="text-caption text-grey-8">
            {{ $t('dataSource.version') }}
          </dt>
          <dd class="q-ml-none q-mb-sm">
            {{ source.version }}
          </dd>
          <dt class="text-caption text-grey-8">
            {{ $t('dataSource.imported') }}
          </dt>
          <dd class="q-ml-none q-mb-sm">
            {{ imported }}
          </dd>
          <template v-if="source.attribution">
            <dt class="text-caption text-grey-8">
              {{ $t('dataSource.attribution') }}
            </dt>
            <dd class="q-ml-none q-mb-sm">
              {{ source.attribution }}
            </dd>
          </template>
        </dl>

        <q-input
          v-model="colour"
          :type="COLOUR_INPUT"
          outlined
          dense
          :label="$t('dataSource.colour')"
          @change="saveColour"
        />
        <p
          v-if="saveFailed"
          role="alert"
          class="text-negative q-mt-sm"
        >
          {{ $t('common.saveFailed') }}
        </p>

        <h2 class="text-h6 q-mb-xs">
          {{ $t('dataSource.columns') }}
        </h2>
        <p class="text-caption text-grey-8">
          {{ $t('dataSource.columnCount', source.column_count) }}
        </p>
        <q-input
          v-model="search"
          outlined
          dense
          clearable
          :label="$t('dataSource.searchColumns')"
        >
          <template #prepend>
            <q-icon name="search" />
          </template>
        </q-input>
        <q-list
          bordered
          separator
          class="rounded-borders q-mt-sm"
        >
          <q-item v-if="shown.length === 0">
            <q-item-section class="text-grey-8">
              {{ $t('dataSource.noColumnMatch') }}
            </q-item-section>
          </q-item>
          <q-item
            v-for="column in shown"
            :key="column.id"
            class="column-row"
            :class="{ 'text-grey-6': column.withdrawn }"
          >
            <q-item-section>
              <q-item-label>{{ column.name }}</q-item-label>
              <q-item-label
                v-if="column.unit || column.withdrawn"
                caption
              >
                {{ [column.unit, column.withdrawn ? $t('dataSource.withdrawn') : ''].filter(Boolean).join(' · ') }}
              </q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </template>
    </LoadState>
  </q-page>
</template>
