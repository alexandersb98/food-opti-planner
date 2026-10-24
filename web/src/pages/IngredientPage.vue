<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api/client'
import { fieldErrors } from '../api/errors'
import type { Attribute, Ingredient, IngredientFields as Fields, Tag } from '../api/types'
import ConfirmDelete from '../components/ConfirmDelete.vue'
import EditorHeader from '../components/EditorHeader.vue'
import LoadState from '../components/LoadState.vue'
import { loadAll, useLoad } from '../composables/useLoad'
import { typedNumber } from '../numbers'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

// The editor for a new ingredient (/ingredients/new) or an existing one.
const id = route.params.id === undefined ? null : Number(route.params.id)

const UNITS = ['g', 'ml', 'pcs']

/** Values are typed per 100 g or ml, and per 1 of anything else. */
function defaultBasis(unit: string) {
  return ['g', 'ml'].includes(unit.trim()) ? '100' : '1'
}

// The fields as typed; values by attribute id, empty if not typed.
const draft = reactive({
  name: '',
  unit: 'g',
  basis: '100',
  values: {} as Partial<Record<number, string>>,
  tagIds: new Set<number>(),
})
const errors = reactive({
  name: '',
  unit: '',
  basis: '',
  values: {} as Partial<Record<number, string>>,
  save: '',
})
const saving = ref(false)
const deleteOpen = ref(false)

const { data, loading, failed, load } = useLoad(
  async () => {
    const loaded = await loadAll({
      attributes: api.GET('/api/attributes'),
      tags: api.GET('/api/tags'),
      ingredient:
        id === null
          ? Promise.resolve({ data: null })
          : api.GET('/api/ingredients/{ingredient_id}', { params: { path: { ingredient_id: id } } }),
    })
    if (loaded.data?.ingredient) fillDraft(loaded.data.ingredient)
    return loaded
  },
  { attributes: [] as Attribute[], tags: [] as Tag[], ingredient: null as Ingredient | null },
)

function fillDraft(ingredient: Ingredient) {
  draft.name = ingredient.name
  draft.unit = ingredient.unit
  draft.basis = ingredient.basis
  draft.values = Object.fromEntries(ingredient.values.map(({ attribute_id, value }) => [attribute_id, value]))
  draft.tagIds = new Set(ingredient.tag_ids)
}

/** The basis follows the unit (100 g, 1 pcs) unless it was changed by hand. */
function setUnit(unit: string) {
  if (draft.basis.trim() === defaultBasis(draft.unit)) draft.basis = defaultBasis(unit)
  draft.unit = unit
}

function toggleTag(tag: Tag) {
  if (draft.tagIds.has(tag.id)) draft.tagIds.delete(tag.id)
  else draft.tagIds.add(tag.id)
}

const inUse = computed(() => (data.value.ingredient?.recipe_count ?? 0) > 0)

/** The fields to send, or null after marking what is wrong. */
function checked(): Fields | null {
  const fields: Fields = {
    name: draft.name.trim(),
    unit: draft.unit.trim(),
    basis: typedNumber(draft.basis) ?? '',
    values: [],
    tag_ids: data.value.tags.filter((tag) => draft.tagIds.has(tag.id)).map((tag) => tag.id),
  }
  errors.name = fields.name ? '' : t('common.nameRequired')
  errors.unit = fields.unit ? '' : t('ingredients.unitRequired')
  errors.basis = fields.basis && Number(fields.basis) > 0 ? '' : t('ingredients.basisInvalid')
  errors.values = {}
  for (const attribute of data.value.attributes) {
    const typed = draft.values[attribute.id]?.trim() ?? ''
    if (typed === '') continue
    const value = typedNumber(typed)
    if (value === null) errors.values[attribute.id] = t('ingredients.numberInvalid')
    else fields.values.push({ attribute_id: attribute.id, value })
  }
  const wrong = errors.name || errors.unit || errors.basis || Object.keys(errors.values).length > 0
  return wrong ? null : fields
}

async function save() {
  errors.save = ''
  const fields = checked()
  if (!fields) return
  saving.value = true
  try {
    const { data: saved, error } =
      id === null
        ? await api.POST('/api/ingredients', { body: fields })
        : await api.PUT('/api/ingredients/{ingredient_id}', {
            params: { path: { ingredient_id: id } },
            body: fields,
          })
    if (saved) {
      await router.push('/ingredients')
      return
    }
    showServerErrors(fieldErrors(error), fields)
  } catch {
    errors.save = t('common.saveFailed')
  } finally {
    saving.value = false
  }
}

/** A name in use, or a number with too many digits; anything else just failed. */
function showServerErrors(byField: Partial<Record<string, string>>, fields: Fields) {
  let shown = false
  if (byField.name === 'name_in_use') {
    errors.name = t('ingredients.nameInUse')
    shown = true
  }
  if (byField.basis) {
    errors.basis = t('ingredients.numberTooLong')
    shown = true
  }
  fields.values.forEach(({ attribute_id }, i) => {
    if (byField[`values.${i}.value`]) {
      errors.values[attribute_id] = t('ingredients.numberTooLong')
      shown = true
    }
  })
  if (!shown) errors.save = t('common.saveFailed')
}

