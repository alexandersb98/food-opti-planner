<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Attribute, Goal, Plan } from '../api/types'
import { useGoalDraft } from '../composables/useGoalDraft'
import { IMPORTANCE, NAME_LENGTH } from '../goals'

// The goal editor on the Plan page (A3), a bottom sheet: a goal's main form
// and its Advanced section (A3b), opened for a new goal or to change or delete
// `goal`. Saved by sending the whole setup with the goal added, changed or
// removed, as Max solving time does. Its draft and rules are `useGoalDraft`'s.
const open = defineModel<boolean>({ required: true })
const props = defineProps<{ plan: Plan; attributes: Attribute[]; goal: Goal | null }>()
const emit = defineEmits<{ saved: [plan: Plan] }>()

const { t } = useI18n()
const {
  draft,
  errors,
  saving,
  advanced,
  nameFollows,
  fill,
  unit,
  reference,
  showReference,
  generatedName,
  nameShown,
  typeName,
  leaveName,
  showSplit,
  split,
  setSplit,
  showGuardRail,
  guardRailShown,
  save: saveGoal,
  remove: removeGoal,
} = useGoalDraft(props)

watch(open, (isOpen) => {
  if (isOpen) fill()
})

const appliesToOptions = (['day', 'plan_total', 'daily_average'] as const).map((value) => ({
  value,
  label: t(`goals.editor.scope.${value}`),
}))
const strictnessOptions = [
  { value: true, label: t('goals.must') },
  { value: false, label: t('goals.prefer') },
]

/** "With 25 g, missing by 5 g counts as 20%." (a fifth of the reference). */
const example = computed(() => {
  if (reference.value === null) return ''
  const miss = Number((Number(reference.value) / 5).toPrecision(6))
  return t('goals.editor.zeroExample', {
    reference: Number(reference.value),
    miss,
    unit: unit.value,
    percent: 20,
  })
})

/** Saved, the editor closes and hands on the saved setup. */
function close(saved: Plan | null) {
  if (!saved) return
  emit('saved', saved)
  open.value = false
}

async function save() {
  close(await saveGoal())
}

async function remove() {
  close(await removeGoal())
}
</script>

