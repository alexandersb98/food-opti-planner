<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Attribute, ClashMember, Goal, Plan } from '../api/types'
import { clashDrafts, clashErrors, clashFields, clashRows, clashServerErrors, rowsKey, type ClashMarks } from '../clash'
import type { GoalDraft } from '../composables/useGoalDraft'
import { showsReference } from '../composables/useGoalDraft'
import { dayLabel } from '../dates'
import { useSavePlan } from '../plan'

// The Plan page's No plan possible card (A5): the rules of the clash, each
// clashing Must goal with its bounds to loosen and Make Prefer, each day's
// meals with Edit schedule. Try again saves the card's changes, if any, and
// asks the page to make the plan; Dismiss closes it.
const props = defineProps<{ plan: Plan; attributes: Attribute[]; clash: readonly ClashMember[]; minimal: boolean }>()
const emit = defineEmits<{ saved: [plan: Plan]; retry: []; dismiss: [] }>()

const { t } = useI18n()
const { saving, savePlan } = useSavePlan()

const rows = computed(() => clashRows(props.clash, props.plan))
const drafts = reactive<Record<number, GoalDraft>>({})
const errors = ref<Record<number, ClashMarks>>({})
const saveFailed = ref(false)

// Starts over from the goals as stored when the clash, or a goal it shows,
// changes; another save of the setup keeps what was typed.
watch(
  [() => props.clash, () => rowsKey(rows.value)],
  () => {
    for (const id of Object.keys(drafts)) delete drafts[Number(id)]
    Object.assign(drafts, clashDrafts(rows.value))
    errors.value = {}
    saveFailed.value = false
  },
  { immediate: true },
)

function unit(goal: Goal) {
  return props.attributes.find(({ id }) => id === goal.attribute_id)?.unit ?? ''
}

function where(dates: string[]) {
  return dates.length === 0
    ? t('clash.wholePlan')
    : t('clash.onDays', { days: dates.map((date) => dayLabel(date, 0)).join(', ') })
}

async function tryAgain() {
  saveFailed.value = false
  errors.value = clashErrors(props.plan.goals, drafts, t)
  if (Object.keys(errors.value).length > 0) return
  const fields = clashFields(props.plan, drafts)
  if (fields) {
    const saved = await savePlan(fields)
    if (!saved.plan) {
      const ids = rows.value.flatMap((row) => (row.kind === 'goal' ? [row.goal.id] : []))
      errors.value = clashServerErrors(saved.errors, props.plan, props.attributes, ids, t)
      saveFailed.value = Object.keys(errors.value).length === 0
      return
    }
    emit('saved', saved.plan)
  }
  emit('retry')
}
</script>

<template>
  <q-card
    flat
    bordered
    class="clash-card"
  >
    <q-card-section
      class="q-pb-none"
      role="alert"
    >
      <h2 class="text-subtitle1 text-negative q-my-none">
        {{ $t('clash.title') }}
      </h2>
      <p
        v-if="rows.length === 0"
        class="q-mb-none q-mt-xs"
      >
        {{ $t('plan.failure.infeasible') }}
      </p>
      <p
        v-else
        class="q-mb-none q-mt-xs"
      >
        {{ $t('clash.intro') }}
      </p>
    </q-card-section>
    <q-list v-if="rows.length > 0">
      <template
        v-for="row in rows"
        :key="row.kind === 'goal' ? `goal-${row.goal.id}` : `day-${row.day}`"
      >
        <q-item
          v-if="row.kind === 'goal' && drafts[row.goal.id]"
          class="clash-goal"
        >
          <q-item-section>
            <q-item-label class="text-weight-medium">
              {{ row.goal.name }}
            </q-item-label>
            <q-item-label
              caption
              class="clash-where"
            >
              {{ where(row.dates) }}
            </q-item-label>
            <div class="row q-col-gutter-sm q-mt-xs">
              <div
                v-if="row.goal.min != null"
                class="col"
              >
                <q-input
                  v-model="drafts[row.goal.id]!.min"
                  outlined
                  dense
                  inputmode="decimal"
                  :label="$t('goals.editor.min')"
                  :suffix="unit(row.goal)"
                  :error="!!errors[row.goal.id]?.min"
                  :error-message="errors[row.goal.id]?.min"
                />
              </div>
              <div
                v-if="row.goal.max != null"
                class="col"
              >
                <q-input
                  v-model="drafts[row.goal.id]!.max"
                  outlined
                  dense
                  inputmode="decimal"
                  :label="$t('goals.editor.max')"
                  :suffix="unit(row.goal)"
                  :error="!!errors[row.goal.id]?.max"
                  :error-message="errors[row.goal.id]?.max"
                />
              </div>
            </div>
            <q-input
              v-if="showsReference(drafts[row.goal.id]!)"
              v-model="drafts[row.goal.id]!.zero_reference"
              outlined
              dense
              inputmode="decimal"
              class="zero-reference q-mt-xs"
              :label="$t('goals.editor.zeroReference')"
              :suffix="unit(row.goal)"
              :error="!!errors[row.goal.id]?.reference"
              :error-message="errors[row.goal.id]?.reference"
            />
            <div class="row items-center q-mt-xs">
              <span
                v-if="!drafts[row.goal.id]!.must"
                class="col text-caption will-be-prefer"
              >{{ $t('clash.willBePrefer') }}</span>
              <q-space v-else />
              <q-btn
                flat
                dense
                no-caps
                color="primary"
                class="make-prefer"
                :label="drafts[row.goal.id]!.must ? $t('clash.makePrefer') : $t('clash.keepMust')"
                @click="drafts[row.goal.id]!.must = !drafts[row.goal.id]!.must"
              />
            </div>
          </q-item-section>
        </q-item>
        <q-item
          v-else-if="row.kind === 'day_minimum'"
          class="clash-meals"
        >
          <q-item-section>
            <q-item-label class="text-weight-medium">
              {{ $t('clash.meals', { day: dayLabel(row.date, 0) }) }}
            </q-item-label>
            <q-item-label caption>
              {{ row.atLeast === null ? $t('clash.allPlanned') : $t('clash.atLeast', row.atLeast) }}
            </q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-btn
              flat
              dense
              no-caps
              color="primary"
              :label="$t('clash.editSchedule')"
              :to="{ name: 'schedule' }"
            />
          </q-item-section>
        </q-item>
      </template>
    </q-list>
    <q-card-section
      v-if="rows.length > 0"
      class="q-py-none text-caption text-grey-8"
    >
      {{ minimal ? $t('clash.more') : $t('clash.notMinimal') }}
    </q-card-section>
    <q-card-section
      v-if="saveFailed"
      class="q-py-none text-negative save-failed"
    >
      {{ $t('common.saveFailed') }}
    </q-card-section>
    <q-card-actions align="right">
      <q-btn
        flat
        no-caps
        color="primary"
        :label="$t('plan.dismiss')"
        @click="$emit('dismiss')"
      />
      <q-btn
        unelevated
        no-caps
        color="primary"
        class="try-again"
        :label="$t('clash.tryAgain')"
        :loading="saving"
        @click="tryAgain"
      />
    </q-card-actions>
  </q-card>
</template>

<style scoped>
.clash-card {
  border-color: var(--q-negative);
}
</style>
