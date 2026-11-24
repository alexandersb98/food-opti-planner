import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { api } from '../../../api/client'
import { fieldErrors } from '../../../api/errors'
import type { GroupQuestion, Tag, TagFields } from '../../../api/types'
import { useLoad } from '../../hooks/useLoad'
import { useT } from '../../i18n/i18n'
import { tagsList } from '../../stores/sharedLists'
import { buttonClass } from '../../ui/button/Button'
import { useConfirm } from '../../ui/confirm/Confirm'
import { LoadState } from '../../ui/loadState/LoadState'
import { GroupQuestions } from './GroupQuestions'
import { TagEditor, type Draft, type DraftErrors } from './TagEditor'
import { deleteWarning, otherMembers, ruleLine } from './tagText'
import './tags.css'

/** The row being added, before it is saved. */
const NEW_TAG: Tag = {
  id: -1,
  name: '',
  derive: 'all',
  source: null,
  group: [],
  ingredient_count: 0,
  recipe_count: 0,
  filter_count: 0,
}

const NO_ERRORS: DraftErrors = { name: '', save: '' }

/** The page title's id: the list is named after it. */
const TITLE_ID = 'tags-title'

type OpenId = number | 'new' | null

/** The id of a closed entry's button ("+ New tag" for 'new'), to give it
 * focus back. */
function entryId(key: number | 'new') {
  return key === 'new' ? 'tags-new' : `tags-entry-${key}`
}

function sameIds(a: readonly number[], b: readonly number[]) {
  return a.length === b.length && a.every((id) => b.includes(id))
}

/** The list with a new tag where the server lists it: after the tags made
 * by hand, before the source tags. */
function withNew(tags: Tag[], created: Tag) {
  const firstSource = tags.findIndex((tag) => tag.source)
  const at = firstSource === -1 ? tags.length : firstSource
  return [...tags.slice(0, at), created, ...tags.slice(at)]
}

/**
 * The Tags page: every tag as an entry of a D2 list, made by hand first and
 * source tags after (the server's order), each with its rule and where it
 * comes from. One entry opens at a time, annotated in place, and is saved
 * when it closes (Done, or opening another). The server's questions about
 * equivalent tags are asked in a sheet, one at a time.
 */
