import { useT } from '../../i18n/i18n'
import { buttonClass } from '../../ui/button/Button'

/** The banner above the head: where the recipe came from, how many lines
 * need the owner (with a way to the next), that the end was left out, and
 * that Save waits for every line. */
export function ReviewBanner({
  site,
  cut,
  needs,
  refused,
  onNext,
}: {
  site: string
  cut: boolean
  needs: number
  refused: number
  onNext: () => void
}) {
  const t = useT()
  const text = site
    ? needs > 0
      ? t('recipes.bannerSite', { site, n: needs }, needs)
      : t('recipes.bannerSiteReady', { site })
    : needs > 0
      ? t('recipes.banner', { n: needs }, needs)
      : t('recipes.bannerReady')
  return (
    <div className={needs > 0 ? 'review-banner' : 'review-banner review-banner-ready'}>
      <p className="review-banner-kicker">{t('recipe.review.kicker')}</p>
      <p className="review-banner-text" aria-live="polite">
        {text}
      </p>
      {cut ? <p className="review-banner-cut">{t('recipes.bannerCut')}</p> : null}
      {needs > 0 ? (
        <>
          {refused > 0 ? (
            <p key={refused} className="review-banner-block" role="alert">
              {t('recipes.saveBlocked')}
            </p>
          ) : (
            <p className="review-banner-block">{t('recipes.saveBlocked')}</p>
          )}
          <button type="button" className={buttonClass({ variant: 'pencil' }, 'review-next')} onClick={onNext}>
            {t('recipe.review.next')}
          </button>
        </>
      ) : null}
    </div>
  )
}
