<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../api/client'
import type { components } from '../api/schema'

type Tag = components['schemas']['Tag']
type Fields = components['schemas']['TagFields']

const { t } = useI18n()

const tags = ref<Tag[]>([])
const loading = ref(true)
const loadFailed = ref(false)

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

async function load() {
  loading.value = true
  loadFailed.value = false
  try {
    const { data } = await api.GET('/api/tags')
    if (data) tags.value = data
    else loadFailed.value = true
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(load)

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
  errors.name = fields.name ? '' : t('tags.nameRequired')
  errors.save = ''
  if (errors.name) return false

  const current = openTag.value
  if (current && current.name === fields.name && current.derive === fields.derive) {
    openId.value = null
    return true
  }

  saving.value = true
  try {
    const { data, response } = current
      ? await api.PUT('/api/tags/{tag_id}', { params: { path: { tag_id: current.id } }, body: fields })
      : await api.POST('/api/tags', { body: fields })
    if (data) {
      tags.value = current ? tags.value.map((tag) => (tag.id === data.id ? data : tag)) : [...tags.value, data]
      openId.value = null
      return true
    }
    if (response.status === 409) errors.name = t('tags.nameInUse')
    else errors.save = t('tags.saveFailed')
  } catch {
    errors.save = t('tags.saveFailed')
  } finally {
    saving.value = false
  }
  return false
}

const deleteWarning = computed(() => {
  const tag = openTag.value
  if (!tag || tag.ingredient_count + tag.recipe_count + tag.filter_count === 0) {
    return t('tags.deleteNothing')
  }
  return t('tags.deleteRemoves', {
    ingredients: t('tags.ingredientCount', tag.ingredient_count),
    recipes: t('tags.recipeCount', tag.recipe_count),
    filters: t('tags.filterCount', tag.filter_count),
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
      errors.save = t('tags.deleteFailed')
    }
  } catch {
    errors.save = t('tags.deleteFailed')
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

    <div
      v-if="loadFailed"
      class="q-gutter-sm"
    >
      <p>{{ $t('tags.loadFailed') }}</p>
      <q-btn
        outline
        color="primary"
        :label="$t('tags.retry')"
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
            :label="$t('tags.name')"
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
              :label="$t('tags.cancel')"
              @click="openId = null"
            />
            <q-btn
              v-else
              class="col"
              outline
              color="negative"
              :label="$t('tags.delete')"
              @click="deleteOpen = true"
            />
            <q-btn
              class="col"
              type="submit"
              color="primary"
              :label="$t('tags.done')"
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

    <q-dialog v-model="deleteOpen">
      <q-card>
        <q-card-section>
          <div class="text-h6">
            {{ $t('tags.deleteTitle', { name: openTag?.name }) }}
          </div>
          <p class="q-mb-none q-mt-sm">
            {{ deleteWarning }}
          </p>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn
            v-close-popup
            flat
            :label="$t('tags.cancel')"
          />
          <q-btn
            flat
            color="negative"
            :label="$t('tags.delete')"
            @click="confirmDelete"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>
