import { useLayoutEffect, useRef, type ReactNode } from 'react'
import './disclosure.css'

/**
 * A part that opens and closes (native `<details>`), for "Advanced" parts of
 * a sheet or page. It opens when `startOpen` is or becomes true (e.g. when a
 * field inside has an error) and never closes by itself; the reader opens
 * and closes it otherwise.
 *
 * ```tsx
 * <Disclosure summary={t('goals.editor.advanced')} startOpen={hasAdvancedError}>…</Disclosure>
 * ```
 */
export function Disclosure({
  summary,
  startOpen = false,
  className,
  children,
}: {
  summary: ReactNode
  /** Opens it when true (on first show, or when it turns true later). */
  startOpen?: boolean
  className?: string
  children: ReactNode
}) {
  const details = useRef<HTMLDetailsElement>(null)
  // Before paint, so a part that starts open never flashes closed.
  useLayoutEffect(() => {
    if (startOpen && details.current) details.current.open = true
  }, [startOpen])
  return (
    <details ref={details} className={className ? `disclosure ${className}` : 'disclosure'}>
      <summary className="disclosure-summary">
        <span className="disclosure-mark" aria-hidden="true" />
        {summary}
      </summary>
      <div className="disclosure-body">{children}</div>
    </details>
  )
}
