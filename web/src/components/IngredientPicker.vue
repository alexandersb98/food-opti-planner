<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Ingredient } from '../api/types'
import { searchByName } from '../lists'

// "+ Add ingredient" in the recipe editor (C2): a searchable list of the
// ingredients (an ingredient may be on several lines of a recipe); picking
// one closes it.
const open = defineModel<boolean>({ required: true })
// `initialSearch` fills the search box each time the picker opens (the import
// review passes the line's food); `allowNew` adds "+ New ingredient", which
// closes the picker and says `new`.
const props = defineProps<{ ingredients: readonly Ingredient[]; initialSearch?: string; allowNew?: boolean }>()
const emit = defineEmits<{ pick: [ingredient: Ingredient]; new: [] }>()

const { t } = useI18n()
const search = ref<string | null>('')
watch(open, () => (search.value = props.initialSearch ?? ''))

const shown = computed(() => searchByName(props.ingredients, search.value))

const emptyMessage = computed(() => {
  if (props.ingredients.length === 0) return t('recipes.noIngredients')
  return t('ingredients.noMatch')
})

function askForNew() {
  emit('new')
  open.value = false
}

function pick(ingredient: Ingredient) {
  emit('pick', ingredient)
  open.value = false
}
</script>

<template>
  <q-dialog
    v-model="open"
    position="bottom"
  >
    <q-card class="picker">
      <q-card-section class="q-pb-sm">
        <div class="text-h6">
          {{ $t('recipes.addIngredient') }}
        </div>
        <q-input
          v-model="search"
          class="q-mt-sm"
          outlined
          dense
          clearable
          autofocus
          :label="$t('recipes.search')"
        >
          <template #prepend>
            <q-icon name="search" />
          </template>
        </q-input>
      </q-card-section>
      <q-list
        separator
        class="picker-list"
      >
        <q-item v-if="shown.length === 0">
          <q-item-section class="text-grey-8">
            {{ emptyMessage }}
          </q-item-section>
        </q-item>
        <q-item
          v-for="ingredient in shown"
          :key="ingredient.id"
          v-ripple
          clickable
          class="picker-row"
          @click="pick(ingredient)"
        >
          <q-item-section>{{ ingredient.name }}</q-item-section>
          <q-item-section side>
            {{ ingredient.unit }}
          </q-item-section>
        </q-item>
      </q-list>
      <q-card-actions align="right">
        <q-btn
          v-if="allowNew"
          class="new-ingredient"
          flat
          no-caps
          color="primary"
          :label="$t('recipes.newIngredient')"
          @click="askForNew"
        />
        <q-space v-if="allowNew" />
        <q-btn
          v-close-popup
          flat
          :label="$t('common.cancel')"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.picker {
  width: 100%;
  max-width: 600px;
}
.picker-list {
  max-height: 50vh;
  overflow-y: auto;
}
</style>