async function confirmDelete() {
  if (id === null) return
  errors.save = ''
  try {
    const { response } = await api.DELETE('/api/ingredients/{ingredient_id}', {
      params: { path: { ingredient_id: id } },
    })
    if (response.ok) {
      deleteOpen.value = false
      await router.push('/ingredients')
      return
    }
    errors.save = t('common.deleteFailed')
  } catch {
    errors.save = t('common.deleteFailed')
  }
  deleteOpen.value = false
}
</script>

<template>
  <q-page padding>
    <EditorHeader
      back="/ingredients"
      :title="id === null ? $t('ingredients.new') : $t('ingredients.edit')"
    />

    <LoadState
      :loading="loading"
      :failed="failed"
      :message="$t('ingredients.loadOneFailed')"
      @retry="load"
    >
      <q-form
        class="q-gutter-y-md"
        @submit="save"
      >
        <q-input
          v-model="draft.name"
          outlined
          :autofocus="id === null"
          :label="$t('common.name')"
          :error="!!errors.name"
          :error-message="errors.name"
          hide-bottom-space
        />

        <div>
          <q-input
            :model-value="draft.unit"
            outlined
            :label="$t('ingredients.measuredIn')"
            :error="!!errors.unit"
            :error-message="errors.unit"
            hide-bottom-space
            @update:model-value="setUnit(String($event ?? ''))"
          />
          <div class="q-mt-xs q-gutter-x-sm">
            <q-btn
              v-for="unit in UNITS"
              :key="unit"
              class="unit-choice"
              size="sm"
              no-caps
              :outline="draft.unit.trim() !== unit"
              :unelevated="draft.unit.trim() === unit"
              color="primary"
              :label="unit"
              :aria-pressed="draft.unit.trim() === unit"
              @click="setUnit(unit)"
            />
          </div>
        </div>

        <q-card
          flat
          bordered
        >
          <q-card-section class="q-gutter-y-sm">
            <div class="row items-center no-wrap q-gutter-x-sm">
              <span class="text-subtitle1">{{ $t('ingredients.valuesPer') }}</span>
              <q-input
                v-model="draft.basis"
                class="basis-field"
                outlined
                dense
                inputmode="decimal"
                :aria-label="$t('ingredients.basis')"
                :error="!!errors.basis"
                hide-bottom-space
              />
              <span class="text-subtitle1">{{ draft.unit.trim() }}</span>
            </div>
            <div
              v-if="errors.basis"
              class="text-negative text-caption"
            >
              {{ errors.basis }}
            </div>
            <div
              v-if="data.attributes.length === 0"
              class="text-grey-8"
            >
              {{ $t('ingredients.noAttributes') }}
            </div>
            <template v-else>
              <q-input
                v-for="attribute in data.attributes"
                :key="attribute.id"
                v-model="draft.values[attribute.id]"
                outlined
                dense
                inputmode="decimal"
                :label="attribute.name"
                :suffix="attribute.unit"
                :error="!!errors.values[attribute.id]"
                :error-message="errors.values[attribute.id]"
                hide-bottom-space
              />
              <div class="text-caption text-grey-8">
                {{ $t('ingredients.valuesHint') }}
              </div>
            </template>
          </q-card-section>
        </q-card>

        <div>
          <div class="text-subtitle1 q-mb-xs">
            {{ $t('ingredients.tags') }}
          </div>
          <div
            v-if="data.tags.length === 0"
            class="text-grey-8"
          >
            {{ $t('ingredients.noTags') }}
          </div>
          <div
            v-else
            class="q-gutter-sm"
          >
            <q-btn
              v-for="tag in data.tags"
              :key="tag.id"
              class="tag-choice"
              no-caps
              rounded
              color="primary"
              :outline="!draft.tagIds.has(tag.id)"
              :unelevated="draft.tagIds.has(tag.id)"
              :icon="draft.tagIds.has(tag.id) ? 'check' : undefined"
              :label="tag.name"
              :aria-pressed="draft.tagIds.has(tag.id)"
              @click="toggleTag(tag)"
            />
          </div>
        </div>

        <div
          v-if="data.ingredient"
          class="text-grey-8"
        >
          {{ $t('ingredients.usedIn', { recipes: $t('count.recipes', data.ingredient.recipe_count) }) }}
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
            v-if="data.ingredient"
            class="col"
            outline
            color="negative"
            :label="$t('common.delete')"
            :disable="inUse"
            @click="deleteOpen = true"
          />
          <q-btn
            class="col"
            type="submit"
            color="primary"
            :label="$t('common.save')"
            :loading="saving"
          />
        </div>
        <div
          v-if="inUse"
          class="text-caption text-grey-8"
        >
          {{ $t('ingredients.inUse') }}
        </div>
      </q-form>
    </LoadState>

    <ConfirmDelete
      v-model="deleteOpen"
      :name="data.ingredient?.name ?? ''"
      :warning="$t('common.deleteNothing')"
      @confirm="confirmDelete"
    />
  </q-page>
</template>

<style scoped>
.basis-field {
  width: 7em;
}
</style>
