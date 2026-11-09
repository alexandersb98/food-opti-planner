<script setup lang="ts">
import type { Ingredient } from '../api/types'
import type { DraftSection } from '../composables/useRecipeDraft'

// One section of the recipe editor (C2): an optional heading, its lines (an
// amount of an ingredient each, with a menu to move the line to another
// section) and "+ Add ingredient". One unnamed section shows no heading, so
// a simple recipe looks as it always did. Edits the section's name and the
// lines' amounts in place.
const section = defineModel<DraftSection>('section', { required: true })
defineProps<{
  index: number
  count: number // the sections in the recipe
  ingredients: ReadonlyMap<number, Ingredient>
  errors: { name: string; amounts: Partial<Record<number, string>> }
  others: { index: number; label: string }[] // where a line can move to
}>()
defineEmits<{
  add: []
  removeLine: [index: number]
  move: [index: number, to: number]
  removeSection: []
}>()
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
    <div
      v-for="(item, lineIndex) in section.items"
      :key="item.key"
      class="row items-start no-wrap q-gutter-x-sm recipe-item"
    >
      <div class="col item-name">
        {{ ingredients.get(item.ingredientId)?.name }}
      </div>
      <q-input
        v-model="item.amount"
        class="amount-field"
        outlined
        dense
        inputmode="decimal"
        :aria-label="$t('recipes.amountOf', { name: ingredients.get(item.ingredientId)?.name })"
        :suffix="ingredients.get(item.ingredientId)?.unit"
        :error="!!errors.amounts[item.key]"
        :error-message="errors.amounts[item.key]"
        hide-bottom-space
      />
      <q-btn
        v-if="others.length > 0"
        flat
        round
        dense
        icon="more_vert"
        :aria-label="$t('recipes.lineMenu', { name: ingredients.get(item.ingredientId)?.name })"
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
        :aria-label="$t('recipes.remove', { name: ingredients.get(item.ingredientId)?.name })"
        @click="$emit('removeLine', lineIndex)"
      />
    </div>
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
