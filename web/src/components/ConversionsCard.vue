<script setup lang="ts">
// An ingredient's conversions on C4: "1 dl = 100 g" with Edit and Delete, and
// "+ Add conversion". Each act is saved at once through the API; the card
// tells the page the new list. Delete is off while a recipe uses the
// conversion (the server refuses it too).
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../api/client'
import type { Conversion, Ingredient } from '../api/types'
import ConfirmDelete from './ConfirmDelete.vue'
import ConversionDialog from './ConversionDialog.vue'

const props = defineProps<{ ingredient: Pick<Ingredient, 'id' | 'name' | 'unit' | 'conversions'> }>()
const emit = defineEmits<{ changed: [conversions: Conversion[]] }>()

const { t } = useI18n()

const dialogOpen = ref(false)
const editing = ref<Conversion | null>(null)
const deleting = ref<Conversion | null>(null)
const deleteOpen = ref(false)
const message = ref('')

function add() {
  editing.value = null
  dialogOpen.value = true
}

function edit(conversion: Conversion) {
  editing.value = conversion
  dialogOpen.value = true
}

function saved(conversion: Conversion) {
  message.value = ''
  const others = props.ingredient.conversions.filter((c) => c.id !== conversion.id)
  emit('changed', [...others, conversion].sort((a, b) => a.id - b.id))
}

function askDelete(conversion: Conversion) {
  deleting.value = conversion
  message.value = ''
  deleteOpen.value = true
}

async function confirmDelete() {
  const conversion = deleting.value
  if (!conversion) return
  try {
    const { response } = await api.DELETE('/api/ingredients/{ingredient_id}/conversions/{conversion_id}', {
      params: { path: { ingredient_id: props.ingredient.id, conversion_id: conversion.id } },
    })
    if (response.ok) emit('changed', props.ingredient.conversions.filter((c) => c.id !== conversion.id))
    else message.value = response.status === 409 ? t('conversions.inUse') : t('conversions.deleteFailed')
  } catch {
    message.value = t('conversions.deleteFailed')
  }
  deleteOpen.value = false
}
</script>

<template>
  <q-card
    flat
    bordered
    class="conversions-card"
  >
    <q-card-section class="q-gutter-y-sm">
      <div class="text-subtitle1">
        {{ $t('conversions.title') }}
      </div>
      <div
        v-if="ingredient.conversions.length === 0"
        class="text-grey-8"
      >
        {{ $t('conversions.empty') }}
      </div>
      <div
        v-for="conversion in ingredient.conversions"
        :key="conversion.id"
        class="conversion-row row items-center no-wrap q-gutter-x-sm"
      >
        <div class="col">
          <span class="conversion-text">{{ $t('conversions.row', { unit: conversion.unit, factor: conversion.factor, own: ingredient.unit }) }}</span>
          <span
            v-if="conversion.source === 'ai'"
            class="ai-mark q-ml-xs"
          >✨<q-tooltip>{{ $t('conversions.aiTooltip') }}</q-tooltip></span>
          <div
            v-if="conversion.recipe_count > 0"
            class="text-caption text-grey-8"
          >
            {{ $t('conversions.usedIn', { n: conversion.recipe_count }, conversion.recipe_count) }}
          </div>
        </div>
        <q-btn
          flat
          dense
          no-caps
          color="primary"
          :label="$t('conversions.edit')"
          :aria-label="$t('conversions.editOf', { unit: conversion.unit })"
          @click="edit(conversion)"
        />
        <q-btn
          flat
          dense
          no-caps
          color="negative"
          :label="$t('conversions.delete')"
          :aria-label="$t('conversions.deleteOf', { unit: conversion.unit })"
          :disable="conversion.recipe_count > 0"
          @click="askDelete(conversion)"
        />
      </div>
      <div
        v-if="message"
        class="text-negative"
        role="alert"
      >
        {{ message }}
      </div>
      <q-btn
        flat
        no-caps
        color="primary"
        :label="$t('conversions.add')"
        @click="add"
      />
    </q-card-section>
    <ConversionDialog
      v-model="dialogOpen"
      :ingredient="ingredient"
      :conversion="editing"
      @saved="saved"
    />
    <ConfirmDelete
      v-model="deleteOpen"
      :name="$t('conversions.deleteName', { unit: deleting?.unit ?? '' })"
      :warning="$t('common.deleteNothing')"
      @confirm="confirmDelete"
    />
  </q-card>
</template>