<template>
  <q-dialog
    v-model="open"
    position="bottom"
  >
    <q-card class="goal-dialog">
      <q-form @submit="save">
        <q-card-section class="q-gutter-y-sm">
          <div class="text-h6">
            {{ goal ? $t('goals.editor.editTitle') : $t('goals.editor.addTitle') }}
          </div>
          <q-select
            v-model="draft.attribute_id"
            outlined
            emit-value
            map-options
            option-value="id"
            option-label="name"
            :options="attributes"
            :label="$t('goals.editor.attribute')"
            :error="!!errors.attribute"
            :error-message="errors.attribute"
          />
          <div class="row q-col-gutter-sm">
            <div class="col">
              <q-input
                v-model="draft.min"
                outlined
                inputmode="decimal"
                :label="$t('goals.editor.min')"
                :suffix="unit"
                :error="!!errors.min"
                :error-message="errors.min"
              />
            </div>
            <div class="col">
              <q-input
                v-model="draft.max"
                outlined
                inputmode="decimal"
                :label="$t('goals.editor.max')"
                :suffix="unit"
                :error="!!errors.max"
                :error-message="errors.max"
              />
            </div>
          </div>
          <div v-if="showReference">
            <q-input
              v-model="draft.zero_reference"
              outlined
              inputmode="decimal"
              class="zero-reference"
              :label="$t('goals.editor.zeroReference')"
              :suffix="unit"
              :error="!!errors.reference"
              :error-message="errors.reference"
              :hint="example"
            />
          </div>
          <div>
            <div class="text-caption text-grey-8">
              {{ $t('goals.editor.appliesTo') }}
            </div>
            <q-btn-toggle
              v-model="draft.applies_to"
              no-caps
              unelevated
              toggle-color="primary"
              :options="appliesToOptions"
            />
          </div>
          <div>
            <div class="text-caption text-grey-8">
              {{ $t('goals.editor.strictness') }}
            </div>
            <q-btn-toggle
              v-model="draft.must"
              no-caps
              unelevated
              toggle-color="primary"
              :options="strictnessOptions"
            />
          </div>
          <div v-if="!draft.must">
            <div class="text-caption text-grey-8">
              {{ $t('goals.editor.importance') }}
            </div>
            <div
              v-if="split"
              class="split-set"
            >
              {{ $t('goals.editor.splitSet') }}
            </div>
            <q-slider
              v-else
              v-model="draft.importance"
              markers
              snap
              :min="IMPORTANCE.min"
              :max="IMPORTANCE.max"
              :aria-label="$t('goals.editor.importance')"
            />
          </div>
          <q-expansion-item
            v-model="advanced"
            dense
            header-class="q-px-none text-grey-8"
            :label="$t('goals.editor.advanced')"
          >
            <div class="q-gutter-y-sm q-pt-sm">
              <q-input
                :model-value="nameShown"
                outlined
                :maxlength="nameFollows ? undefined : NAME_LENGTH"
                :placeholder="generatedName"
                :label="$t('goals.editor.name')"
                :error="!!errors.name"
                :error-message="errors.name"
                @update:model-value="typeName"
                @blur="leaveName"
              />
              <div v-if="showSplit">
                <q-toggle
                  :model-value="draft.split"
                  :label="$t('goals.editor.split')"
                  @update:model-value="setSplit"
                />
                <template v-if="draft.split">
                  <div class="text-caption text-grey-8">
                    {{ $t('goals.editor.below') }}
                  </div>
                  <q-slider
                    v-model="draft.importance_below"
                    markers
                    snap
                    :min="IMPORTANCE.min"
                    :max="IMPORTANCE.max"
                    :aria-label="$t('goals.editor.below')"
                  />
                  <div
                    v-if="errors.below"
                    class="text-caption text-negative"
                  >
                    {{ errors.below }}
                  </div>
                  <div class="text-caption text-grey-8">
                    {{ $t('goals.editor.above') }}
                  </div>
                  <q-slider
                    v-model="draft.importance_above"
                    markers
                    snap
                    :min="IMPORTANCE.min"
                    :max="IMPORTANCE.max"
                    :aria-label="$t('goals.editor.above')"
                  />
                  <div
                    v-if="errors.above"
                    class="text-caption text-negative"
                  >
                    {{ errors.above }}
                  </div>
                </template>
              </div>
              <div v-if="showGuardRail">
                <q-toggle
                  v-model="draft.day_guard_rail"
                  :label="$t('goals.editor.guardRail')"
                />
                <template v-if="draft.day_guard_rail">
                  <div class="text-caption text-grey-8">
                    {{ $t('goals.editor.guardRailImportance') }}
                  </div>
                  <q-slider
                    :model-value="guardRailShown"
                    markers
                    snap
                    :min="IMPORTANCE.min"
                    :max="IMPORTANCE.max"
                    :aria-label="$t('goals.editor.guardRailImportance')"
                    @update:model-value="draft.guard_rail_importance = $event"
                  />
                </template>
                <div
                  v-if="errors.guardRail"
                  class="text-caption text-negative"
                >
                  {{ errors.guardRail }}
                </div>
              </div>
            </div>
          </q-expansion-item>
          <div
            v-if="errors.save"
            class="text-negative"
            role="alert"
          >
            {{ errors.save }}
          </div>
        </q-card-section>
        <q-card-actions>
          <q-btn
            v-if="goal"
            flat
            color="negative"
            :label="$t('common.delete')"
            :disable="saving"
            @click="remove"
          />
          <q-space />
          <q-btn
            flat
            :label="$t('common.cancel')"
            @click="open = false"
          />
          <q-btn
            flat
            type="submit"
            color="primary"
            :label="$t('common.save')"
            :loading="saving"
          />
        </q-card-actions>
      </q-form>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.goal-dialog {
  width: 100%;
  max-width: 480px;
}
</style>
