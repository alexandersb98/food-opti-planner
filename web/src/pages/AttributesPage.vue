<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../api/client'
import { DECIMALS, parseDecimals } from '../attributeFields'
import { conversionRefusal, fieldErrors } from '../api/errors'
import type { Attribute, AttributeFields as Fields } from '../api/types'
import AttributeFields from '../components/AttributeFields.vue'
import ConfirmDelete from '../components/ConfirmDelete.vue'
import LoadState from '../components/LoadState.vue'
import UnitChangeDialog from '../components/UnitChangeDialog.vue'
import { useLoad } from '../composables/useLoad'
import { refusalText, useUnitChange } from '../composables/useUnitChange'

const { t } = useI18n()
const unitChange = useUnitChange()

const { data: attributes, loading, failed: loadFailed, load } = useLoad(() => api.GET('/api/attributes'), [])

// The row open for editing (an attribute's id, or 'new'), and its fields
// as typed. Decimals is a string while typed, so an empty field is allowed.
const openId = ref<number | 'new' | null>(null)
const draft = reactive({ name: '', unit: '', decimals: '' })
const errors = reactive({ name: '', unit: '', decimals: '', save: '' })
// A refusal of the unit change stays until the unit is edited or Done is pressed again.
watch(() => draft.unit, () => (errors.unit = ''))
const saving = ref(false)
const deleteOpen = ref(false)

const NEW_ROW: Attribute = {
  id: -1,
  name: '',
  unit: '',
  decimals: DECIMALS.default,
  ingredient_count: 0,
  goal_count: 0,
  mapping_count: 0,
}
const rows = computed(() =>
  openId.value === 'new' ? [...attributes.value, NEW_ROW] : attributes.value,
)
const openAttribute = computed(() => attributes.value.find((a) => a.id === openId.value))

function rowKey(attribute: Attribute) {
  return attribute === NEW_ROW ? 'new' : attribute.id
}

function isOpen(attribute: Attribute) {
  return rowKey(attribute) === openId.value
}

function info(attribute: Attribute) {
  const decimals = t('attributes.decimalCount', attribute.decimals)
  return `${decimals} · ${t('count.goals', attribute.goal_count)}`
}

function openRow(attribute: Attribute, id: number | 'new') {
  openId.value = id
  draft.name = attribute.name
  draft.unit = attribute.unit
  draft.decimals = String(attribute.decimals)
  Object.assign(errors, { name: '', unit: '', decimals: '', save: '' })
}

/** Open a row; an open row with changes is saved first, and stays open if that fails. */
async function open(attribute: Attribute) {
  if (isOpen(attribute) || !(await done())) return
  openRow(attribute, attribute.id)
}

async function startNew() {
  if (openId.value === 'new' || !(await done())) return
  openRow(NEW_ROW, 'new')
}

/** Save the open row and close it; false if it has to stay open. */
async function done(): Promise<boolean> {
  if (openId.value === null) return true
  const decimals = parseDecimals(draft.decimals)
  const fields: Fields = { name: draft.name.trim(), unit: draft.unit.trim(), decimals: decimals ?? 0 }
  errors.name = fields.name ? '' : t('common.nameRequired')
  errors.decimals = decimals === null ? t('attributes.decimalsRange', DECIMALS) : ''
  errors.save = ''
  errors.unit = ''
  if (errors.name || errors.decimals) return false

  const current = openAttribute.value
  if (current && current.name === fields.name && current.unit === fields.unit && current.decimals === decimals) {
    openId.value = null
    return true
  }

  if (current && fields.unit !== current.unit && !(await confirmUnitChange(current, fields))) return false

  saving.value = true
  try {
    const { data, error } = current
      ? await api.PUT('/api/attributes/{attribute_id}', {
          params: { path: { attribute_id: current.id } },
          body: fields,
        })
      : await api.POST('/api/attributes', { body: fields })
    if (data) {
      attributes.value = current
        ? attributes.value.map((a) => (a.id === data.id ? data : a))
        : [...attributes.value, data]
      openId.value = null
      return true
    }
    const refusal = conversionRefusal(error)
    if (fieldErrors(error).name === 'name_in_use') errors.name = t('attributes.nameInUse')
    else if (refusal) errors.unit = refusal
    else errors.save = t('common.saveFailed')
  } catch {
    errors.save = t('common.saveFailed')
  } finally {
    saving.value = false
  }
  return false
}

/** Ask the server what the unit change does to the numbers stored in the
 * unit and, if it converts or keeps them, ask the user. False stops the save:
 * a refusal shows under the unit field, a failed preview as a failed save. */
