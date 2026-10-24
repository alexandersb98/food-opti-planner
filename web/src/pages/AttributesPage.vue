<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../api/client'
import type { components } from '../api/schema'

type Attribute = components['schemas']['Attribute']
type Fields = components['schemas']['AttributeFields']

const { t } = useI18n()

// The library's precision range, and its default for a new attribute.
const DECIMALS = { min: 0, max: 6, default: 3 }

const attributes = ref<Attribute[]>([])
const loading = ref(true)
const loadFailed = ref(false)

// The row open for editing (an attribute's id, or 'new'), and its fields
// as typed. Decimals is a string while typed, so an empty field is allowed.
const openId = ref<number | 'new' | null>(null)
const draft = reactive({ name: '', unit: '', decimals: '' })
const errors = reactive({ name: '', decimals: '', save: '' })
const saving = ref(false)
const deleteOpen = ref(false)

const NEW_ROW: Attribute = {
  id: -1,
  name: '',
  unit: '',
  decimals: DECIMALS.default,
  ingredient_count: 0,
  goal_count: 0,
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

async function load() {
  loading.value = true
  loadFailed.value = false
  try {
    const { data } = await api.GET('/api/attributes')
    if (data) attributes.value = data
    else loadFailed.value = true
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(load)

function info(attribute: Attribute) {
  const decimals = t('attributes.decimalCount', attribute.decimals)
  return `${decimals} · ${t('attributes.goalCount', attribute.goal_count)}`
}

/** "1 → 0.1 g": the smallest step the planner counts, for the typed decimals. */
const decimalsExample = computed(() => {
  const decimals = parsedDecimals()
  if (decimals === null) return ''
  const step = (10 ** -decimals).toFixed(decimals)
  return `${decimals} → ${step} ${draft.unit.trim()}`.trim().replaceAll(' ', '\u00a0') // kept on one line
})

function parsedDecimals(): number | null {
  const decimals = Number(draft.decimals)
  const valid =
    String(draft.decimals).trim() !== '' &&
    Number.isInteger(decimals) &&
    decimals >= DECIMALS.min &&
    decimals <= DECIMALS.max
  return valid ? decimals : null
}

function openRow(attribute: Attribute, id: number | 'new') {
  openId.value = id
  draft.name = attribute.name
  draft.unit = attribute.unit
  draft.decimals = String(attribute.decimals)
  Object.assign(errors, { name: '', decimals: '', save: '' })
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
  const decimals = parsedDecimals()
  const fields: Fields = { name: draft.name.trim(), unit: draft.unit.trim(), decimals: decimals ?? 0 }
  errors.name = fields.name ? '' : t('attributes.nameRequired')
  errors.decimals = decimals === null ? t('attributes.decimalsRange', DECIMALS) : ''
  errors.save = ''
  if (errors.name || errors.decimals) return false

  const current = openAttribute.value
  if (current && current.name === fields.name && current.unit === fields.unit && current.decimals === decimals) {
    openId.value = null
    return true
  }

  saving.value = true
  try {
    const { data, response } = current
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
    if (response.status === 409) errors.name = t('attributes.nameInUse')
    else errors.save = t('attributes.saveFailed')
  } catch {
    errors.save = t('attributes.saveFailed')
  } finally {
    saving.value = false
  }
  return false
}

const deleteWarning = computed(() => {
  const attribute = openAttribute.value
  if (!attribute || (attribute.ingredient_count === 0 && attribute.goal_count === 0)) {
    return t('attributes.deleteNothing')
  }
  return t('attributes.deleteRemoves', {
    ingredients: t('attributes.ingredientCount', attribute.ingredient_count),
    goals: t('attributes.goalCount', attribute.goal_count),
  })
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
      errors.save = t('attributes.deleteFailed')
    }
  } catch {
    errors.save = t('attributes.deleteFailed')
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

    <div
      v-if="loadFailed"
      class="q-gutter-sm"
    >
      <p>{{ $t('attributes.loadFailed') }}</p>
      <q-btn
        outline
        color="primary"
        :label="$t('attributes.retry')"
        @click="load"
      />
    </div>

    <q-list
      v-else-if="!loading"
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
          <div class="row q-col-gutter-sm">
            <q-input
              v-model="draft.name"
              class="col-6"
              outlined
              dense
              autofocus
              :label="$t('attributes.name')"
              :error="!!errors.name"
              :error-message="errors.name"
            />
            <q-input
              v-model="draft.unit"
              class="col-3"
              outlined
              dense
              :label="$t('attributes.unit')"
            />
            <q-input
              v-model="draft.decimals"
              class="col-3"
              type="number"
              inputmode="numeric"
              outlined
              dense
              :label="$t('attributes.decimals')"
              :error="!!errors.decimals"
              :error-message="errors.decimals"
            />
          </div>
          <div class="text-caption text-grey-8">
            {{ $t('attributes.decimalsHint') }}
            <span v-if="decimalsExample">({{ decimalsExample }})</span>
          </div>
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
              :label="$t('attributes.cancel')"
              @click="openId = null"
            />
            <q-btn
              v-else
              class="col"
              outline
              color="negative"
              :label="$t('attributes.delete')"
              @click="deleteOpen = true"
            />
            <q-btn
              class="col"
              type="submit"
              color="primary"
              :label="$t('attributes.done')"
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

    <q-dialog v-model="deleteOpen">
      <q-card>
        <q-card-section>
          <div class="text-h6">
            {{ $t('attributes.deleteTitle', { name: openAttribute?.name }) }}
          </div>
          <p class="q-mb-none q-mt-sm">
            {{ deleteWarning }}
          </p>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn
            v-close-popup
            flat
            :label="$t('attributes.cancel')"
          />
          <q-btn
            flat
            color="negative"
            :label="$t('attributes.delete')"
            @click="confirmDelete"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>