export function Tags() {
  const t = useT()
  const page = useLoad(() => tagsList.loadCall())
  const tags = page.data
  const byId = useMemo(() => new Map((tags ?? []).map((tag) => [tag.id, tag])), [tags])

  const [openId, setOpenId] = useState<OpenId>(null)
  const [draft, setDraft] = useState<Draft>({ name: '', derive: 'all', equivalentIds: [] })
  const [errors, setErrors] = useState<DraftErrors>(NO_ERRORS)
  const [saving, setSaving] = useState(false)
  const [confirm, confirmSheet] = useConfirm()
  // The questions of a 409 being asked; `key` mounts each set afresh.
  const [asking, setAsking] = useState<{ key: number; questions: GroupQuestion[]; open: boolean } | null>(null)
  const answerQuestions = useRef<((yes: boolean[]) => void) | null>(null)
  // A save is under way: another Done, row or delete is ignored meanwhile.
  const busy = useRef(false)

  // After a row closes, focus goes back to its entry (or to "+ New tag").
  const focusAfter = useRef<number | 'new' | null>(null)
  useEffect(() => {
    if (openId !== null || focusAfter.current === null) return
    document.getElementById(entryId(focusAfter.current))?.focus()
    focusAfter.current = null
  }, [openId, tags])

  if (!tags) {
    return (
      <article className="tags">
        <Cover />
        <LoadState of={page} message={t('tags.loadFailed')} />
      </article>
    )
  }

  const openTag = typeof openId === 'number' ? byId.get(openId) : undefined
  const rows = openId === 'new' ? [...tags, NEW_TAG] : tags

  /** Close the open row, then focus the entry `focus` (none if null). */
  function close(focus: number | 'new' | null) {
    focusAfter.current = focus
    setOpenId(null)
  }

  function openRow(tag: Tag, id: number | 'new') {
    setOpenId(id)
    setDraft({ name: tag.name, derive: tag.derive, equivalentIds: otherMembers(tag) })
    setErrors(NO_ERRORS)
  }

  /** Open a row; an open row with changes is saved first, and stays open if
   * that fails. */
  async function open(tag: Tag) {
    if (busy.current || openId === tag.id || !(await done({ focusAfter: false }))) return
    openRow(tag, tag.id)
  }

  async function startNew() {
    if (busy.current || openId === 'new' || !(await done({ focusAfter: false }))) return
    openRow(NEW_TAG, 'new')
  }

  /** Save the open row and close it; false if it has to stay open. */
  async function done({ focusAfter = true } = {}): Promise<boolean> {
    if (openId === null) return true
    if (busy.current) return false
    busy.current = true
    try {
      return await submit(openTag, draft, focusAfter)
    } finally {
      busy.current = false
    }
  }

  async function submit(current: Tag | undefined, typed: Draft, focusAfter: boolean): Promise<boolean> {
    const fields: TagFields = { name: typed.name.trim(), derive: typed.derive }
    if (!fields.name) {
      setErrors({ name: t('common.nameRequired'), save: '' })
      return false
    }
    setErrors(NO_ERRORS)
    if (
      current &&
      current.name === fields.name &&
      current.derive === fields.derive &&
      sameIds(typed.equivalentIds, otherMembers(current))
    ) {
      close(focusAfter ? current.id : null)
      return true
    }
    setSaving(true)
    try {
      return await send(current, fields, typed, false, focusAfter)
    } catch {
      setErrors({ name: '', save: t('common.saveFailed') })
      return false
    } finally {
      setSaving(false)
    }
  }

  /** Send the draft. A 409 with questions is asked; yes to all sends the
   * same body again with `confirm`, a no changes the draft and saves again. */
  async function send(
    current: Tag | undefined,
    fields: TagFields,
    typed: Draft,
    confirmed: boolean,
    focusAfter: boolean,
  ): Promise<boolean> {
    const { data, error, response } = current
      ? await api.PUT('/api/tags/{tag_id}', {
          params: { path: { tag_id: current.id } },
          body: { ...fields, equivalent_tag_ids: [...typed.equivalentIds], confirm: confirmed },
        })
      : await api.POST('/api/tags', { body: fields })
    if (data) {
      page.setData((list) =>
        current ? list.map((tag) => (tag.id === data.id ? data : tag)) : withNew(list, data),
      )
      close(focusAfter ? data.id : null)
      // a change to a group changes the other members too
      if (current && (current.group.length > 0 || data.group.length > 0)) page.reload()
      return true
    }
    const asked = response.status === 409 && error && 'questions' in error ? error.questions : null
    if (asked && current) {
      setSaving(false)
      const yes = await ask(asked)
      if (yes.every(Boolean)) {
        setSaving(true)
        return send(current, fields, typed, true, focusAfter)
      }
      const next: Draft = { ...typed, equivalentIds: [...typed.equivalentIds] }
      asked.forEach((question, i) => {
        if (yes[i]) return
        if (question.type === 'change_rule') next.derive = current.derive
        else next.equivalentIds = next.equivalentIds.filter((id) => id !== question.tag_id)
      })
      setDraft(next)
      return submit(current, next, focusAfter)
    }
    if (fieldErrors(error).name === 'name_in_use') setErrors({ name: t('tags.nameInUse'), save: '' })
    else setErrors({ name: '', save: t('common.saveFailed') })
    return false
  }

  /** Ask the questions of a 409; resolves with yes or no for each, in order. */
  function ask(questions: GroupQuestion[]) {
    return new Promise<boolean[]>((resolve) => {
      answerQuestions.current = resolve
      setAsking((previous) => ({ key: (previous?.key ?? 0) + 1, questions, open: true }))
    })
  }

  function onAnswer(yes: boolean[]) {
    setAsking((previous) => previous && { ...previous, open: false })
    answerQuestions.current?.(yes)
    answerQuestions.current = null
  }

  async function remove() {
    const tag = openTag
    if (!tag || busy.current) return
    const sure = await confirm({
      title: t('common.deleteTitle', { name: tag.name }),
      message: deleteWarning(t, tag),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (!sure) return
    setErrors(NO_ERRORS)
    busy.current = true
    try {
      const { response } = await api.DELETE('/api/tags/{tag_id}', { params: { path: { tag_id: tag.id } } })
      if (!response.ok) {
        setErrors({ name: '', save: t('common.deleteFailed') })
        return
      }
      page.setData((list) => list.filter((other) => other.id !== tag.id))
      close('new')
      if (tag.group.length > 0) page.reload()
    } catch {
      setErrors({ name: '', save: t('common.deleteFailed') })
    } finally {
      busy.current = false
    }
  }

  return (
    <article className="tags">
      <Cover count={tags.length} />

      {rows.length === 0 ? (
        <div className="empty-state tags-empty">
          <p>{t('tags.empty')}</p>
        </div>
      ) : (
        <ul className="tags-list" aria-labelledby={TITLE_ID}>
          {rows.map((tag) => {
            const key = tag === NEW_TAG ? 'new' : tag.id
            const isOpen = key === openId
            return (
              <li key={key} className={isOpen ? 'tags-entry tags-entry-open' : 'tags-entry'}>
                {isOpen ? (
                  <TagEditor
                    tag={tag}
                    isNew={key === 'new'}
                    draft={draft}
                    onDraft={(update) => setDraft((previous) => ({ ...previous, ...update }))}
                    errors={errors}
                    saving={saving}
                    tags={tags}
                    byId={byId}
                    onDone={() => void done()}
                    onCancel={() => close('new')}
                    onDelete={() => void remove()}
                  />
                ) : (
                  <button
                    id={entryId(tag.id)}
                    type="button"
                    className="tags-row"
                    style={tag.source ? ({ '--tags-source': tag.source.colour } as CSSProperties) : undefined}
                    onClick={() => void open(tag)}
                  >
                    <span className="tags-row-text">
                      <span className="tags-row-name">
                        {tag.source ? <span className="tags-swatch" aria-hidden="true" /> : null}
                        {tag.name}
                      </span>
                      <span className="tags-row-rule">{ruleLine(t, tag, byId)}</span>
                    </span>
                    <span className="tags-chev" aria-hidden="true">
                      ›
                    </span>
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {openId === 'new' ? null : (
        <button
          id={entryId('new')}
          type="button"
          className={buttonClass({ variant: 'text' }, 'tags-new')}
          onClick={() => void startNew()}
        >
          {t('tags.new')}
        </button>
      )}

      {asking ? (
        <GroupQuestions key={asking.key} open={asking.open} questions={asking.questions} byId={byId} onAnswer={onAnswer} />
      ) : null}
      {confirmSheet}
    </article>
  )
}

/** The page's opener: how many tags, the title and what tags are. */
function Cover({ count }: { count?: number }) {
  const t = useT()
  return (
    <div className="cover tags-cover">
      {count === undefined ? null : <p className="kicker">{t('shell.count.tags', count)}</p>}
      <h1 id={TITLE_ID} className="cover-title display tags-title">
        <em>{t('shell.pages.tags.title')}</em>
      </h1>
      <p className="standfirst tags-standfirst">{t('tags.intro')}</p>
    </div>
  )
}
