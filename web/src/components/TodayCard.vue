<script setup lang="ts">
import type { TodayPlan } from '../api/types'
import { dayLabel } from '../dates'

// The Plan page's Today card (A1): today's meals from the plan used for
// today. Tapping a meal opens that plan at today, with the meal open if
// it is planned.
defineProps<{ today: TodayPlan }>()
</script>

<template>
  <q-card
    flat
    bordered
    class="today-card"
  >
    <q-card-section class="q-pb-none">
      <h2 class="text-subtitle1 q-my-none">
        {{ $t('plan.today', { day: dayLabel(today.date, 0) }) }}
      </h2>
    </q-card-section>
    <q-list>
      <q-item
        v-for="(meal, index) in today.meals"
        :key="index"
        v-ripple
        clickable
        class="today-meal"
        :to="{
          name: 'saved-plan',
          params: { id: today.id },
          query: meal.planned ? { day: today.day, meal: index } : { day: today.day },
        }"
      >
        <q-item-section>{{ meal.name }}</q-item-section>
        <q-item-section
          side
          :class="{ 'text-grey-8': !meal.planned }"
        >
          {{
            meal.planned ? $t('results.portion', { recipe: meal.recipe, portion: meal.portion }) : $t('results.skipped')
          }}
        </q-item-section>
      </q-item>
    </q-list>
  </q-card>
</template>
