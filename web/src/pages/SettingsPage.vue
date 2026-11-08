<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../api/client'
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

// The drop-downs being saved; each is disabled until its answer comes.
const saving = reactive(new Set<Category>())
const saveFailed = ref(false)

const fields = computed(() =>
  (Object.keys(UNIT_KEYS) as Category[]).map((category) => ({
    category,
    label: t(`settings.units.${category}`),
    options: data.value.units.filter((unit) => unit.category === category).map((unit) => unit.symbol),
    value: data.value.preferences[UNIT_KEYS[category]],
  })),
)

/** Save a preferred unit at once; on failure the drop-down keeps the saved
 * one. Only the key sent is taken from the answer: another drop-down's save
 * may have been answered since. */
async function choose(category: Category, unit: string) {
  const key = UNIT_KEYS[category]
  saveFailed.value = false
  saving.add(category)
  try {
    const { data: saved } = await api.PUT('/api/preferences', { body: { [key]: unit } })
    if (saved) data.value.preferences[key] = saved[key]
    else saveFailed.value = true
  } catch {
    saveFailed.value = true
  } finally {
    saving.delete(category)
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
            :disable="saving.has(field.category)"
            :loading="saving.has(field.category)"
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