async function confirmUnitChange(current: Attribute, fields: Fields): Promise<boolean> {
  saving.value = true
  let change
  try {
    const { data } = await api.POST('/api/attributes/{attribute_id}/unit-change', {
      params: { path: { attribute_id: current.id } },
      body: { unit: fields.unit, decimals: fields.decimals },
    })
    change = data
  } catch {
    change = undefined
  } finally {
    saving.value = false
  }
  if (!change) {
    errors.save = t('common.saveFailed')
    return false
  }
  const names = { from: current.unit, to: fields.unit }
  if (change.refusal) {
    errors.unit = refusalText(t, change.refusal, { ...names, attribute: fields.name })
    return false
  }
  if (change.kind === 'same') return true
  return unitChange.ask({ name: fields.name, ...names, change })
}

const deleteWarning = computed(() => {
  const attribute = openAttribute.value
  const parts: string[] = []
  if (attribute && (attribute.ingredient_count > 0 || attribute.goal_count > 0)) {
    parts.push(
      t('attributes.deleteRemoves', {
        ingredients: t('count.ingredients', attribute.ingredient_count),
        goals: t('count.goals', attribute.goal_count),
      }),
    )
  }
  if (attribute && attribute.mapping_count > 0) {
    parts.push(
      t('attributes.deleteUnmaps', { columns: t('count.sourceColumns', attribute.mapping_count) }),
    )
  }
  return parts.length > 0 ? parts.join(' ') : t('common.deleteNothing')
})

async function confirmDelete() {
  const attribute = openAttribute.value
  if (!attribute) return
  errors.save = ''
  try {
    const { response } = await api.DELETE('/api/attributes/{attribute_id}', {
      params: { path: { attribute_id: attribute.id } },
    })
    if (response.ok) {
      attributes.value = attributes.value.filter((a) => a.id !== attribute.id)
      openId.value = null
    } else {
      errors.save = t('common.deleteFailed')
    }
  } catch {
    errors.save = t('common.deleteFailed')
  }
  deleteOpen.value = false
}
</script>

<template>
  <q-page padding>
    <h1 class="text-h5">
      {{ $t('pages.attributes') }}
    </h1>
    <p class="text-caption text-grey-8">
      {{ $t('attributes.intro') }}
    </p>

    <LoadState
      :loading="loading"
      :failed="loadFailed"
      :message="$t('attributes.loadFailed')"
      @retry="load"
    >
      <q-list
        bordered
        separator
        class="rounded-borders"
      >
        <q-item v-if="rows.length === 0">
          <q-item-section class="text-grey-8">
            {{ $t('attributes.empty') }}
          </q-item-section>
        </q-item>

        <div
          v-for="attribute in rows"
          :key="rowKey(attribute)"
          class="attribute-row"
        >
          <q-form
            v-if="isOpen(attribute)"
            class="q-pa-md q-gutter-y-sm"
            @submit="done"
          >
            <AttributeFields
              v-model:draft="draft"
              :errors="errors"
            />
            <div
              v-if="errors.save"
              class="text-negative"
              role="alert"
            >
              {{ errors.save }}
            </div>
            <div class="row q-gutter-sm">
              <q-btn
                v-if="openId === 'new'"
                class="col"
                outline
                :label="$t('common.cancel')"
                @click="openId = null"
              />
              <q-btn
                v-else
                class="col"
                outline
                color="negative"
                :label="$t('common.delete')"
                @click="deleteOpen = true"
              />
              <q-btn
                class="col"
                type="submit"
                color="primary"
                :label="$t('common.done')"
                :loading="saving"
              />
            </div>
          </q-form>

          <q-item
            v-else
            v-ripple
            clickable
            @click="open(attribute)"
          >
            <q-item-section>
              <q-item-label>
                {{ attribute.name }}
                <span
                  v-if="attribute.unit"
                  class="text-grey-8"
                >({{ attribute.unit }})</span>
              </q-item-label>
              <q-item-label caption>
                {{ info(attribute) }}
              </q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-icon name="chevron_right" />
            </q-item-section>
          </q-item>
        </div>

        <q-item
          v-if="openId !== 'new'"
          v-ripple
          clickable
          class="text-primary"
          @click="startNew"
        >
          <q-item-section>{{ $t('attributes.new') }}</q-item-section>
        </q-item>
      </q-list>
    </LoadState>

    <UnitChangeDialog />
    <ConfirmDelete
      v-model="deleteOpen"
      :name="openAttribute?.name ?? ''"
      :warning="deleteWarning"
      @confirm="confirmDelete"
    />
  </q-page>
</template>
