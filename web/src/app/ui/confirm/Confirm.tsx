import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useT } from '../../i18n/i18n'
import { Sheet } from '../sheet/Sheet'
import './confirm.css'

export interface ConfirmRequest {
  title: ReactNode
  /** The warning: what happens if the reader goes ahead. */
  message: ReactNode
  /** The confirm action's label, naming what it does ("Delete"). */
  confirmLabel: string
  /** "Cancel" unless given. */
  cancelLabel?: string
  /** The confirm action removes or throws away something. */
  destructive?: boolean
}

export interface ConfirmProps extends ConfirmRequest {
  open: boolean
  /** The reader's answer: true for the confirm action; false for cancel,
   * Escape, the close button or a tap outside. */
  onChoose: (confirmed: boolean) => void
}

/** A sheet asking one question: a title, a warning, Cancel and a (possibly
 * destructive) confirm action. Focus starts on Cancel. Most callers use
 * `useConfirm`. */
export function Confirm({ open, onChoose, title, message, confirmLabel, cancelLabel, destructive = false }: ConfirmProps) {
  const t = useT()
  const warningId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  return (
    <Sheet
      open={open}
      onClose={() => onChoose(false)}
      title={title}
      role="alertdialog"
      describedBy={warningId}
      initialFocus={cancelRef}
    >
      <div id={warningId} className="confirm-warning">
        {message}
      </div>
      <div className="sheet-actions">
        <button ref={cancelRef} type="button" className="sheet-btn sheet-btn-ghost" onClick={() => onChoose(false)}>
          {cancelLabel ?? t('common.cancel')}
        </button>
        <button
          type="button"
          className={destructive ? 'sheet-btn sheet-btn-danger' : 'sheet-btn sheet-btn-primary'}
          onClick={() => onChoose(true)}
        >
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  )
}

/** Asks with a Confirm sheet and resolves with the answer:
 * `const [confirm, confirmSheet] = useConfirm()`, render `confirmSheet`,
 * then `if (await confirm({ title, message, confirmLabel: 'Delete',
 * destructive: true })) …`. A new question answers a pending one with
 * false, as does the caller leaving the page. */
export function useConfirm(): [confirm: (request: ConfirmRequest) => Promise<boolean>, sheet: ReactNode] {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const [open, setOpen] = useState(false)
  const answer = useRef<((confirmed: boolean) => void) | null>(null)

  const confirm = useCallback(
    (next: ConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        answer.current?.(false)
        answer.current = resolve
        setRequest(next)
        setOpen(true)
      }),
    [],
  )

  const choose = useCallback((confirmed: boolean) => {
    answer.current?.(confirmed)
    answer.current = null
    setOpen(false)
  }, [])

  useEffect(
    () => () => {
      answer.current?.(false)
      answer.current = null
    },
    [],
  )

  const sheet = request ? <Confirm {...request} open={open} onChoose={choose} /> : null
  return [confirm, sheet]
}
