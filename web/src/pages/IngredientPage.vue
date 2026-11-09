<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api/client'
import { conversionRefusal, fieldErrors } from '../api/errors'
import type { Attribute, Conversion, Ingredient, IngredientFields as Fields, Recipe, Tag } from '../api/types'
import ConfirmDelete from '../components/ConfirmDelete.vue'
import ConversionsCard from '../components/ConversionsCard.vue'
import EditorHeader from '../components/EditorHeader.vue'
import LoadState from '../components/LoadState.vue'
import SourceChip from '../components/SourceChip.vue'
import UnitChangeDialog from '../components/UnitChangeDialog.vue'
import UnitField from '../components/UnitField.vue'
import UpdatedValuesBanner from '../components/UpdatedValuesBanner.vue'
import { loadAll, useLoad } from '../composables/useLoad'
import { refusalText, useUnitChange } from '../composables/useUnitChange'
import { searchByName } from '../lists'
import { typedNumber } from '../numbers'
import { usePreferences } from '../preferences'
import { useUnits } from '../units'

const { t } = useI18n()
const unitChange = useUnitChange()
const route = useRoute()
const router = useRouter()

// The editor for a new ingredient (/ingredients/new) or an existing one.
const id = route.params.id === undefined ? null : Number(route.params.id)

const units = useUnits()
const preferences = usePreferences()

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
    // A new ingredient starts in the preferred mass unit, so the preferences
    // come first; without them (a failed load) it starts in grams.
    const [loaded] = await Promise.all([
      loadAll({
        attributes: api.GET('/api/attributes'),
        tags: api.GET('/api/tags'),
        ingredient:
          id === null
            ? Promise.resolve({ data: null })
            : api.GET('/api/ingredients/{ingredient_id}', { params: { path: { ingredient_id: id } } }),
      }),
      preferences.load(),
    ])
    if (loaded.data?.ingredient) fillDraft(loaded.data.ingredient)
    else if (id === null) startDraft()
    return loaded
  },
  { attributes: [] as Attribute[], tags: [] as Tag[], ingredient: null as Ingredient | null },
)

function startDraft() {
  draft.unit = preferences.preferences.value?.['unit.mass'] ?? 'g'
  draft.basis = '100' // a mass unit
}

function fillDraft(ingredient: Ingredient) {
  draft.name = ingredient.name
  draft.unit = ingredient.unit
  draft.basis = ingredient.basis
  draft.values = Object.fromEntries(ingredient.values.map(({ attribute_id, value }) => [attribute_id, value]))
  draft.tagIds = new Set(ingredient.tag_ids)
}

/** The default basis of a unit; without the catalogue only g is known. */
function basisFor(unit: string) {
  if (units.units.value.length > 0) return units.basisFor(unit)
  return unit.trim() === 'g' ? '100' : '1'
}

/** The basis follows the unit (100 g, 1 st) unless it was changed by hand. */
function setUnit(unit: string) {
  errors.unit = ''
  if (draft.basis.trim() === basisFor(draft.unit)) draft.basis = basisFor(unit)
  draft.unit = unit
}

function toggleTag(tag: Tag) {
  if (draft.tagIds.has(tag.id)) draft.tagIds.delete(tag.id)
  else draft.tagIds.add(tag.id)
}

// A linked ingredient is measured in mass units only (its values are per 100 g).
const linked = computed(() => data.value.ingredient?.source != null)
const unitCategories = computed(() => (linked.value ? ['mass' as const] : ['mass' as const, 'volume' as const, 'piece' as const]))
const unlinking = ref(false)

/** Cut the link. The page's ingredient becomes the answer, but the form is
 * not refilled, so what was typed stays. */
async function unlink() {
  if (id === null || unlinking.value) return
  errors.save = ''
  unlinking.value = true
  try {
    const { data: unlinked } = await api.POST('/api/ingredients/{ingredient_id}/unlink', {
      params: { path: { ingredient_id: id } },
    })
    if (unlinked) data.value.ingredient = unlinked
    else errors.save = t('ingredients.unlinkFailed')
  } catch {
    errors.save = t('ingredients.unlinkFailed')
  } finally {
    unlinking.value = false
  }
}

const answering = ref(false)

/** Answer the updated values. The page's ingredient becomes the answer, and
 * the form takes the accepted numbers, or the 0 the server stored for a value
 * the ingredient had none of, so that saving the form does not delete the row
 * and bring the banner back. Other edits stay. */
async function answerUpdates(answer: 'accept' | 'keep') {
  const shown = data.value.ingredient?.updated_values ?? []
  if (id === null || answering.value) return
  errors.save = ''
  answering.value = true
  try {
    const { data: answered } = await api.POST('/api/ingredients/{ingredient_id}/source-values', {
      params: { path: { ingredient_id: id } },
      body: { answer },
    })
    if (!answered) throw new Error('no answer')
    data.value.ingredient = answered
    for (const { attribute_id, value, new_value } of shown) {
      if (answer === 'accept') draft.values[attribute_id] = new_value
      else if (value === null && !draft.values[attribute_id]?.trim()) draft.values[attribute_id] = '0'
    }
  } catch {
    errors.save = t('ingredients.sourceValuesFailed')
  } finally {
    answering.value = false
  }
}

const inUse = computed(() => (data.value.ingredient?.recipe_count ?? 0) > 0)

