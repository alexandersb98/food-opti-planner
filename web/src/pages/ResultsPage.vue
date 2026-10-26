<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api/client'
import type { PlanResult, TodayPlan } from '../api/types'
import ConfirmDelete from '../components/ConfirmDelete.vue'
import DayCarousel from '../components/DayCarousel.vue'
import EditorHeader from '../components/EditorHeader.vue'
import LoadState from '../components/LoadState.vue'
import SummaryCard from '../components/SummaryCard.vue'
import { useLoad } from '../composables/useLoad'
import { dateRange, daysBetween, localDate } from '../dates'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

// The results page (R1): the unsaved plan (/plans/new) or a saved one,
// with its Summary and days. The unsaved plan can be saved or discarded,
// a saved one used for today or deleted; each of those but Use for today
// returns to the Plan page.
const id = route.params.id === undefined ? null : Number(route.params.id)
const todayDate = localDate()

const { data, loading, failed, load } = useLoad(
  async () => {
    let shownId = id
    if (shownId === null) {
      const { data: results } = await api.GET('/api/plan-results')
      if (!results?.unsaved) return {}
      shownId = results.unsaved.id
    }
    const [shown, today] = await Promise.all([
      api.GET('/api/plan-results/{plan_id}', { params: { path: { plan_id: shownId } } }),
      api.GET('/api/plan-results/today', { params: { query: { date: todayDate } } }),
    ])
    if (!shown.data || today.data === undefined) return {}
    return { data: { plan: shown.data, today: today.data } }
  },
  { plan: null as PlanResult | null, today: null as TodayPlan | null },
)

const plan = computed(() => data.value.plan)

/** Today's day in the plan, or null when the plan doesn't cover today. */
const todayIndex = computed(() => {
  if (!plan.value) return null
  const index = daysBetween(plan.value.start_date, todayDate)
  return index >= 0 && index < plan.value.days ? index : null
})

/** A whole number from the route's query below `below`, if it is one. */
function queryIndex(name: string, below: number) {
  const text = route.query[name]
  const index = typeof text === 'string' && /^\d+$/.test(text) ? Number(text) : null
  return index !== null && index < below ? index : null
}

const initialDay = computed(() => (plan.value ? (queryIndex('day', plan.value.days) ?? todayIndex.value ?? 0) : 0))
const initialMeal = computed(() => queryIndex('meal', plan.value?.meals[initialDay.value]?.length ?? 0))

const canUseForToday = computed(
  () => !!plan.value?.saved && todayIndex.value !== null && data.value.today?.id !== plan.value.id,
)

const busy = ref(false)
const error = ref('')
const discardOpen = ref(false)
const deleteOpen = ref(false)

/** Call the server with the plan's id; true when it answered OK. */
async function act(call: (planId: number) => Promise<{ response: Response }>, failure: string) {
  if (!plan.value) return false
  error.value = ''
  busy.value = true
  try {
    const { response } = await call(plan.value.id)
    if (response.ok) return true
  } catch {
    // failed below
  } finally {
    busy.value = false
  }
  error.value = failure
  return false
}

const path = (planId: number) => ({ params: { path: { plan_id: planId } } })

async function save() {
  if (await act((planId) => api.POST('/api/plan-results/{plan_id}/save', path(planId)), t('common.saveFailed')))
    await router.replace('/')
}

async function useForToday() {
  const used = await act(
    (planId) => api.POST('/api/plan-results/{plan_id}/use-for-today', path(planId)),
    t('common.saveFailed'),
  )
  if (used && plan.value && todayIndex.value !== null)
    data.value.today = { id: plan.value.id, day: todayIndex.value, date: todayDate, meals: [] }
}

async function remove() {
  discardOpen.value = false
  deleteOpen.value = false
  if (await act((planId) => api.DELETE('/api/plan-results/{plan_id}', path(planId)), t('common.deleteFailed')))
    await router.replace('/')
}
</script>

<template>
  <q-page padding>
    <EditorHeader
      back="/"
      :title="plan ? dateRange(plan.start_date, plan.days) : ''"
    />

    <LoadState
      :loading="loading"
      :failed="failed"
      :message="$t('results.loadFailed')"
      @retry="load"
    >
      <div
        v-if="plan"
        class="q-gutter-y-md"
      >
        <div class="plan-status text-grey-8">
          {{ $t(`results.status.${plan.status}`) }}
        </div>

        <SummaryCard :plan="plan" />

        <DayCarousel
          :plan="plan"
          :today="todayIndex"
          :initial-day="initialDay"
          :initial-meal="initialMeal"
        />

        <div
          v-if="error"
          class="text-negative"
          role="alert"
        >
          {{ error }}
        </div>
        <div
          v-if="plan.saved"
          class="row q-gutter-sm"
        >
          <q-btn
            class="col"
            outline
            color="negative"
            :label="$t('common.delete')"
            :disable="busy"
            @click="deleteOpen = true"
          />
          <q-btn
            v-if="canUseForToday"
            class="col"
            color="primary"
            :label="$t('results.useForToday')"
            :loading="busy"
            @click="useForToday"
          />
        </div>
        <div
          v-else
          class="row q-gutter-sm"
        >
          <q-btn
            class="col"
            outline
            color="negative"
            :label="$t('results.discard')"
            :disable="busy"
            @click="discardOpen = true"
          />
          <q-btn
            class="col"
            color="primary"
            :label="$t('common.save')"
            :loading="busy"
            @click="save"
          />
        </div>
      </div>
    </LoadState>

    <q-dialog v-model="discardOpen">
      <q-card>
        <q-card-section>
          <div class="text-h6">
            {{ $t('results.discardTitle') }}
          </div>
          <p class="q-mb-none q-mt-sm">
            {{ $t('results.cannotUndo') }}
          </p>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn
            v-close-popup
            flat
            :label="$t('common.cancel')"
          />
          <q-btn
            flat
            color="negative"
            :label="$t('results.discard')"
            @click="remove"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
    <ConfirmDelete
      v-model="deleteOpen"
      :name="plan ? dateRange(plan.start_date, plan.days) : ''"
      :warning="$t('results.cannotUndo')"
      @confirm="remove"
    />
  </q-page>
</template>

<style scoped>
.plan-status {
  margin-top: -12px;
  padding-left: 40px;
}
</style>
