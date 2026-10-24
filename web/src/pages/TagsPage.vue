<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../api/client'
import { fieldErrors } from '../api/errors'
import type { components } from '../api/schema'
import ConfirmDelete from '../components/ConfirmDelete.vue'
import LoadState from '../components/LoadState.vue'
import { useLoad } from '../composables/useLoad'

type Tag = components['schemas']['Tag']
type Fields = components['schemas']['TagFields']

const { t } = useI18n()

const { data: tags, loading, failed: loadFailed, load } = useLoad(() => api.GET('/api/tags'), [])

// The row open for editing (a tag's id, or 'new'), and its fields as typed.
const openId = ref<number | 'new' | null>(null)
const draft = reactive<Fields>({ name: '', derive: 'all' })
const errors = reactive({ name: '', save: '' })
const saving = ref(false)
const deleteOpen = ref(false)

const NEW_ROW: Tag = {
  id: -1,
  name: '',
  derive: 'all',
  ingredient_count: 0,
  recipe_count: 0,
  filter_count: 0,
}
const rows = computed(() => (openId.value === 'new' ? [...tags.value, NEW_ROW] : tags.value))
const openTag = computed(() => tags.value.find((tag) => tag.id === openId.value))

const deriveOptions = computed(() =>
  (['all', 'any'] as const).map((derive) => ({ value: derive, label: t(`tags.derive.${derive}`) })),
)

function rowKey(tag: Tag) {
  return tag === NEW_ROW ? 'new' : tag.id
}

function isOpen(tag: Tag) {
  return rowKey(tag) === openId.value
}

/** "When all ingredients have it · added by hand": no ingredient has the tag. */
function info(tag: Tag) {
  const rule = t(`tags.rule.${tag.derive}`)
  return tag.ingredient_count === 0 ? `${rule} · ${t('tags.byHand')}` : rule
}

function openRow(tag: Tag, id: number | 'new') {
  openId.value = id
  draft.name = tag.name
  draft.derive = tag.derive
  Object.assign(errors, { name: '', save: '' })
}

/** Open a row; an open row with changes is saved first, and stays open if that fails. */
async function open(tag: Tag) {
  if (isOpen(tag) || !(await done())) return
  openRow(tag, tag.id)
}

async function startNew() {
  if (openId.value === 'new' || !(await done())) return
  openRow(NEW_ROW, 'new')
}

/** Save the open row and close it; false if it has to stay open. */
async function done(): Promise<boolean> {
  if (openId.value === null) return true
  const fields: Fields = { name: draft.name.trim(), derive: draft.derive }
  errors.name = fields.name ? '' : t('common.nameRequired')
  errors.save = ''
  if (errors.name) return false

  const current = openTag.value
  if (current && current.name === fields.name && current.derive === fields.derive) {
    openId.value = null
    return true
  }

  saving.value = true
  try {
    const { data, error } = current
      ? await api.PUT('/api/tags/{tag_id}', { params: { path: { tag_id: current.id } }, body: fields })
      : await api.POST('/api/tags', { body: fields })
    if (data) {
      tags.value = current ? tags.value.map((tag) => (tag.id === data.id ? data : tag)) : [...tags.value, data]
      openId.value = null
      return true
    }
    if (fieldErrors(error).name === 'name_in_use') errors.name = t('tags.nameInUse')
    else errors.save = t('common.saveFailed')
  } catch {
    errors.save = t('common.saveFailed')
  } finally {
    saving.value = false
  }
  return false
}

const deleteWarning = computed(() => {
  const tag = openTag.value
  if (!tag || tag.ingredient_count + tag.recipe_count + tag.filter_count === 0) {
    return t('common.deleteNothing')
  }
  return t('tags.deleteRemoves', {
    ingredients: t('count.ingredients', tag.ingredient_count),
    recipes: t('count.recipes', tag.recipe_count),
    filters: t('count.planFilters', tag.filter_count),
  })
})

async function confirmDelete() {
  const tag = openTag.value
  if (!tag) return
  errors.save = ''
  try {
    const { response } = await api.DELETE('/api/tags/{tag_id}', { params: { path: { tag_id: tag.id } } })
    if (response.ok) {
      tags.value = tags.value.filter((other) => other.id !== tag.id)
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
      {{ $t('pages.tags') }}
    </h1>
    <p class="text-caption text-grey-8">
      {{ $t('tags.intro') }}
    </p>

    <LoadState
      :loading="loading"
      :failed="loadFailed"
      :message="$t('tags.loadFailed')"
      @retry="load"
    >
      <q-list
        bordered
        separator
        class="rounded-borders"
      >
        <q-item v-if="rows.length === 0">
          <q-item-section class="text-grey-8">
            {{ $t('tags.empty') }}
          </q-item-section>
        </q-item>

        <div
          v-for="tag in rows"
          :key="rowKey(tag)"
          class="tag-row"
        >
          <q-form
            v-if="isOpen(tag)"
            class="q-pa-md q-gutter-y-sm"
            @submit="done"
          >
            <q-input
              v-model="draft.name"
              outlined
              dense
              autofocus
              :label="$t('common.name')"
              :error="!!errors.name"
              :error-message="errors.name"
            />
            <div
              :id="`derive-label-${rowKey(tag)}`"
              class="text-body2"
            >
              {{ $t('tags.deriveLabel') }}
            </div>
            <q-option-group
              v-model="draft.derive"
              :options="deriveOptions"
              type="radio"
              dense
              role="radiogroup"
              :aria-labelledby="`derive-label-${rowKey(tag)}`"
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
            @click="open(tag)"
          >
            <q-item-section>
              <q-item-label>{{ tag.name }}</q-item-label>
              <q-item-label caption>
                {{ info(tag) }}
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
          <q-item-section>{{ $t('tags.new') }}</q-item-section>
        </q-item>
      </q-list>
    </LoadState>

    <ConfirmDelete
      v-model="deleteOpen"
      :name="openTag?.name ?? ''"
      :warning="deleteWarning"
      @confirm="confirmDelete"
    />
  </q-page>
</template>