/** The conversions as the card changed them (each act is saved at once). */
function conversionsChanged(conversions: Conversion[]) {
  if (data.value.ingredient) data.value.ingredient.conversions = conversions
}

/** What deleting says besides the name: the conversions that go with it. */
const deleteWarning = computed(() => {
  const count = data.value.ingredient?.conversions.length ?? 0
  return count > 0 ? t('ingredients.deleteConversions', { n: count }, count) : t('common.deleteNothing')
})

// "Used in 2 recipes · Show": the recipes, loaded when asked for.
const usedIn = ref<Recipe[] | null>(null)
const usedInFailed = ref(false)

async function showRecipes() {
  usedInFailed.value = false
  try {
    const { data: recipes } = await api.GET('/api/recipes')
    if (!recipes) throw new Error('no recipes')
    usedIn.value = searchByName(
      recipes.filter((recipe) => recipe.sections.some((section) => section.items.some((item) => item.ingredient_id === id))),
      '',
    )
  } catch {
    usedInFailed.value = true
  }
}

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
  const stored = data.value.ingredient
  if (id !== null && stored && fields.unit !== stored.unit && !(await confirmUnitChange(id, stored, fields))) return
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
    showServerErrors(fieldErrors(error), fields, conversionRefusal(error))
  } catch {
    errors.save = t('common.saveFailed')
  } finally {
    saving.value = false
  }
}

/** Ask the server what the unit change does to the basis and the recipe
 * amounts and, if it converts or keeps them, ask the user. False stops the
 * save: a refusal shows under the unit field, a failed preview as a failed
 * save. The basis sent is the one typed, in the old unit, as the save
 * converts it. */
async function confirmUnitChange(ingredientId: number, stored: Ingredient, fields: Fields): Promise<boolean> {
  saving.value = true
  let change
  try {
    const { data: previewed } = await api.POST('/api/ingredients/{ingredient_id}/unit-change', {
      params: { path: { ingredient_id: ingredientId } },
      body: { unit: fields.unit, basis: fields.basis },
    })
    change = previewed
  } catch {
    change = undefined
  } finally {
    saving.value = false
  }
  if (!change) {
    errors.save = t('common.saveFailed')
    return false
  }
  const names = { from: stored.unit, to: fields.unit }
  if (change.refusal) {
    errors.unit = refusalText(t, change.refusal, names)
    return false
  }
  if (change.kind === 'same') return true
  return unitChange.ask({ name: fields.name, ...names, change })
}

/** A name in use, an energy unit or (for a linked ingredient) a non-mass one, a unit change that loses precision, or a number with too many digits; anything else just failed. */
function showServerErrors(byField: Partial<Record<string, string>>, fields: Fields, refusal: string | null) {
  let shown = false
  if (byField.name === 'name_in_use') {
    errors.name = t('ingredients.nameInUse')
    shown = true
  }
  if (byField.unit === 'unit_not_for_ingredient') {
    errors.unit = t('ingredients.unitNotForIngredient')
    shown = true
  }
  if (byField.unit === 'unit_not_for_source') {
    errors.unit = t('ingredients.unitNotForSource')
    shown = true
  }
  if (refusal) {
    errors.unit = refusal
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

        <SourceChip
          v-if="data.ingredient?.source"
          :source="data.ingredient.source"
          :name="data.ingredient.name"
          :busy="unlinking"
          @unlink="unlink"
        />
        <UpdatedValuesBanner
          v-if="data.ingredient?.source"
          :updates="data.ingredient.updated_values"
          :attributes="data.attributes"
          :busy="answering"
          @answer="answerUpdates"
        />

        <UnitField
          :model-value="draft.unit"
          :categories="unitCategories"
          :label="$t('ingredients.measuredIn')"
          :error="!!errors.unit"
          :error-message="errors.unit"
          hide-bottom-space
          @update:model-value="setUnit"
        />

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

        <ConversionsCard
          v-if="data.ingredient"
          :ingredient="data.ingredient"
          @changed="conversionsChanged"
        />
        <div
          v-else
          class="conversions-save-first text-grey-8"
        >
          {{ $t('conversions.saveFirst') }}
        </div>

        <div v-if="data.ingredient">
          <div class="row items-center q-gutter-x-sm text-grey-8">
            <span>{{ $t('ingredients.usedIn', { recipes: $t('count.recipes', data.ingredient.recipe_count) }) }}</span>
            <q-btn
              v-if="inUse && usedIn === null"
              flat
              dense
              no-caps
              color="primary"
              :label="$t('ingredients.show')"
              @click="showRecipes"
            />
          </div>
          <div
            v-if="usedInFailed"
            class="text-negative"
          >
            {{ $t('ingredients.usedInLoadFailed') }}
          </div>
          <q-list
            v-if="usedIn"
            dense
            class="used-in"
          >
            <q-item
              v-for="recipe in usedIn"
              :key="recipe.id"
              clickable
              :to="`/recipes/${recipe.id}`"
            >
              <q-item-section>{{ recipe.name }}</q-item-section>
              <q-item-section side>
                <q-icon name="chevron_right" />
              </q-item-section>
            </q-item>
          </q-list>
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

    <UnitChangeDialog />
    <ConfirmDelete
      v-model="deleteOpen"
      :name="data.ingredient?.name ?? ''"
      :warning="deleteWarning"
      @confirm="confirmDelete"
    />
  </q-page>
</template>

<style scoped>
.basis-field {
  width: 7em;
}
</style>
