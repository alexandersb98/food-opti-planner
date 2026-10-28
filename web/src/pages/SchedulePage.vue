<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import EditorHeader from '../components/EditorHeader.vue'
import LoadState from '../components/LoadState.vue'
import MealNamesDialog from '../components/MealNamesDialog.vue'
import { DAYS, useScheduleDraft } from '../composables/useScheduleDraft'

const { t } = useI18n()
const router = useRouter()

const { draft, days, errors, rows, range, loading, failed, load, saving, step, toggle, choose, setMeals, save } =
  useScheduleDraft()
const mealsOpen = ref(false)

function minimumText(minimum: number | null | undefined) {
  return minimum == null ? t('schedule.all') : String(minimum)
}

async function submit() {
  if (await save()) await router.push('/')
}

const mealsWrong = computed(() => Object.keys(errors.meals).length > 0)
const columns = computed(() => `4.2em repeat(${draft.meals.length}, minmax(0, 1fr)) 3.6em`)
</script>

<template>
  <q-page padding>
    <EditorHeader
      back="/"
      :title="$t('schedule.title')"
    />

    <LoadState
      :loading="loading"
      :failed="failed"
      :message="$t('plan.loadFailed')"
      @retry="load"
    >
      <q-form
        class="q-gutter-y-md"
        @submit="submit"
      >
        <q-input
          v-model="draft.start"
          class="start-field"
          outlined
          mask="####-##-##"
          :label="$t('schedule.starts')"
          :hint="range"
          :error="!!errors.start"
          :error-message="errors.start"
        >
          <template #append>
            <q-btn
              flat
              round
              dense
              icon="event"
              :aria-label="$t('schedule.pickDate')"
            >
              <q-popup-proxy
                cover
                transition-show="scale"
                transition-hide="scale"
              >
                <q-date
                  v-model="draft.start"
                  mask="YYYY-MM-DD"
                  :first-day-of-week="1"
                  minimal
                >
                  <div class="row justify-end">
                    <q-btn
                      v-close-popup
                      flat
                      color="primary"
                      :label="$t('common.done')"
                    />
                  </div>
                </q-date>
              </q-popup-proxy>
            </q-btn>
          </template>
        </q-input>

        <div>
          <div class="row items-center no-wrap q-gutter-x-xs">
            <div class="col text-body1">
              {{ $t('schedule.days') }}
            </div>
            <q-btn
              outline
              dense
              icon="remove"
              :disable="days <= DAYS.min"
              :aria-label="$t('schedule.fewerDays')"
              @click="step(-1)"
            />
            <q-input
              v-model="draft.daysText"
              class="days-field"
              outlined
              dense
              inputmode="numeric"
              input-class="text-center"
              :aria-label="$t('schedule.days')"
              :error="!!errors.days"
              hide-bottom-space
            />
            <q-btn
              outline
              dense
              icon="add"
              :disable="days >= DAYS.max"
              :aria-label="$t('schedule.moreDays')"
              @click="step(1)"
            />
          </div>
          <div
            v-if="errors.days"
            class="days-error text-negative text-caption text-right"
          >
            {{ errors.days }}
          </div>
        </div>

        <q-list
          bordered
          class="rounded-borders"
        >
          <q-item
            v-ripple
            clickable
            class="meals-row"
            @click="mealsOpen = true"
          >
            <q-item-section>
              <q-item-label>{{ $t('schedule.meals') }}</q-item-label>
              <q-item-label caption>
                {{ draft.meals.map((meal) => meal.name).join(', ') }}
              </q-item-label>
              <q-item-label
                v-if="mealsWrong"
                caption
                class="text-negative"
              >
                {{ $t('schedule.mealsWrong') }}
              </q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-icon name="chevron_right" />
            </q-item-section>
          </q-item>
        </q-list>
        <div class="text-caption text-grey-8 q-mt-xs">
          {{ $t('schedule.mealsHint') }}
        </div>

        <q-card
          flat
          bordered
        >
          <q-card-section class="schedule-grid">
            <div
              class="schedule-header grid-line text-caption text-grey-8"
              :style="{ gridTemplateColumns: columns }"
            >
              <span />
              <span
                v-for="meal in draft.meals"
                :key="meal.key"
                class="meal-name"
                :title="meal.name"
              >{{ meal.name }}</span>
              <span class="text-center">{{ $t('schedule.atLeast') }}</span>
            </div>
            <template
              v-for="row in rows"
              :key="row.day"
            >
              <div
                class="schedule-row grid-line"
                :style="{ gridTemplateColumns: columns }"
              >
                <span class="day-label">{{ row.label }}</span>
                <button
                  v-for="cell in row.cells"
                  :key="cell.meal.key"
                  type="button"
                  class="cell"
                  :class="cell.planned ? 'planned' : 'skipped'"
                  :aria-pressed="cell.planned"
                  :aria-label="$t('schedule.cell', { meal: cell.meal.name, day: row.label })"
                  @click="toggle(row.day, cell.meal.key)"
                >
                  {{ cell.planned ? '' : $t('schedule.skip') }}
                </button>
                <q-btn
                  outline
                  dense
                  no-caps
                  class="at-least"
                  :color="errors.minimums[row.day] ? 'negative' : 'grey-8'"
                  :label="minimumText(draft.minimums[row.day])"
                  :aria-label="$t('schedule.atLeastOn', { day: row.label })"
                >
                  <q-menu>
                    <q-list>
                      <q-item
                        v-for="choice in row.choices"
                        :key="String(choice)"
                        v-close-popup
                        clickable
                        @click="choose(row.day, choice)"
                      >
                        <q-item-section>{{ minimumText(choice) }}</q-item-section>
                      </q-item>
                    </q-list>
                  </q-menu>
                </q-btn>
              </div>
              <div
                v-if="errors.minimums[row.day]"
                class="schedule-row-error text-negative text-caption"
              >
                {{ row.label }}: {{ errors.minimums[row.day] }}
              </div>
            </template>
          </q-card-section>
        </q-card>

        <div class="legend text-caption text-grey-8">
          <div class="row items-center q-gutter-x-sm">
            <span class="swatch planned" /><span>{{ $t('schedule.legendPlanned') }}</span>
          </div>
          <div class="row items-center q-gutter-x-sm">
            <span class="swatch skipped" /><span>{{ $t('schedule.legendSkipped') }}</span>
          </div>
          <div>{{ $t('schedule.legendTap') }}</div>
        </div>

        <div
          v-if="errors.save"
          class="text-negative"
          role="alert"
        >
          {{ errors.save }}
        </div>
        <q-btn
          class="full-width"
          type="submit"
          color="primary"
          :label="$t('common.save')"
          :loading="saving"
        />
      </q-form>
    </LoadState>

    <MealNamesDialog
      v-model="mealsOpen"
      :meals="draft.meals"
      :errors="errors.meals"
      @done="setMeals"
    />
  </q-page>
</template>

<style scoped>
.days-field {
  width: 4em;
}
.grid-line {
  display: grid;
  gap: 6px;
  align-items: center;
}
.schedule-header {
  padding-bottom: 6px;
}
.schedule-row {
  padding: 3px 0;
}
.meal-name {
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.day-label {
  white-space: nowrap;
}
.cell,
.swatch {
  border-radius: 8px;
  box-sizing: border-box;
}
.cell {
  height: 40px;
  min-width: 0;
  padding: 0;
  overflow: hidden;
  font-size: 12px;
  cursor: pointer;
}
.planned {
  background: #1c1c1a;
  border: none;
}
.skipped {
  background: #fff;
  color: #5e5e59;
  border: 1.5px dashed #8a8a84;
}
.at-least {
  height: 40px;
}
.swatch {
  display: inline-block;
  width: 22px;
  height: 14px;
  border-radius: 4px;
}
</style>
