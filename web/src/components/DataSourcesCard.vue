<script setup lang="ts">
// Settings' Data sources card (S1): one row per source, opening its page.
// It loads for itself, so a failure here never hides Preferred units.
import { useI18n } from 'vue-i18n'
import { api } from '../api/client'
import type { DataSourceSummary } from '../api/types'
import LoadState from './LoadState.vue'
import { useLoad } from '../composables/useLoad'

const { t } = useI18n()

const {
  data: sources,
  loading,
  failed,
  load,
} = useLoad(() => api.GET('/api/data-sources'), [] as DataSourceSummary[])

function caption(source: DataSourceSummary) {
  return `${t('settings.dataSources.version', { version: source.version })} · ${t('settings.dataSources.foods', source.food_count)}`
}
</script>

<template>
  <q-card
    flat
    bordered
    class="data-sources-card"
  >
    <q-card-section>
      <div class="text-h6">
        {{ $t('settings.dataSources.title') }}
      </div>
    </q-card-section>
    <q-card-section class="q-pt-none">
      <LoadState
        :loading="loading"
        :failed="failed"
        :message="$t('settings.dataSources.loadFailed')"
        @retry="load"
      >
        <p
          v-if="sources.length === 0"
          class="text-body2 text-grey-8"
        >
          {{ $t('settings.dataSources.empty') }}
        </p>
        <q-list
          v-else
          separator
        >
          <q-item
            v-for="source in sources"
            :key="source.key"
            v-ripple
            clickable
            class="source-row"
            :to="`/settings/data-sources/${source.key}`"
          >
            <q-item-section avatar>
              <span
                class="source-dot"
                aria-hidden="true"
                :style="{ backgroundColor: source.colour }"
              />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ source.name }}</q-item-label>
              <q-item-label caption>
                {{ caption(source) }}
              </q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-icon name="chevron_right" />
            </q-item-section>
          </q-item>
        </q-list>
      </LoadState>
    </q-card-section>
  </q-card>
</template>

<style scoped>
.source-dot {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
}
</style>
