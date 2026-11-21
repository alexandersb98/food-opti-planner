import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { api } from '../../../api/client'
import type { DataSource } from '../../../api/types'
import { useLocale, useT } from '../../i18n/i18n'

/**
 * The source's particulars as a ruled list: version, when it was imported,
 * its attribution (when it has one) and its colour. The colour is saved
 * when the picker closes (the input's `change`), not on every drag through
 * it (`input`); a refused save says so and goes back to the stored colour.
 */
export function SourceFacts({
  source,
  sourceKey,
  onSaved,
}: {
  source: DataSource
  sourceKey: string
  onSaved: (source: DataSource) => void
}) {
  const t = useT()
  const { locale } = useLocale()
  const colourId = useId()
  const errorId = useId()
  // The colour while the picker is open; the stored one otherwise.
  const [draft, setDraft] = useState<string | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)

  async function save(colour: string) {
    if (colour === source.colour) {
      setDraft(null)
      return
    }
    setSaveFailed(false)
    let saved: DataSource | undefined
    try {
      ;({ data: saved } = await api.PATCH('/api/data-sources/{key}', {
        params: { path: { key: sourceKey } },
        body: { colour },
      }))
    } catch {
      saved = undefined
    }
    if (saved) onSaved(saved)
    else setSaveFailed(true)
    setDraft(null)
  }

  // React's onChange on an input follows every `input` event; the picker
  // closing is the native `change` event, listened to here.
  const latestSave = useRef(save)
  useEffect(() => {
    latestSave.current = save
  })
  const colourInput = useCallback((input: HTMLInputElement | null) => {
    if (!input) return
    const closed = () => void latestSave.current(input.value)
    input.addEventListener('change', closed)
    return () => input.removeEventListener('change', closed)
  }, [])

  const imported = new Date(source.imported_at)
  return (
    <dl className="ds-facts">
      <div className="ds-fact">
        <dt>{t('dataSource.version')}</dt>
        <dd className="num">{source.version}</dd>
      </div>
      <div className="ds-fact">
        <dt>{t('dataSource.imported')}</dt>
        <dd>
          <time dateTime={source.imported_at}>
            {imported.toLocaleString(locale.code, { dateStyle: 'long', timeStyle: 'short' })}
          </time>
        </dd>
      </div>
      {source.attribution ? (
        <div className="ds-fact">
          <dt>{t('dataSource.attribution')}</dt>
          <dd className="ds-attribution">{source.attribution}</dd>
        </div>
      ) : null}
      <div className="ds-fact ds-fact-colour">
        <dt>
          <label htmlFor={colourId}>{t('dataSource.colour')}</label>
        </dt>
        <dd className="ds-colour">
          <input
            ref={colourInput}
            id={colourId}
            className="ds-colour-input"
            type="color"
            value={draft ?? source.colour}
            onChange={(event) => setDraft(event.target.value)}
            aria-describedby={saveFailed ? errorId : undefined}
            aria-invalid={saveFailed || undefined}
          />
          <span className="ds-colour-code num" aria-hidden="true">
            {draft ?? source.colour}
          </span>
          {saveFailed ? (
            <p id={errorId} className="field-error ds-colour-error" role="alert">
              {t('common.saveFailed')}
            </p>
          ) : null}
        </dd>
      </div>
    </dl>
  )
}
