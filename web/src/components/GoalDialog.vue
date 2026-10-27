<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Attribute, Goal, GoalFields, Plan } from '../api/types'
import { goalNames, guardRailImportance, IMPORTANCE, NAME_LENGTH, needsZeroReference } from '../goals'
import { typedNumber } from '../numbers'
import { goalFields, planFields, useSavePlan } from '../plan'

// The goal editor on the Plan page (A3), a bottom sheet: a goal's main form
// and its Advanced section (A3b), opened for a new goal or to change or delete
// `goal`. Saved by sending the whole setup with the goal added, changed or
// removed, as Max solving time does.
const open = defineModel<boolean>({ required: true })
const props = defineProps<{ plan: Plan; attributes: Attribute[]; goal: Goal | null }>()
const emit = defineEmits<{ saved: [plan: Plan] }>()

const { t } = useI18n()

// The fields as typed: the bounds, the reference and the name stay text.
// Settings the form hides keep their value here and are sent as defaults.
const draft = reactive({
  attribute_id: 0,
  min: '',
  max: '',
  applies_to: 'day' as Goal['applies_to'],
  must: false,
  importance: IMPORTANCE.default,
  zero_reference: '',
  // The typed name; empty while the name follows the generated one.
  name: '',
  split: false,
  importance_below: IMPORTANCE.default,
  importance_above: IMPORTANCE.default,
  day_guard_rail: true,
  // null while it follows the goal's importance (`guardRailImportance`).
  guard_rail_importance: null as number | null,
})
const noErrors = { attribute: '', min: '', max: '', reference: '', name: '', below: '', above: '', guardRail: '', save: '' }
const errors = reactive({ ...noErrors })
const { saving, savePlan } = useSavePlan()
const advanced = ref(false)
// Whether the name field shows the generated name: until the user types in
// it, and again once it is left empty.
const nameFollows = ref(true)

watch(open, (isOpen) => {
  if (!isOpen) return
  const { goal } = props
  Object.assign(draft, {
    attribute_id: goal?.attribute_id ?? props.attributes[0]?.id ?? 0,
    min: goal?.min ?? '',
    max: goal?.max ?? '',
    applies_to: goal?.applies_to ?? 'day',
    must: goal?.must ?? false,
    importance: goal?.importance ?? IMPORTANCE.default,
    zero_reference: goal?.zero_reference ?? '',
    name: goal?.custom_name ?? '',
    split: goal?.importance_below != null || goal?.importance_above != null,
    importance_below: goal?.importance_below ?? goal?.importance ?? IMPORTANCE.default,
    importance_above: goal?.importance_above ?? goal?.importance ?? IMPORTANCE.default,
    day_guard_rail: goal?.day_guard_rail ?? true,
    guard_rail_importance: goal?.guard_rail_importance ?? null,
  })
  nameFollows.value = !goal?.custom_name
  // Open for a goal with advanced settings (the server keeps only those that apply).
  advanced.value = !!goal && (draft.name !== '' || draft.split || !draft.day_guard_rail || draft.guard_rail_importance !== null)
  clearErrors()
})

function clearErrors() {
  Object.assign(errors, noErrors)
}

const attribute = computed(() => props.attributes.find(({ id }) => id === draft.attribute_id))
const unit = computed(() => attribute.value?.unit ?? '')

const appliesToOptions = (['day', 'plan_total', 'daily_average'] as const).map((value) => ({
  value,
  label: t(`goals.editor.scope.${value}`),
}))
const strictnessOptions = [
  { value: true, label: t('goals.must') },
  { value: false, label: t('goals.prefer') },
]

/** A bound as typed, for the rule on the zero-bound field: null if empty. */
function bound(text: string) {
  return text.trim() === '' ? null : text
}

const showReference = computed(() =>
  needsZeroReference({ ...draft, min: bound(draft.min), max: bound(draft.max) }),
)

/** The name the goal gets while it follows: generated, numbered among the
 * plan's goals with this one in its place, or last when new. */
const generatedName = computed(() => {
  const goals = props.plan.goals.map(({ attribute_id, applies_to, custom_name }) => ({ attribute_id, applies_to, custom_name }))
  const own = { attribute_id: draft.attribute_id, applies_to: draft.applies_to, custom_name: null }
  if (props.goal) goals[index.value] = own
  else goals.push(own)
  return goalNames(goals, props.attributes)[index.value]
})

const nameShown = computed(() => (nameFollows.value ? generatedName.value : draft.name))

/** The typed name, trimmed, or null while the name follows. */
const customName = computed(() => (nameFollows.value || draft.name.trim() === '' ? null : draft.name.trim()))

function typeName(text: string | number | null) {
  draft.name = String(text ?? '')
  nameFollows.value = false
}

/** Leaving the name empty goes back to the generated one. */
function leaveName() {
  if (draft.name.trim() === '') nameFollows.value = true
}

