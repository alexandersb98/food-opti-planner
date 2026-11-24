import { useState, type RefObject } from 'react'
import { api } from '../../../api/client'
import { usePreferences } from '../../hooks/usePreferences'
import { useLoad } from '../../hooks/useLoad'
import { useT } from '../../i18n/i18n'
import { preferencesStore } from '../../stores/preferences'
import { Field } from '../../ui/field/Field'
import { LoadState } from '../../ui/loadState/LoadState'
import { Select } from '../../ui/select/Select'
import { Sheet } from '../../ui/sheet/Sheet'
import { Finder } from './Finder'
import './add-from-source.css'

/**
 * Add from data source, a full-screen sheet on the Ingredients page: pick a
 * data source (the last one is remembered on the server), search its foods
 * twenty at a time, and for a chosen food preview the ingredient it would
 * become, whose name and source tags may be changed. Add sends only the
 * food, the name and the tags: the server works out the unit, basis and
 * values from the mapping as it stands, and the new ingredient opens.
 * Its own chunk (see AddFromSourceEntry). The search is Finder's, the
 * chosen food FoodToAdd's.
 */
export function AddFromSource({
  open,
  onClose,
  returnFocus,
}: {
  open: boolean
  onClose: () => void
  returnFocus?: RefObject<HTMLElement | null>
}) {
  const t = useT()
  return (
    <Sheet open={open} onClose={onClose} fullScreen title={t('addFromSource.title')} finalFocus={returnFocus}>
      <Sources />
    </Sheet>
  )
}

/** The sources and the remembered one, loaded together; then the finder
 * for the chosen source. */
function Sources() {
  const t = useT()
  const sources = useLoad(async (signal) => {
    const [answer] = await Promise.all([api.GET('/api/data-sources', { signal }), preferencesStore.load()])
    return answer
  })
  const { preferences } = usePreferences()
  // the source picked here; until then the remembered one, or the first
  const [picked, setPicked] = useState<string | null>(null)

  if (!sources.data) return <LoadState of={sources} message={t('settings.dataSources.loadFailed')} />
  const list = sources.data
  const remembered = preferences?.last_data_source
  const source = list.find((s) => s.key === picked) ?? list.find((s) => s.key === remembered) ?? list[0]
  if (!source) return <p className="afs-quiet">{t('addFromSource.noSources')}</p>

  const choose = (key: string) => {
    if (key === source.key) return
    setPicked(key)
    void preferencesStore.set('last_data_source', key) // a failed save is silent
  }

  return (
    <div className="afs">
      <Finder
        source={source}
        picker={
          <Field label={t('addFromSource.dataSource')}>
            {(control) => (
              <Select
                {...control}
                value={source.key}
                onValueChange={choose}
                options={list.map((s) => ({ value: s.key, label: s.name }))}
              />
            )}
          </Field>
        }
      />
    </div>
  )
}
