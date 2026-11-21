import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../../../api/client'
import { errorType } from '../../../api/errors'
import { useLoad } from '../../hooks/useLoad'
import { useT } from '../../i18n/i18n'
import { importDraftStore } from '../../stores/importDraft'
import { Button, buttonClass } from '../../ui/button/Button'
import { Field, Fieldset } from '../../ui/field/Field'
import { Segmented } from '../../ui/segmented/Segmented'
import './import.css'

type Mode = 'link' | 'text'

/** The refusals that have their own sentence (`import.error.<type>`);
 * anything else is `import.error.other`. */
const REFUSALS = new Set([
  'text_required',
  'too_long',
  'no_recipe',
  'page_unreadable',
  'url_required',
  'url_invalid',
  'ai_failed',
  'limit_reached',
  'ai_not_configured',
])

/** The message key for a refused import: a page with no recipe on it says
 * to paste the text instead. */
function refusalKey(type: string | null, mode: Mode): string {
  if (type === 'no_recipe' && mode === 'link') return 'import.error.no_recipe_page'
  return type && REFUSALS.has(type) ? `import.error.${type}` : 'import.error.other'
}

/**
 * Importing a recipe (a lazy route): a link to a recipe page or the pasted
 * text, which the AI drafts into a recipe. A finished import leaves the
 * draft in the imported-draft store and opens a new recipe spread, which
 * takes it; nothing is stored until Save there. Both inputs keep their text
 * when switching between them and after a refusal.
 */
export function Import() {
  const t = useT()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('link')
  const [link, setLink] = useState('')
  const [text, setText] = useState('')
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // a second submit before the first re-render must not post twice
  const busy = useRef(false)
  const headingId = useId()

  // Whether the server has an AI key: unknown until health answers (so the
  // hint does not flash), and an unreadable answer counts as no.
  const health = useLoad((signal) => api.GET('/api/health', { signal }))
  const configured = health.data ? health.data.ai_configured === true : health.failed ? false : null

  // no stale draft from an earlier import waits for the next new recipe
  useEffect(() => {
    importDraftStore.put(null)
  }, [])

  const value = mode === 'link' ? link : text
  const canImport = configured === true && !reading && value.trim() !== ''

  async function run(event: FormEvent) {
    event.preventDefault()
    if (!canImport || busy.current) return
    busy.current = true
    setReading(true)
    setError(null)
    try {
      const { data, error: failure } = await api.POST('/api/recipe-imports', {
        body: mode === 'link' ? { url: link.trim() } : { text },
      })
      if (data) {
        importDraftStore.put(data)
        await navigate('/recipes/new')
        return
      }
      setError(t(refusalKey(errorType(failure), mode)))
    } catch {
      setError(t('import.error.other'))
    } finally {
      busy.current = false
      setReading(false)
    }
  }

  return (
    <article className="import" aria-labelledby={headingId}>
      <div className="cover import-cover">
        <p className="kicker">{t('import.cover.kicker')}</p>
        <h1 id={headingId} className="cover-title display import-title">
          {t('import.cover.title')} <em>{t('import.cover.titleEm')}</em>
        </h1>
        <p className="standfirst import-standfirst">{t('import.cover.standfirst')}</p>
      </div>

      <form className="import-form" onSubmit={run} noValidate aria-busy={reading}>
        <Fieldset legend={t('import.from')}>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'link', label: t('import.fromLink') },
              { value: 'text', label: t('import.fromText') },
            ]}
          />
        </Fieldset>

        {mode === 'link' ? (
          <Field label={t('import.link')} hint={t('import.linkHint')}>
            {(control) => (
              <input
                {...control}
                className="import-link"
                name="url"
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder={t('import.linkPlaceholder')}
                readOnly={reading}
                value={link}
                onChange={(event) => setLink(event.target.value)}
              />
            )}
          </Field>
        ) : (
          <Field label={t('import.text')} hint={t('import.textHint')}>
            {(control) => (
              <textarea
                {...control}
                className="import-text"
                name="text"
                rows={8}
                readOnly={reading}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            )}
          </Field>
        )}

        {error ? (
          <p className="import-error" role="alert">
            {error}
          </p>
        ) : null}

        {configured === false ? (
          <p className="import-no-key">
            {t('import.noKey')}{' '}
            <Link to="/recipes/new" className="import-by-hand">
              {t('import.writeByHand')}
            </Link>
          </p>
        ) : null}

        <div className="import-actions">
          <Button type="submit" variant="primary" disabled={!canImport} data-reading={reading || undefined} className="import-run">
            {reading ? (
              <>
                <span className="import-pen" aria-hidden="true" />
                {t('import.reading')}
              </>
            ) : (
              t('import.run')
            )}
          </Button>
          <Link to="/recipes" className={buttonClass({ variant: 'text-plain' }, 'import-cancel')}>
            {t('common.cancel')}
          </Link>
        </div>
        {/* the wait, said once to screen readers (the button's words change too) */}
        <p className="visually-hidden" role="status">
          {reading ? t('import.reading') : ''}
        </p>
      </form>
    </article>
  )
}
