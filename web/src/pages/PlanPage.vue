<script setup lang="ts">
import { ref } from 'vue'
import { api } from '../api/client'
import type { Plan } from '../api/types'
import LoadState from '../components/LoadState.vue'
import MaxTimeDialog from '../components/MaxTimeDialog.vue'
import ScheduleCard from '../components/ScheduleCard.vue'
import { useLoad } from '../composables/useLoad'

// The Plan page (A1): the plan setup as cards, each opening its editor.
const { data: plan, loading, failed, load } = useLoad(() => api.GET('/api/plan'), null as Plan | null)
const maxTimeOpen = ref(false)
</script>

<template>
  <q-page padding>
    <h1 class="text-h5">
      {{ $t('pages.plan') }}
    </h1>

    <LoadState
      :loading="loading"
      :failed="failed"
      :message="$t('plan.loadFailed')"
      @retry="load"
    >
      <div
        v-if="plan"
        class="q-gutter-y-md"
      >
        <ScheduleCard :plan="plan" />

        <q-list
          bordered
          class="rounded-borders"
        >
          <q-item
            v-ripple
            clickable
            class="max-time"
            @click="maxTimeOpen = true"
          >
            <q-item-section>{{ $t('plan.maxTime') }}</q-item-section>
            <q-item-section
              side
              class="text-grey-8"
            >
              {{ $t('plan.seconds', { n: plan.solve_time_limit }) }}
            </q-item-section>
            <q-item-section side>
              <q-icon name="chevron_right" />
            </q-item-section>
          </q-item>
        </q-list>

        <MaxTimeDialog
          v-model="maxTimeOpen"
          :plan="plan"
          @saved="plan = $event"
        />
      </div>
    </LoadState>
  </q-page>
</template>
