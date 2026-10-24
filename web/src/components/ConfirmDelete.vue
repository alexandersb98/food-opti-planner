<script setup lang="ts">
// "Delete {name}?" with what else the delete removes; confirm does the delete.
const open = defineModel<boolean>({ required: true })
defineProps<{ name: string; warning: string }>()
defineEmits<{ confirm: [] }>()
</script>

<template>
  <q-dialog v-model="open">
    <q-card>
      <q-card-section>
        <div class="text-h6">
          {{ $t('common.deleteTitle', { name }) }}
        </div>
        <p class="q-mb-none q-mt-sm">
          {{ warning }}
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
          color="negative"
          :label="$t('common.delete')"
          @click="$emit('confirm')"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