/** Importance below and above: for a Prefer goal with both bounds. */
const showSplit = computed(() => !draft.must && bound(draft.min) !== null && bound(draft.max) !== null)
const split = computed(() => showSplit.value && draft.split)

/** Turned on, both sides start at the goal's importance. */
function setSplit(on: boolean) {
  draft.split = on
  if (on) Object.assign(draft, { importance_below: draft.importance, importance_above: draft.importance })
}

/** The day guard-rail: for a daily average. */
const showGuardRail = computed(() => draft.applies_to === 'daily_average')
const guardRail = computed(() => !showGuardRail.value || draft.day_guard_rail)

const guardRailShown = computed(() =>
  guardRailImportance({
    ...draft,
    importance_below: split.value ? draft.importance_below : null,
    importance_above: split.value ? draft.importance_above : null,
  }),
)

/** The reference typed, if a number above 0. */
const reference = computed(() => {
  const number = typedNumber(draft.zero_reference)
  return number !== null && Number(number) > 0 ? number : null
})

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

/** The goal's fields as the server takes them, or null with the errors marked. */
function fields(): GoalFields | null {
  const min = typedNumber(draft.min)
  const max = typedNumber(draft.max)
  clearErrors()
  errors.min = bound(draft.min) !== null && min === null ? t('goals.editor.notNumber') : ''
  errors.max = bound(draft.max) !== null && max === null ? t('goals.editor.notNumber') : ''
  if (!errors.min && !errors.max && min === null && max === null) errors.min = t('goals.editor.needBound')
  if (showReference.value && reference.value === null) errors.reference = t('goals.editor.referenceNeeded')
  if (errors.min || errors.max || errors.reference) return null
  return {
    id: props.goal?.id ?? null,
    attribute_id: draft.attribute_id,
    min,
    max,
    applies_to: draft.applies_to,
    must: draft.must,
    importance: draft.importance,
    zero_reference: showReference.value ? reference.value : null,
    custom_name: customName.value,
    importance_below: split.value ? draft.importance_below : null,
    importance_above: split.value ? draft.importance_above : null,
    day_guard_rail: guardRail.value,
    guard_rail_importance: showGuardRail.value && guardRail.value ? draft.guard_rail_importance : null,
  }
}

/** `index` is where the goal is among `goals`, or null when none is to be marked. */
async function send(goals: GoalFields[], index: number | null) {
  const saved = await savePlan({ ...planFields(props.plan), goals })
  if (saved.plan) {
    emit('saved', saved.plan)
    open.value = false
  } else if (index === null) errors.save = t('common.saveFailed')
  else markServerErrors(saved.errors, index)
}

/** Mark what the server refused on the goal at `index` of the goals sent. */
function markServerErrors(found: Partial<Record<string, string>>, index: number) {
  const at = (field: string) => found[`goals.${index}.${field}`]
  const decimals = attribute.value?.decimals ?? 0
  const tooMany = t('goals.editor.tooManyDecimals', { n: decimals, attribute: attribute.value?.name ?? '' })
  errors.attribute = at('attribute_id') ? t('goals.editor.unknownAttribute') : ''
  errors.min =
    at('min') === 'no_bound'
      ? t('goals.editor.needBound')
      : at('min') === 'min_above_max'
        ? t('goals.editor.minAboveMax')
        : at('min') === 'too_many_decimals'
          ? tooMany
          : at('min')
            ? t('goals.editor.notNumber')
            : ''
  errors.max = at('max') === 'too_many_decimals' ? tooMany : at('max') ? t('goals.editor.notNumber') : ''
  errors.reference = at('zero_reference') ? t('goals.editor.referenceNeeded') : ''
  errors.name =
    at('custom_name') === 'duplicate'
      ? t('goals.editor.nameInUse')
      : at('custom_name')
        ? t('goals.editor.nameTooLong', { n: NAME_LENGTH })
        : ''
  const importance = (field: string) => (at(field) ? t('goals.editor.importanceInvalid', IMPORTANCE) : '')
  errors.below = importance('importance_below')
  errors.above = importance('importance_above')
  errors.guardRail = at('day_guard_rail') ? t('goals.editor.settingRefused') : importance('guard_rail_importance')
  const advancedMarked = errors.name || errors.below || errors.above || errors.guardRail
  if (advancedMarked) advanced.value = true
  const marked = errors.attribute || errors.min || errors.max || errors.reference || advancedMarked
  errors.save = marked ? '' : t('common.saveFailed')
}

/** Where the goal is among the goals sent: its place, or last when new. */
const index = computed(() => {
  const place = props.plan.goals.findIndex(({ id }) => id === props.goal?.id)
  return place < 0 ? props.plan.goals.length : place
})

async function save() {
  const goal = fields()
  if (!goal) return
  const goals = props.plan.goals.map(goalFields)
  if (props.goal) goals[index.value] = goal
  else goals.push(goal)
  await send(goals, index.value)
}

async function remove() {
  errors.save = ''
  await send(props.plan.goals.filter(({ id }) => id !== props.goal?.id).map(goalFields), null)
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
