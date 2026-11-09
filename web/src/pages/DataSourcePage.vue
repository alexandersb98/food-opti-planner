<script setup lang="ts">
// A data source (S2): version, when it was imported, attribution, its colour,
// and a searchable list of its columns, each with the attribute it feeds.
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { api } from '../api/client'
import { fieldErrors } from '../api/errors'
import type { Attribute, DataSource, SourceColumn } from '../api/types'
import EditorHeader from '../components/EditorHeader.vue'
import LoadState from '../components/LoadState.vue'
import SourceColumnRow from '../components/SourceColumnRow.vue'
import { loadAll, useLoad } from '../composables/useLoad'
import { useUnits } from '../units'

const route = useRoute()
const key = String(route.params.key)

const { t } = useI18n()

// The drop-downs offer the attributes that convert with a column's unit, which
// takes the unit catalogue; without it only the same spelling matches.
onMounted(() => void useUnits().load())

// The source and the attributes its columns can be mapped to. A created
// attribute is added to the list here, without a refetch.
const { data, loading, failed, load } = useLoad(
  () =>
    loadAll({
      source: api.GET('/api/data-sources/{key}', { params: { path: { key } } }),
      attributes: api.GET('/api/attributes'),
    }),
  null as { source: DataSource; attributes: Attribute[] } | null,
)
const source = computed({
  get: () => data.value?.source ?? null,
  set: (value) => {
    if (data.value && value) data.value.source = value
  },
})
const attributes = computed(() => data.value?.attributes ?? [])

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

// Which attribute each column feeds, as the other columns of a row see it:
// attribute id to the name of the column that has it.
function takenFor(column: SourceColumn): Map<number, string> {
  const taken = new Map<number, string>()
  for (const other of source.value?.columns ?? []) {
    if (other.id !== column.id && other.attribute_id !== null) taken.set(other.attribute_id, other.name)
  }
  return taken
}

const saving = reactive<Record<number, boolean>>({})
const rowErrors = reactive<Record<number, string>>({})
// The column whose Create attribute dialog is open (wired up with the dialog).
const createFor = ref<SourceColumn | null>(null)

async function reloadSource() {
  try {
    const { data: fresh } = await api.GET('/api/data-sources/{key}', { params: { path: { key } } })
    if (fresh) source.value = fresh
  } catch {
    // the page stays as it was; the row already says what went wrong
  }
}

/** Save a column's mapping (null: none). Answers whether it was saved. */
async function map(column: SourceColumn, attributeId: number | null): Promise<boolean> {
  saving[column.id] = true
  rowErrors[column.id] = ''
  try {
    const { data: saved, error } = await api.PUT('/api/data-sources/{key}/columns/{column_id}', {
      params: { path: { key, column_id: column.id } },
      body: { attribute_id: attributeId },
    })
    if (saved && source.value) {
      source.value = { ...source.value, columns: source.value.columns.map((c) => (c.id === saved.id ? saved : c)) }
      return true
    }
    const problem = fieldErrors(error).attribute_id
    if (problem === 'attribute_taken' || problem === 'unit_mismatch') {
      // The page was stale: show the truth, then say what was refused.
      await reloadSource()
      const attribute = attributes.value.find((a) => a.id === attributeId)?.name ?? ''
      const holder = takenFor(column).get(attributeId ?? -1)
      rowErrors[column.id] =
        problem === 'attribute_taken' && holder !== undefined
          ? t('dataSource.takenError', { attribute, column: holder })
          : t('dataSource.mismatchError', { column: column.name, attribute })
    } else {
      rowErrors[column.id] = t('dataSource.mapFailed')
    }
  } catch {
    rowErrors[column.id] = t('dataSource.mapFailed')
  } finally {
    saving[column.id] = false
  }
  return false
}

function choose(column: SourceColumn, choice: number | null | 'create') {
  if (choice === 'create') createFor.value = column
  else void map(column, choice)
}

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
    const { data: saved } = await api.PATCH('/api/data-sources/{key}', {
      params: { path: { key } },
      body: { colour: colour.value },
    })
    if (saved) source.value = saved
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
          <SourceColumnRow
            v-for="column in shown"
            :key="column.id"
            :column="column"
            :attributes="attributes"
            :taken-by="takenFor(column)"
            :saving="saving[column.id] === true"
            :error="rowErrors[column.id] ?? ''"
            @choose="(choice) => choose(column, choice)"
          />
        </q-list>
      </template>
    </LoadState>
  </q-page>
</template>
