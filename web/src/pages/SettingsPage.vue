<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../api/client'
import type { Preferences } from '../api/types'
import LoadState from '../components/LoadState.vue'
import { loadAll, useLoad } from '../composables/useLoad'

const { t } = useI18n()

// The preference key of each category's preferred unit, in card order.
const UNIT_KEYS = { mass: 'unit.mass', volume: 'unit.volume', energy: 'unit.energy' } as const
type Category = keyof typeof UNIT_KEYS

const { data, loading, failed: loadFailed, load } = useLoad(
  () => loadAll({ units: api.GET('/api/units'), preferences: api.GET('/api/preferences') }),
  { units: [], preferences: { 'unit.mass': '', 'unit.volume': '', 'unit.energy': '' } },
)

const saving = ref<Category | null>(null)
const saveFailed = ref(false)

const fields = computed(() =>
  (Object.keys(UNIT_KEYS) as Category[]).map((category) => ({
    category,
    label: t(`settings.units.${category}`),
    options: data.value.units.filter((unit) => unit.category === category).map((unit) => unit.symbol),
    value: data.value.preferences[UNIT_KEYS[category]],
  })),
)

/** Save a preferred unit at once; on failure the drop-down keeps the saved one. */
async function choose(category: Category, unit: string) {
  saveFailed.value = false
  saving.value = category
  try {
    const { data: saved } = await api.PUT('/api/preferences', { body: { [UNIT_KEYS[category]]: unit } })
    if (saved) data.value.preferences = saved satisfies Preferences
    else saveFailed.value = true
  } catch {
    saveFailed.value = true
  } finally {
    saving.value = null
  }
}
</script>

<template>
  <q-page padding>
    <h1 class="text-h5">
      {{ $t('pages.settings') }}
    </h1>

    <LoadState
      :loading="loading"
      :failed="loadFailed"
      :message="$t('settings.loadFailed')"
      @retry="load"
    >
      <q-card
        flat
        bordered
        class="preferred-units"
      >
        <q-card-section class="q-gutter-y-sm">
          <h2 class="text-subtitle1 q-my-none">
            {{ $t('settings.units.title') }}
          </h2>
          <p class="text-caption text-grey-8">
            {{ $t('settings.units.help') }}
          </p>
          <q-select
            v-for="field in fields"
            :key="field.category"
            :model-value="field.value"
            outlined
            dense
            :class="`unit-${field.category}`"
            :options="field.options"
            :label="field.label"
            :disable="saving === field.category"
            :loading="saving === field.category"
            @update:model-value="(unit: string) => choose(field.category, unit)"
          />
          <div
            v-if="saveFailed"
            class="text-negative"
            role="alert"
          >
            {{ $t('common.saveFailed') }}
          </div>
        </q-card-section>
      </q-card>
    </LoadState>
  </q-page>
</template>
