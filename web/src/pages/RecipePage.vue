<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api/client'
import { fieldErrors } from '../api/errors'
import type { Attribute, Ingredient, Recipe, RecipeFields as Fields, Tag } from '../api/types'
import ConfirmDelete from '../components/ConfirmDelete.vue'
import EditorHeader from '../components/EditorHeader.vue'
import IngredientPicker from '../components/IngredientPicker.vue'
import LoadState from '../components/LoadState.vue'
import { loadAll, useLoad } from '../composables/useLoad'
import { valueText } from '../format'
import { byId } from '../lists'
import { typedNumber } from '../numbers'
import { portionTotals } from '../totals'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

// The editor for a new recipe (/recipes/new) or an existing one.
const id = route.params.id === undefined ? null : Number(route.params.id)

// The fields as typed. Amounts are per portion, in each ingredient's unit.
const draft = reactive({
  name: '',
  items: [] as { ingredientId: number; amount: string }[],
  extraTagIds: new Set<number>(),
  min: '0.5',
  max: '2',
  inSteps: false,
  step: '0.5',
  hardMax: '', // empty: 3 times max, the library's default
  penalty: '1',
})
const errors = reactive({
  name: '',
  items: '',
  amounts: {} as Partial<Record<number, string>>, // by ingredient id
  min: '',
  max: '',
  step: '',
  hardMax: '',
  penalty: '',
  save: '',
})
const saving = ref(false)
const deleteOpen = ref(false)
const pickerOpen = ref(false)
// Open when it holds something other than the defaults, or a mistake.
const advancedOpen = ref(false)
// The tags the ingredients give the recipe, asked of the server, which
// knows each tag's rule.
const derivedTagIds = ref<number[]>([])
// The stored recipe's ingredient ids, joined, and the tags they give it.
let stored = { ids: '', tagIds: [] as number[] }

const { data, loading, failed, load } = useLoad(
  async () => {
    const loaded = await loadAll({
      attributes: api.GET('/api/attributes'),
      tags: api.GET('/api/tags'),
      ingredients: api.GET('/api/ingredients'),
      recipe:
        id === null
          ? Promise.resolve({ data: null })
          : api.GET('/api/recipes/{recipe_id}', { params: { path: { recipe_id: id } } }),
    })
    if (loaded.data?.recipe) fillDraft(loaded.data.recipe)
    return loaded
  },
  {
    attributes: [] as Attribute[],
    tags: [] as Tag[],
    ingredients: [] as Ingredient[],
    recipe: null as Recipe | null,
  },
)

function fillDraft(recipe: Recipe) {
  draft.name = recipe.name
  draft.items = recipe.items.map(({ ingredient_id, amount }) => ({ ingredientId: ingredient_id, amount }))
  draft.extraTagIds = new Set(recipe.extra_tag_ids)
  draft.min = recipe.min_multiplier
  draft.max = recipe.max_multiplier
  draft.inSteps = recipe.step !== null
  draft.step = recipe.step ?? draft.step
  draft.hardMax = recipe.hard_max_multiplier ?? ''
  draft.penalty = recipe.serving_cap_weight
  advancedOpen.value = draft.hardMax !== '' || draft.penalty !== '1'
  stored = { ids: recipe.items.map((item) => item.ingredient_id).join(','), tagIds: recipe.derived_tag_ids }
  derivedTagIds.value = recipe.derived_tag_ids
}

const ingredients = computed(() => byId(data.value.ingredients))
const inRecipe = computed(() => new Set(draft.items.map((item) => item.ingredientId)))

function addIngredient(ingredient: Ingredient) {
  draft.items.push({ ingredientId: ingredient.id, amount: '' })
  errors.items = ''
}

function removeIngredient(index: number) {
  draft.items.splice(index, 1)
}

// Asked again whenever the ingredients change; an answer to an older
// question is dropped. The stored recipe's ingredients come with their tags.
let asked = 0
watch(
  () => draft.items.map((item) => item.ingredientId).join(','),
  async (ids) => {
    const question = ++asked
    if (ids === stored.ids || ids === '') {
      derivedTagIds.value = ids === '' ? [] : stored.tagIds
      return
    }
    const ingredientIds = ids.split(',').map(Number)
    try {
      const { data: tagIds } = await api.POST('/api/recipes/derived-tags', {
        body: { ingredient_ids: ingredientIds },
      })
      if (question === asked) derivedTagIds.value = tagIds ?? []
    } catch {
      if (question === asked) derivedTagIds.value = []
    }
  },
)

