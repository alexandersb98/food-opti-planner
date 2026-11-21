import { useId } from 'react'
import { useEdition } from '../../hooks/useEdition'
import { useLocale, useT } from '../../i18n/i18n'
import { editionStore, type Edition } from '../../stores/edition'
import { Segmented } from '../../ui/segmented/Segmented'
import { DataSources } from './DataSources'
import { PreferredUnits } from './PreferredUnits'
import './settings.css'

/** Settings, "the small print": the edition, the language (once there is a
 * second one), the preferred units and the data sources. Each part stands on
 * its own, so a failed load in one never hides another. */
export function Settings() {
  const t = useT()
  return (
    <article className="settings">
      <div className="cover settings-cover">
        <p className="kicker">{t('settings.kicker')}</p>
        <h1 className="cover-title display settings-title">{t('shell.pages.settings.title')}</h1>
      </div>
      <EditionSetting />
      <LanguageSetting />
      <PreferredUnits />
      <DataSources />
    </article>
  )
}

const EDITION_KEYS: Record<Edition, string> = {
  device: 'settings.edition.device',
  paper: 'settings.edition.paper',
  evening: 'settings.edition.evening',
}

/** Follow the device, paper or evening: kept on this device (the edition
 * store), which also sets `data-theme` and the browser's toolbar colour. */
function EditionSetting() {
  const t = useT()
  const edition = useEdition()
  const headingId = useId()
  const options = (Object.keys(EDITION_KEYS) as Edition[]).map((value) => ({ value, label: t(EDITION_KEYS[value]) }))
  return (
    <section className="settings-part" aria-labelledby={headingId}>
      <h2 id={headingId} className="settings-heading">
        {t('settings.edition.title')}
      </h2>
      <Segmented labelledBy={headingId} value={edition} options={options} onChange={editionStore.set} />
      <p className="settings-hint">
        {t('settings.edition.hint')}
      </p>
    </section>
  )
}

/** The language choice, shown only once the app has a second language. */
function LanguageSetting() {
  const t = useT()
  const { locale, locales, setLocale } = useLocale()
  const headingId = useId()
  if (locales.length < 2) return null
  const options = locales.map(({ code, name }) => ({ value: code, label: <span lang={code}>{name}</span> }))
  return (
    <section className="settings-part" aria-labelledby={headingId}>
      <h2 id={headingId} className="settings-heading">
        {t('settings.language.title')}
      </h2>
      <Segmented labelledBy={headingId} value={locale.code} options={options} onChange={setLocale} />
    </section>
  )
}
