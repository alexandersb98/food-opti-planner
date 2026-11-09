<script setup lang="ts">
// On C4: where a linked ingredient comes from. A chip in the source's colour
// ("From Livsmedelsverket: Havregryn"), a second one if the source no longer
// has the food, and Unlink from source, which asks first.
import { ref } from 'vue'
import type { IngredientSource } from '../api/types'
import { contrastText } from '../colours'

defineProps<{ source: IngredientSource; name: string; busy: boolean }>()
const emit = defineEmits<{ unlink: [] }>()

const confirming = ref(false)

function confirm() {
  confirming.value = false
  emit('unlink')
}
</script>

<template>
  <div class="row items-center q-gutter-sm">
    <q-chip
      class="source-chip"
      :style="{ backgroundColor: source.colour, color: contrastText(source.colour) }"
      :label="$t('ingredients.fromSource', { source: source.name, food: source.food_name })"
    />
    <q-chip
      v-if="source.withdrawn"
      class="source-withdrawn"
      outline
      :label="$t('ingredients.noLongerInSource')"
    />
    <q-btn
      class="unlink-button"
      flat
      dense
      no-caps
      color="primary"
      :label="$t('ingredients.unlink')"
      :disable="busy"
      @click="confirming = true"
    />

    <q-dialog v-model="confirming">
      <q-card>
        <q-card-section>
          <div class="text-h6">
            {{ $t('ingredients.unlinkTitle', { name, source: source.name }) }}
          </div>
          <p class="q-mb-none q-mt-sm">
            {{ $t('ingredients.unlinkBody') }}
          </p>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn
            v-close-popup
            flat
            :label="$t('common.cancel')"
          />
          <q-btn
            flat
            color="primary"
            :label="$t('ingredients.unlinkConfirm')"
            @click="confirm"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>
