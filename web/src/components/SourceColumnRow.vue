<script setup lang="ts">
// One column of a data source (S2): its name and unit, and the Attribute
// drop-down that maps it. The page does the saving; this row offers the
// choices and says which one was made.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Attribute, SourceColumn } from '../api/types'
import { useUnits } from '../units'

/** A chosen attribute id, null for Not mapped, or 'create' for the entry
 * that opens the Create attribute dialog. */
type Choice = number | null | 'create'
interface Option {
  label: string
  value: Choice
  disable?: boolean
  caption?: string
}

const props = defineProps<{
  column: SourceColumn
  attributes: Attribute[]
  /** The columns of the same source that feed attributes, by attribute id: their names. */
  takenBy: Map<number, string>
  saving: boolean
  error: string
}>()
const emit = defineEmits<{ choose: [choice: Choice] }>()

const { t } = useI18n()
const { convertible } = useUnits()

const current = computed(() => props.attributes.find((a) => a.id === props.column.attribute_id))

// Not mapped, the attributes that convert with the column's unit (those held
// by another column disabled, with the holder named), Create attribute. The
// attribute the column has now is always listed.
const options = computed<Option[]>(() => [
  { label: t('dataSource.notMapped'), value: null },
  ...props.attributes
    .filter((a) => a.id === props.column.attribute_id || convertible(props.column.unit, a.unit))
    .map((a): Option => {
      const holder = props.takenBy.get(a.id)
      return holder === undefined
        ? { label: a.name, value: a.id }
        : { label: a.name, value: a.id, disable: true, caption: t('dataSource.takenBy', { column: holder }) }
    }),
  { label: t('dataSource.createAttribute'), value: 'create' },
])
</script>

<template>
  <q-item
    class="column-row wrap"
    :class="{ 'text-grey-6': column.withdrawn }"
  >
    <q-item-section class="col-12 col-sm">
      <q-item-label class="column-name">
        {{ column.name }}
      </q-item-label>
      <q-item-label
        v-if="column.unit || column.withdrawn"
        caption
      >
        {{ [column.unit, column.withdrawn ? $t('dataSource.withdrawn') : ''].filter(Boolean).join(' · ') }}
      </q-item-label>
    </q-item-section>
    <q-item-section class="col-12 col-sm-6">
      <q-select
        :model-value="column.attribute_id"
        :options="options"
        :label="$t('dataSource.attribute')"
        :display-value="current?.name ?? $t('dataSource.notMapped')"
        :disable="saving"
        :loading="saving"
        :error="error !== ''"
        :error-message="error"
        no-error-icon
        emit-value
        map-options
        outlined
        dense
        behavior="menu"
        @update:model-value="(choice: Choice) => emit('choose', choice)"
      >
        <template #option="{ opt, itemProps }">
          <q-item v-bind="itemProps">
            <q-item-section>
              <q-item-label>{{ opt.label }}</q-item-label>
              <q-item-label
                v-if="opt.caption"
                caption
              >
                {{ opt.caption }}
              </q-item-label>
            </q-item-section>
          </q-item>
        </template>
        <template #error>
          <span role="alert">{{ error }}</span>
        </template>
      </q-select>
    </q-item-section>
  </q-item>
</template>
