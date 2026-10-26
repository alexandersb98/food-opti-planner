<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Attribute, Goal } from '../api/types'
import { IMPORTANCE, rangeText, scopeText } from '../goals'

// The Plan page's Goals card (A1): a row per goal with its attribute, range,
// scope and a chip, "Must" or "Prefer" with its importance as dots (or its
// importance below / above), each row opening the goal editor, and "+ Add
// goal" at the end. A goal with a typed name has it as the row's title, the
// attribute then leading the range.
const props = defineProps<{ goals: Goal[]; attributes: Attribute[] }>()
defineEmits<{ edit: [goal: Goal]; add: [] }>()

const { t } = useI18n()

function attributeOf(goal: Goal) {
  return props.attributes.find(({ id }) => id === goal.attribute_id)
}

function range(goal: Goal) {
  const text = rangeText(goal.min ?? null, goal.max ?? null, attributeOf(goal)?.unit ?? '', t)
  return goal.custom_name ? t('goals.attributeRange', { attribute: attributeOf(goal)?.name ?? '', range: text }) : text
}

/** A Prefer goal's importance below and above the range, if it has its own. */
function split(goal: Goal): [number, number] | null {
  if (goal.must || (goal.importance_below == null && goal.importance_above == null)) return null
  return [goal.importance_below ?? goal.importance, goal.importance_above ?? goal.importance]
}
</script>

<template>
  <q-card
    flat
    bordered
    class="goals-card"
  >
    <q-card-section class="q-pb-none">
      <h2 class="text-subtitle1 q-my-none">
        {{ $t('goals.title') }}
      </h2>
    </q-card-section>
    <q-list>
      <q-item
        v-for="goal in goals"
        :key="goal.id"
        v-ripple
        clickable
        class="goal-row"
        @click="$emit('edit', goal)"
      >
        <q-item-section>
          <q-item-label>{{ goal.custom_name ?? attributeOf(goal)?.name }}</q-item-label>
          <q-item-label
            caption
            class="goal-range"
          >
            {{ range(goal) }}
          </q-item-label>
          <q-item-label
            caption
            class="goal-scope"
          >
            {{ $t(scopeText(goal.applies_to)) }}
          </q-item-label>
        </q-item-section>
        <q-item-section side>
          <q-chip
            dense
            :color="goal.must ? 'primary' : undefined"
            :text-color="goal.must ? 'white' : undefined"
            class="goal-chip"
          >
            <template v-if="goal.must">
              {{ $t('goals.must') }}
            </template>
            <template v-else>
              {{ $t('goals.prefer') }}
              <span
                v-if="split(goal)"
                class="importance-split q-ml-sm"
                role="img"
                :aria-label="
                  $t('goals.importanceSplit', { below: split(goal)![0], above: split(goal)![1], max: IMPORTANCE.max })
                "
              >
                <template
                  v-for="(level, side) in split(goal)"
                  :key="side"
                >
                  <span
                    v-if="side > 0"
                    class="q-mx-xs"
                  >/</span>
                  <span class="importance">
                    <span
                      v-for="n in IMPORTANCE.max"
                      :key="n"
                      class="importance-dot"
                      :class="{ filled: n <= level }"
                    />
                  </span>
                </template>
              </span>
              <span
                v-else
                class="importance q-ml-sm"
                role="img"
                :aria-label="$t('goals.importanceOf', { n: goal.importance, max: IMPORTANCE.max })"
              >
                <span
                  v-for="n in IMPORTANCE.max"
                  :key="n"
                  class="importance-dot"
                  :class="{ filled: n <= goal.importance }"
                />
              </span>
            </template>
          </q-chip>
        </q-item-section>
      </q-item>
    </q-list>
    <q-card-actions>
      <q-btn
        flat
        no-caps
        color="primary"
        class="add-goal"
        :label="$t('goals.add')"
        :disable="attributes.length === 0"
        @click="$emit('add')"
      />
      <span
        v-if="attributes.length === 0"
        class="text-caption text-grey-8"
      >
        {{ $t('goals.addAttributeFirst') }}
      </span>
    </q-card-actions>
  </q-card>
</template>

<style scoped>
.importance,
.importance-split {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.importance-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  box-sizing: border-box;
  border: 1px solid currentColor;
}
.importance-dot.filled {
  background: currentColor;
}
</style>
