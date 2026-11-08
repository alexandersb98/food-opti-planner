<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Preferences } from '../api/types'
import LoadState from '../components/LoadState.vue'
import { usePreferences } from '../preferences'
import { useUnits, type Category } from '../units'

const units = useUnits()
const store = usePreferences()

// One drop-down per category, each bound to its preference.
const selects = [
  { key: 'unit.mass', category: 'mass' },
  { key: 'unit.volume', category: 'volume' },
  { key: 'unit.energy', category: 'energy' },
] as const satisfies readonly { key: keyof Preferences; category: Category }[]

const saving = ref<keyof Preferences | null>(null)
const saveFailed = ref(false)

const ready = computed(() => store.preferences.value !== null && units.units.value.length > 0)
const failed = computed(() => units.failed.value || store.failed.value)
const loading = computed(() => !ready.value && !failed.value)

function options(category: Category) {
  return units.offered(category).map((unit) => ({ value: unit.symbol, label: units.label(unit) }))
}

async function load() {
  await Promise.all([units.load(), store.load()])
}

async function choose(key: keyof Preferences, unit: string) {
  saving.value = key
  saveFailed.value = !(await store.set(key, unit))
  saving.value = null
}

onMounted(load)
</script>

<template>
  <q-page padding>
    <h1 class="text-h5">
      {{ $t('pages.settings') }}
    </h1>

    <LoadState
      :loading="loading"
      :failed="failed"
      :message="$t('settings.loadFailed')"
      @retry="load"
    >
      <q-card
        flat
        bordered
        class="preferred-units-card"
      >
        <q-card-section class="q-gutter-y-md">
          <div class="text-h6">
            {{ $t('settings.preferredUnits.title') }}
          </div>
          <p class="text-body2 text-grey-8">
            {{ $t('settings.preferredUnits.intro') }}
          </p>
          <q-select
            v-for="select in selects"
            :key="select.key"
            :model-value="store.preferences.value?.[select.key]"
            outlined
            emit-value
            map-options
            :options="options(select.category)"
            :label="$t(`settings.preferredUnits.${select.category}`)"
            :loading="saving === select.key"
            @update:model-value="choose(select.key, $event)"
          />
        </q-card-section>
      </q-card>
      <p
        v-if="saveFailed"
        role="alert"
        class="text-negative q-mt-sm"
      >
        {{ $t('common.saveFailed') }}
      </p>
    </LoadState>
  </q-page>
</template>
