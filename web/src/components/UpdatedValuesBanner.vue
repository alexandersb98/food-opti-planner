<script setup lang="ts">
// On C4: the data source has new numbers for a linked ingredient. Lists each
// attribute with the ingredient's value and the new one ("Protein 13.5 g →
// 13.8 g") and asks: Accept copies them, Keep mine keeps the ingredient's own.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Attribute, UpdatedValue } from '../api/types'
import { valueText } from '../format'

const props = defineProps<{ updates: UpdatedValue[]; attributes: Attribute[]; busy: boolean }>()
const emit = defineEmits<{ answer: [answer: 'accept' | 'keep'] }>()

const { t } = useI18n()

/** One line per update whose attribute is known (an attribute list that is
 * out of date skips the rest). */
const lines = computed(() =>
  props.updates.flatMap((update) => {
    const attribute = props.attributes.find((a) => a.id === update.attribute_id)
    if (!attribute) return []
    const before = update.value === null ? `${attribute.name} ${t('ingredients.noValue')}` : valueText(attribute, update.value)
    return [{ id: attribute.id, text: `${before} → ${update.new_value} ${attribute.unit}`.trim() }]
  }),
)
</script>

<template>
  <q-banner
    v-if="lines.length > 0"
    class="updated-values bg-blue-1 text-grey-10"
    role="status"
    rounded
  >
    <div class="text-subtitle1">
      {{ $t('ingredients.updatedValues') }}
    </div>
    <div>{{ $t('ingredients.updatedValuesLead') }}</div>
    <ul class="q-my-sm q-pl-md">
      <li
        v-for="line in lines"
        :key="line.id"
      >
        {{ line.text }}
      </li>
    </ul>
    <template #action>
      <q-btn
        class="keep-updates"
        flat
        no-caps
        color="primary"
        :label="$t('ingredients.keepMine')"
        :disable="busy"
        @click="emit('answer', 'keep')"
      />
      <q-btn
        class="accept-updates"
        unelevated
        no-caps
        color="primary"
        :label="$t('ingredients.accept')"
        :disable="busy"
        @click="emit('answer', 'accept')"
      />
    </template>
  </q-banner>
</template>
