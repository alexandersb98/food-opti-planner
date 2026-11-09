<script setup lang="ts">
import type { Ingredient } from '../api/types'
import IngredientForm from './IngredientForm.vue'

// The ordinary form for a new ingredient (C4) in a dialog, for the import
// review's "+ New ingredient": the name starts as the line's food. It closes
// as soon as the ingredient is saved, and says which. The form is mounted
// fresh each time the dialog opens, as it reads its props once.
const open = defineModel<boolean>({ required: true })
defineProps<{ initialName: string }>()
const emit = defineEmits<{ saved: [ingredient: Ingredient] }>()

function saved(ingredient: Ingredient) {
  open.value = false
  emit('saved', ingredient)
}
</script>

<template>
  <q-dialog
    v-model="open"
    persistent
  >
    <q-card class="new-ingredient-dialog">
      <q-card-section class="q-pb-none">
        <div class="text-h6">
          {{ $t('ingredients.new') }}
        </div>
      </q-card-section>
      <q-card-section>
        <IngredientForm
          v-if="open"
          :id="null"
          :initial-name="initialName"
          @saved="saved"
        />
      </q-card-section>
      <q-card-actions align="right">
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
.new-ingredient-dialog {
  width: 600px;
  max-width: 95vw;
  max-height: 90vh;
  overflow-y: auto;
}
</style>
