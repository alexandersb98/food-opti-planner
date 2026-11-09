<script setup lang="ts">
import { inject } from 'vue'
import type { Ingredient } from '../api/types'
import type { DraftLine, DraftSection } from '../composables/useRecipeDraft'
import { importReviewKey } from '../importReview'
import ImportLineReview from './ImportLineReview.vue'
import LineUnitPicker from './LineUnitPicker.vue'

// One section of the recipe editor (C2): an optional heading, its lines (an
// amount of an ingredient each, with a menu to move the line to another
// section) and "+ Add ingredient". One unnamed section shows no heading, so
// a simple recipe looks as it always did. Edits the section's name and the
// lines' amounts and units in place; "New unit…" on a line is passed up with
// the line, as the page adds the conversion.
const section = defineModel<DraftSection>('section', { required: true })
const props = defineProps<{
  index: number
  count: number // the sections in the recipe
  ingredients: ReadonlyMap<number, Ingredient>
  // By line key; `units` marks a line whose unit doesn't convert.
  errors: { name: string; amounts: Partial<Record<number, string>>; units?: Partial<Record<number, true>> }
  others: { index: number; label: string }[] // where a line can move to
}>()
defineEmits<{
  add: []
  removeLine: [index: number]
  move: [index: number, to: number]
  newUnit: [index: number]
  removeSection: []
}>()

// Provided by the page only while an imported recipe is under review.
const review = inject(importReviewKey, null)

/** The ingredient of a line; none for an imported line not matched yet. */
function ingredientOf(item: DraftLine): Ingredient | undefined {
  return item.ingredientId === null ? undefined : props.ingredients.get(item.ingredientId)
}

/** What a line's review wrapper shows. */
function reviewProps(item: DraftLine) {
  const ingredient = ingredientOf(item)
  return {
    line: item,
    ingredient,
    state: review!.state(item),
    ownUnit: ingredient?.unit ?? '',
    factor: review!.factor(item),
  }
}

/** What a line's review wrapper asks for, with the line's place. */
function reviewEvents(lineIndex: number) {
  const at = props.index
  return {
    pick: () => review!.pick(at, lineIndex),
    skip: () => review!.skip(at, lineIndex),
    unskip: () => review!.unskip(at, lineIndex),
    accept: (text: string) => review!.accept(at, lineIndex, text),
    change: () => review!.change(at, lineIndex),
    'factor-input': (text: string) => review!.factorInput(at, lineIndex, text),
  }
}
</script>

<template>
  <div class="recipe-section q-gutter-y-sm">
    <q-input
      v-if="count > 1 || section.name !== ''"
      v-model="section.name"
      class="section-name"
      outlined
      dense
      :aria-label="$t('recipes.sectionName')"
      :placeholder="$t('recipes.sectionName')"
      :error="!!errors.name"
      :error-message="errors.name"
      hide-bottom-space
    />
    <component
      :is="review ? ImportLineReview : 'div'"
      v-for="(item, lineIndex) in section.items"
      :key="item.key"
      class="recipe-item"
      v-bind="review ? reviewProps(item) : {}"
      v-on="review ? reviewEvents(lineIndex) : {}"
    >
      <div class="row items-start no-wrap q-gutter-x-sm">
        <div class="col item-name">
          {{ ingredientOf(item)?.name ?? item.food }}
        </div>
        <q-input
          v-model="item.amount"
          class="amount-field"
          outlined
          dense
          inputmode="decimal"
          :disable="review?.state(item) === 'skipped'"
          :aria-label="$t('recipes.amountOf', { name: ingredientOf(item)?.name ?? item.food })"
          :error="!!errors.amounts[item.key]"
          :error-message="errors.amounts[item.key]"
          hide-bottom-space
        />
        <LineUnitPicker
          v-if="ingredientOf(item)"
          v-model="item.unit"
          :ingredient="ingredientOf(item)!"
          :name="ingredientOf(item)!.name"
          :error="!!errors.units?.[item.key]"
          :disable="review?.state(item) === 'skipped'"
          @new-unit="$emit('newUnit', lineIndex)"
        />
        <q-btn
          v-if="others.length > 0"
          flat
          round
          dense
          icon="more_vert"
          :aria-label="$t('recipes.lineMenu', { name: ingredientOf(item)?.name })"
        >
          <q-menu>
            <q-list>
              <q-item
                v-for="other in others"
                :key="other.index"
                v-close-popup
                clickable
                class="move-to"
                @click="$emit('move', lineIndex, other.index)"
              >
                <q-item-section>{{ $t('recipes.moveTo', { section: other.label }) }}</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
        <q-btn
          flat
          round
          dense
          icon="close"
          :aria-label="$t('recipes.remove', { name: ingredientOf(item)?.name })"
          @click="$emit('removeLine', lineIndex)"
        />
      </div>
      <div
        v-if="errors.units?.[item.key]"
        class="unit-error text-negative text-caption"
      >
        {{ $t('recipes.unitNotConvertible', { unit: item.unit, name: ingredientOf(item)?.name }) }}
      </div>
    </component>
    <div class="row items-center q-gutter-x-sm">
      <q-btn
        flat
        no-caps
        color="primary"
        :label="$t('recipes.addIngredientButton')"
        @click="$emit('add')"
      />
      <q-btn
        v-if="count > 1"
        flat
        no-caps
        color="negative"
        :label="$t('recipes.removeSection')"
        @click="$emit('removeSection')"
      />
    </div>
  </div>
</template>

<style scoped>
.item-name {
  padding-top: 8px;
  overflow-wrap: anywhere;
}
.amount-field {
  width: 8.5em;
}
</style>
