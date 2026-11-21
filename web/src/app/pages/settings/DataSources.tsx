import { useId } from 'react'
import { Link } from 'react-router'
import { api } from '../../../api/client'
import type { DataSourceSummary } from '../../../api/types'
import type { Translate } from '../../../translator'
import { useLoad } from '../../hooks/useLoad'
import { useT } from '../../i18n/i18n'
import { LoadState } from '../../ui/loadState/LoadState'

function caption(t: Translate, source: DataSourceSummary) {
  return [
    t('settings.dataSources.version', { version: source.version }),
    t('settings.dataSources.foods', source.food_count),
    t('settings.dataSources.mapped', { mapped: source.mapped_count, n: source.column_count }, source.column_count),
  ].join(' · ')
}

/** The data sources, one entry each with its colour, version, foods and
 * mapped columns, opening the source's page. Loads on its own, so a failure
 * here leaves the units above working. */
export function DataSources() {
  const t = useT()
  const headingId = useId()
  const sources = useLoad((signal) => api.GET('/api/data-sources', { signal }))

  return (
    <section className="settings-part" aria-labelledby={headingId}>
      <h2 id={headingId} className="settings-heading">
        {t('settings.dataSources.title')}
      </h2>
      {!sources.data ? (
        <LoadState of={sources} message={t('settings.dataSources.loadFailed')} />
      ) : sources.data.length === 0 ? (
        <p className="settings-text serif-text">{t('settings.dataSources.empty')}</p>
      ) : (
        <ul className="settings-sources">
          {sources.data.map((source) => (
            <li key={source.key}>
              <Link className="settings-source" to={`/settings/data-sources/${encodeURIComponent(source.key)}`}>
                <span className="settings-source-dot" aria-hidden="true" style={{ backgroundColor: source.colour }} />
                <span className="settings-source-text">
                  <span className="settings-source-name">{source.name}</span>
                  <span className="settings-source-meta">{caption(t, source)}</span>
                </span>
                <span className="settings-source-chev" aria-hidden="true">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
