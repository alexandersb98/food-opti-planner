import { useId, useState } from 'react'
import type { Preferences } from '../../../api/types'
import { usePreferences } from '../../hooks/usePreferences'
import { useUnits } from '../../hooks/useUnits'
import { useT } from '../../i18n/i18n'
import { preferencesStore } from '../../stores/preferences'
import { unitsStore, type Category } from '../../stores/units'
import { Field } from '../../ui/field/Field'
import { LoadState } from '../../ui/loadState/LoadState'
import { Select } from '../../ui/select/Select'

type UnitKey = 'unit.mass' | 'unit.volume' | 'unit.energy'

/** One list per category, each bound to its preference. */
const CHOICES = [
  { key: 'unit.mass', category: 'mass' },
  { key: 'unit.volume', category: 'volume' },
  { key: 'unit.energy', category: 'energy' },
] as const satisfies readonly { key: UnitKey & keyof Preferences; category: Category }[]

function reload() {
  void unitsStore.load()
  void preferencesStore.load()
}

/** The preferred units for mass, volume and energy, each saved as soon as
 * it is changed. Needs the unit catalogue and the preferences; a failed load
 * of either shows here only. */
export function PreferredUnits() {
  const t = useT()
  const headingId = useId()
  const units = useUnits()
  const prefs = usePreferences()
  // a choice on its way to the server, shown until the answer replaces it
  const [pending, setPending] = useState<Partial<Record<UnitKey, string>>>({})
  const [saveFailed, setSaveFailed] = useState(false)

  const ready = prefs.preferences !== null && units.units.length > 0
  const failed = !ready && (units.failed || prefs.failed)

  async function choose(key: UnitKey, unit: string) {
    setPending((now) => ({ ...now, [key]: unit }))
    const saved = await prefs.set(key, unit)
    setSaveFailed(!saved)
    setPending((now) => {
      if (now[key] !== unit) return now // a later choice is still on its way
      const rest = { ...now }
      delete rest[key]
      return rest
    })
  }

  return (
    <section className="settings-part" aria-labelledby={headingId}>
      <h2 id={headingId} className="settings-heading">
        {t('settings.preferredUnits.title')}
      </h2>
      <p className="settings-text serif-text">{t('settings.preferredUnits.intro')}</p>
      {ready ? (
        <div className="settings-units">
          {CHOICES.map(({ key, category }) => (
            <Field key={key} label={t(`settings.preferredUnits.${category}`)}>
              {(control) => (
                <Select
                  {...control}
                  name={key}
                  value={pending[key] ?? prefs.preferences?.[key] ?? ''}
                  aria-busy={key in pending || undefined}
                  onValueChange={(unit) => void choose(key, unit)}
                  options={units.offered(category).map((unit) => ({ value: unit.symbol, label: units.label(unit) }))}
                />
              )}
            </Field>
          ))}
        </div>
      ) : (
        <LoadState of={{ loading: !failed, failed, reload }} message={t('settings.loadFailed')} />
      )}
      {saveFailed ? (
        <p className="settings-error" role="alert">
          {t('common.saveFailed')}
        </p>
      ) : null}
    </section>
  )
}
