<script setup lang="ts">
import { ref } from 'vue'
import { api } from '../api/client'
import type { Plan, PlanResults, TodayPlan } from '../api/types'
import LoadState from '../components/LoadState.vue'
import MaxTimeDialog from '../components/MaxTimeDialog.vue'
import SavedPlansCard from '../components/SavedPlansCard.vue'
import ScheduleCard from '../components/ScheduleCard.vue'
import SolveCard from '../components/SolveCard.vue'
import TodayCard from '../components/TodayCard.vue'
import { loadAll, useLoad } from '../composables/useLoad'
import { dateRange, localDate } from '../dates'
import { useSolve } from '../solve'

// The Plan page (A1): the plan setup as cards, each opening its editor, and
// the plans made from it: the running solve, the unsaved plan, today's
// meals and the saved plans. Make plan stays at the bottom.
const { data, loading, failed, load } = useLoad(
  () =>
    loadAll({
      plan: api.GET('/api/plan'),
      results: api.GET('/api/plan-results'),
      today: api.GET('/api/plan-results/today', { params: { query: { date: localDate() } } }),
    }),
  {
    plan: null as Plan | null,
    results: { unsaved: null, saved: [] } as PlanResults,
    today: null as TodayPlan | null,
  },
)
const maxTimeOpen = ref(false)
const solve = useSolve()

function makePlan() {
  if (data.value.plan) void solve.start(data.value.plan.solve_time_limit)
}
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
        v-if="data.plan"
        class="q-gutter-y-md"
      >
        <SolveCard
          :running="solve.running.value"
          :cancelling="solve.cancelling.value"
          :started-at="solve.startedAt.value"
          :seconds="solve.seconds.value"
          :failure="solve.failure.value"
          @cancel="solve.cancel"
          @dismiss="solve.dismiss"
        />

        <q-card
          v-if="data.results.unsaved"
          flat
          bordered
          class="new-plan-card"
        >
          <q-card-section class="row items-center no-wrap">
            <div class="col">
              <h2 class="text-subtitle1 q-my-none">
                {{ $t('plan.newPlan') }}
              </h2>
              <div class="text-grey-8">
                {{ dateRange(data.results.unsaved.start_date, data.results.unsaved.days) }} ·
                {{ $t(`plan.statusShort.${data.results.unsaved.status}`) }}
              </div>
            </div>
            <q-btn
              outline
              no-caps
              color="primary"
              :label="$t('plan.open')"
              :to="{ name: 'new-plan' }"
            />
          </q-card-section>
        </q-card>

        <TodayCard
          v-if="data.today"
          :today="data.today"
        />

        <ScheduleCard :plan="data.plan" />

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
              {{ $t('plan.seconds', { n: data.plan.solve_time_limit }) }}
            </q-item-section>
            <q-item-section side>
              <q-icon name="chevron_right" />
            </q-item-section>
          </q-item>
        </q-list>

        <SavedPlansCard
          v-if="data.results.saved.length > 0"
          :plans="data.results.saved"
          :today-id="data.today?.id ?? null"
        />

        <MaxTimeDialog
          v-model="maxTimeOpen"
          :plan="data.plan"
          @saved="data.plan = $event"
        />
      </div>
    </LoadState>

    <div class="make-plan-space" />
    <q-page-sticky
      position="bottom"
      expand
    >
      <div class="make-plan-bar full-width">
        <q-btn
          class="make-plan full-width"
          color="primary"
          unelevated
          no-caps
          :label="$t('plan.makePlan')"
          :disable="!data.plan || solve.running.value"
          @click="makePlan"
        />
      </div>
    </q-page-sticky>
  </q-page>
</template>

<style scoped>
.make-plan-space {
  height: 72px;
}
.make-plan-bar {
  padding: 12px 16px;
  background: #fff;
  border-top: 1px solid rgba(0, 0, 0, 0.12);
}
</style>
