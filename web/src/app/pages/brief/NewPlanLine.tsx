import { Link } from 'react-router'
import type { PlanResults } from '../../../api/types'
import { dateRange } from '../../../dates'
import { useT } from '../../i18n/i18n'
import { buttonClass } from '../../ui/button/Button'

type Summary = NonNullable<PlanResults['unsaved']>

/** A note on the brief while a new plan is not saved: its dates, how it
 * ended, and the way to The Menu. */
export function NewPlanLine({ plan }: { plan: Summary }) {
  const t = useT()
  return (
    <div className="brief-newplan">
      <p className="brief-newplan-text">
        <span className="brief-newplan-kicker">{t('brief.newPlan.kicker')}</span>{' '}
        {t('brief.newPlan.text', { dates: dateRange(plan.start_date, plan.days), status: t(`brief.newPlan.status.${plan.status}`) })}
      </p>
      <Link className={buttonClass({ variant: 'text' }, 'brief-newplan-link')} to="/plans/new">
        {t('brief.newPlan.open')}
      </Link>
    </div>
  )
}