/** Live totals for one portion, by attribute; an amount not yet a number counts as 0. */
const totals = computed(() => {
  const amounts = draft.items.flatMap(({ ingredientId, amount }) => {
    const ingredient = ingredients.value.get(ingredientId)
    const number = typedNumber(amount)
    return ingredient && number !== null ? [{ ingredient, amount: number }] : []
  })
  return portionTotals(amounts, data.value.attributes)
})

const derivedTags = computed(() => data.value.tags.filter((tag) => derivedTagIds.value.includes(tag.id)))
const extraTags = computed(() => data.value.tags.filter((tag) => draft.extraTagIds.has(tag.id)))
/** What "+ Add tag" offers: tags the recipe doesn't have yet. */
const addableTags = computed(() =>
  data.value.tags.filter((tag) => !draft.extraTagIds.has(tag.id) && !derivedTagIds.value.includes(tag.id)),
)

function addTag(tag: Tag) {
  draft.extraTagIds = new Set([...draft.extraTagIds, tag.id])
}

function removeTag(tag: Tag) {
  const tags = new Set(draft.extraTagIds)
  tags.delete(tag.id)
  draft.extraTagIds = tags
}

/** The hard upper limit when none is typed: 3 times the largest portion. */
const defaultHardMax = computed(() => {
  const max = multiplier(draft.max)
  return max === null ? '' : String((3 * max) / 1000)
})

/** A multiplier as typed, in whole thousandths as the planner holds it
 * (0.5 is 500), or null unless it is above 0 with at most 3 decimals and
 * 9 digits before the point. */
function multiplier(text: string): number | null {
  const number = typedNumber(text)
  if (number === null || !/^\d{1,9}(\.\d{0,3})?$|^\.\d{1,3}$/.test(number)) return null
  const thousandths = Math.round(Number(number) * 1000)
  return thousandths > 0 ? thousandths : null
}

/** The fields to send, or null after marking what is wrong. */
function checked(): Fields | null {
  const fields: Fields = {
    name: draft.name.trim(),
    items: [],
    extra_tag_ids: data.value.tags.filter((tag) => draft.extraTagIds.has(tag.id)).map((tag) => tag.id),
    min_multiplier: typedNumber(draft.min) ?? '',
    max_multiplier: typedNumber(draft.max) ?? '',
    step: draft.inSteps ? (typedNumber(draft.step) ?? '') : null,
    hard_max_multiplier: draft.hardMax.trim() === '' ? null : (typedNumber(draft.hardMax) ?? ''),
    serving_cap_weight: typedNumber(draft.penalty) ?? '',
  }
  errors.name = fields.name ? '' : t('common.nameRequired')
  errors.items = draft.items.length > 0 ? '' : t('recipes.noItems')
  errors.amounts = {}
  for (const { ingredientId, amount } of draft.items) {
    const number = typedNumber(amount)
    if (number === null || Number(number) <= 0) errors.amounts[ingredientId] = t('recipes.amountInvalid')
    else fields.items.push({ ingredient_id: ingredientId, amount: number })
  }

  const [min, max, step] = [multiplier(draft.min), multiplier(draft.max), multiplier(draft.step)]
  const noHardMax = fields.hard_max_multiplier === null
  const hardMax = noHardMax ? null : multiplier(draft.hardMax)
  const invalid = t('recipes.multiplierInvalid')
  errors.min = min === null ? invalid : ''
  errors.max = max === null ? invalid : ''
  errors.step = draft.inSteps && step === null ? invalid : ''
  errors.hardMax = !noHardMax && hardMax === null ? invalid : ''
  // The library's rules across fields, which the server checks too.
  if (min !== null && max !== null && max < min) errors.max = t('recipes.belowMin')
  if (max !== null && hardMax !== null && hardMax < max) errors.hardMax = t('recipes.belowMax')
  if (draft.inSteps && min !== null && step !== null && min % step !== 0) errors.min = t('recipes.notInSteps')
  const penalty = typedNumber(draft.penalty)
  errors.penalty = penalty !== null && Number(penalty) >= 0 ? '' : t('recipes.penaltyInvalid')

  if (errors.hardMax || errors.penalty) advancedOpen.value = true

  const wrong =
    errors.name ||
    errors.items ||
    Object.keys(errors.amounts).length > 0 ||
    errors.min ||
    errors.max ||
    errors.step ||
    errors.hardMax ||
    errors.penalty
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
        ? await api.POST('/api/recipes', { body: fields })
        : await api.PUT('/api/recipes/{recipe_id}', { params: { path: { recipe_id: id } }, body: fields })
    if (saved) {
      await router.push('/recipes')
      return
    }
    showServerErrors(fieldErrors(error), fields)
  } catch {
    errors.save = t('common.saveFailed')
  } finally {
    saving.value = false
  }
}

