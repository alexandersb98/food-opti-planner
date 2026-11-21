import { useT } from '../../i18n/i18n'

/** The brief's last word: "Compose the week", with how many meals it will
 * fill (unknown while the setup loads). */
export function Compose({ meals, disabled, onCompose }: { meals: number | null; disabled: boolean; onCompose: () => void }) {
  const t = useT()
  return (
    <div className="brief-compose">
      <button
        type="button"
        className="brief-compose-button"
        disabled={disabled}
        aria-describedby={meals === null ? undefined : 'brief-compose-note'}
        onClick={onCompose}
      >
        {t('brief.compose.button')}
        <small aria-hidden="true">{t('brief.compose.sub')}</small>
      </button>
      {meals === null ? null : (
        <p className="brief-compose-note" id="brief-compose-note">
          {t('brief.compose.note', meals)}
        </p>
      )}
    </div>
  )
}