/** A name in use, or a number the server can't take, on its field;
 * anything else just failed. */
function showServerErrors(byField: Partial<Record<string, string>>, fields: Fields) {
  const messages: Partial<Record<string, string>> = {
    below_min: t('recipes.belowMin'),
    below_max: t('recipes.belowMax'),
    not_in_steps: t('recipes.notInSteps'),
  }
  let shown = false
  function show(field: string, set: (message: string) => void, otherwise: string) {
    const type = byField[field]
    if (!type) return
    set(messages[type] ?? otherwise)
    shown = true
  }
  if (byField.name === 'name_in_use') {
    errors.name = t('recipes.nameInUse')
    shown = true
  }
  const tooLong = t('recipes.multiplierTooLong')
  show('min_multiplier', (m) => (errors.min = m), tooLong)
  show('max_multiplier', (m) => (errors.max = m), tooLong)
  show('step', (m) => (errors.step = m), tooLong)
  show('hard_max_multiplier', (m) => (errors.hardMax = m), tooLong)
  show('serving_cap_weight', (m) => (errors.penalty = m), t('ingredients.numberTooLong'))
  if (errors.hardMax || errors.penalty) advancedOpen.value = true
  fields.items.forEach(({ ingredient_id }, i) =>
    show(`items.${i}.amount`, (m) => (errors.amounts[ingredient_id] = m), t('ingredients.numberTooLong')),
  )
  if (!shown) errors.save = t('common.saveFailed')
}

async function confirmDelete() {
  if (id === null) return
  errors.save = ''
  try {
    const { response } = await api.DELETE('/api/recipes/{recipe_id}', { params: { path: { recipe_id: id } } })
    if (response.ok) {
      deleteOpen.value = false
      await router.push('/recipes')
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
      back="/recipes"
      :title="id === null ? $t('recipes.new') : $t('recipes.edit')"
    />

    <LoadState
      :loading="loading"
      :failed="failed"
      :message="$t('recipes.loadOneFailed')"
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

        <q-card
          flat
          bordered
        >
          <q-card-section class="q-gutter-y-sm">
            <div class="text-subtitle1">
              {{ $t('recipes.items') }}
            </div>
            <div
              v-for="(item, index) in draft.items"
              :key="item.ingredientId"
              class="row items-start no-wrap q-gutter-x-sm recipe-item"
            >
              <div class="col item-name">
                {{ ingredients.get(item.ingredientId)?.name }}
              </div>
              <q-input
                v-model="item.amount"
                class="amount-field"
                outlined
                dense
                inputmode="decimal"
                :aria-label="$t('recipes.amountOf', { name: ingredients.get(item.ingredientId)?.name })"
                :suffix="ingredients.get(item.ingredientId)?.unit"
                :error="!!errors.amounts[item.ingredientId]"
                :error-message="errors.amounts[item.ingredientId]"
                hide-bottom-space
              />
              <q-btn
                flat
                round
                dense
                icon="close"
                :aria-label="$t('recipes.remove', { name: ingredients.get(item.ingredientId)?.name })"
                @click="removeIngredient(index)"
              />
            </div>
            <div
              v-if="errors.items"
              class="text-negative text-caption"
            >
              {{ errors.items }}
            </div>
            <q-btn
              flat
              no-caps
              color="primary"
              :label="$t('recipes.addIngredientButton')"
              @click="pickerOpen = true"
            />
          </q-card-section>
        </q-card>

        <q-card
          flat
          bordered
        >
          <q-card-section>
            <div class="text-subtitle1 q-mb-xs">
              {{ $t('recipes.perPortion') }}
            </div>
            <div
              v-if="data.attributes.length === 0"
              class="text-grey-8"
            >
              {{ $t('ingredients.noAttributes') }}
            </div>
            <div
              v-for="attribute in data.attributes"
              :key="attribute.id"
              class="portion-total"
            >
              {{ valueText(attribute, totals.get(attribute.id) ?? '0') }}
            </div>
          </q-card-section>
        </q-card>

        <div>
          <div class="text-subtitle1">
            {{ $t('recipes.tags') }}
          </div>
          <div class="text-caption text-grey-8">
            {{ $t('recipes.fromIngredients') }}
          </div>
          <div class="derived-tags">
            <q-chip
              v-for="tag in derivedTags"
              :key="tag.id"
              :label="tag.name"
            />
            <span
              v-if="derivedTags.length === 0"
              class="text-grey-8"
            >{{ $t('recipes.noTags') }}</span>
          </div>
          <div class="text-caption text-grey-8 q-mt-sm">
            {{ $t('recipes.addedByHand') }}
          </div>
          <div class="extra-tags row items-center">
            <q-chip
              v-for="tag in extraTags"
              :key="tag.id"
              removable
              color="primary"
              text-color="white"
              :label="tag.name"
              :remove-aria-label="$t('recipes.remove', { name: tag.name })"
              @remove="removeTag(tag)"
            />
            <q-btn
              flat
              no-caps
              dense
              color="primary"
              :label="$t('recipes.addTag')"
              :disable="addableTags.length === 0"
            >
              <q-menu>
                <q-list>
                  <q-item
                    v-for="tag in addableTags"
                    :key="tag.id"
                    v-close-popup
                    clickable
                    @click="addTag(tag)"
                  >
                    <q-item-section>{{ tag.name }}</q-item-section>
                  </q-item>
                </q-list>
              </q-menu>
            </q-btn>
          </div>
        </div>

        <q-card
          flat
          bordered
        >
          <q-card-section class="q-gutter-y-sm">
            <div class="text-subtitle1">
              {{ $t('recipes.portionSize') }}
            </div>
            <div class="row q-col-gutter-sm">
              <q-input
                v-model="draft.min"
                class="col-6"
                outlined
                dense
                inputmode="decimal"
                :label="$t('recipes.from')"
                suffix="×"
                :error="!!errors.min"
                :error-message="errors.min"
                hide-bottom-space
              />
              <q-input
                v-model="draft.max"
                class="col-6"
                outlined
                dense
                inputmode="decimal"
                :label="$t('recipes.to')"
                suffix="×"
                :error="!!errors.max"
                :error-message="errors.max"
                hide-bottom-space
              />
            </div>
            <q-btn-toggle
              v-model="draft.inSteps"
              spread
              no-caps
              toggle-color="primary"
              :options="[
                { label: $t('recipes.anyAmount'), value: false },
                { label: $t('recipes.inSteps'), value: true },
              ]"
            />
            <q-input
              v-if="draft.inSteps"
              v-model="draft.step"
              outlined
              dense
              inputmode="decimal"
              :label="$t('recipes.step')"
              suffix="×"
              :error="!!errors.step"
              :error-message="errors.step"
              hide-bottom-space
            />
            <q-expansion-item
              v-model="advancedOpen"
              dense
              :label="$t('recipes.advanced')"
            >
              <div class="q-gutter-y-sm q-pt-sm">
                <q-input
                  v-model="draft.hardMax"
                  outlined
                  dense
                  inputmode="decimal"
                  :label="$t('recipes.hardMax')"
                  :placeholder="defaultHardMax"
                  suffix="×"
                  :hint="defaultHardMax ? $t('recipes.hardMaxHint', { max: defaultHardMax }) : $t('recipes.hardMaxHintNoMax')"
                  :error="!!errors.hardMax"
                  :error-message="errors.hardMax"
                />
                <q-input
                  v-model="draft.penalty"
                  outlined
                  dense
                  inputmode="decimal"
                  :label="$t('recipes.penalty')"
                  :hint="$t('recipes.penaltyHint')"
                  :error="!!errors.penalty"
                  :error-message="errors.penalty"
                />
              </div>
            </q-expansion-item>
          </q-card-section>
        </q-card>

        <div
          v-if="errors.save"
          class="text-negative"
          role="alert"
        >
          {{ errors.save }}
        </div>
        <div class="row q-gutter-sm">
          <q-btn
            v-if="data.recipe"
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
            :label="$t('common.save')"
            :loading="saving"
          />
        </div>
      </q-form>
    </LoadState>

    <IngredientPicker
      v-model="pickerOpen"
      :ingredients="data.ingredients"
      :exclude="inRecipe"
      @pick="addIngredient"
    />
    <ConfirmDelete
      v-model="deleteOpen"
      :name="data.recipe?.name ?? ''"
      :warning="$t('common.deleteNothing')"
      @confirm="confirmDelete"
    />
  </q-page>
</template>

<style scoped>
.item-name {
  padding-top: 8px;
  overflow-wrap: anywhere;
}
.amount-field {
  width: 8.5em;
}
</style>
