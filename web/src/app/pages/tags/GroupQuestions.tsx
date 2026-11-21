import { useId, useRef, useState } from 'react'
import type { GroupQuestion, Tag } from '../../../api/types'
import { useT } from '../../i18n/i18n'
import { Sheet } from '../../ui/sheet/Sheet'
import { questionText } from './tagText'
import { buttonClass } from '../../ui/button/Button'

/**
 * The questions a tag save raised (a 409 with `questions`), asked one at a
 * time in one sheet. After the last one, `onAnswer` gets yes (true) or no
 * for each, in order. Closing the sheet (Escape, a tap outside) answers no
 * to the rest. Mount it afresh (a new `key`) for each set of questions.
 */
export function GroupQuestions({
  open,
  questions,
  byId,
  onAnswer,
}: {
  open: boolean
  questions: readonly GroupQuestion[]
  byId: ReadonlyMap<number, Tag>
  onAnswer: (yes: boolean[]) => void
}) {
  const t = useT()
  const textId = useId()
  const noRef = useRef<HTMLButtonElement>(null)
  const [answers, setAnswers] = useState<boolean[]>([])
  // the last question stays on screen while the sheet slides away
  const at = Math.min(answers.length, questions.length - 1)
  const question = questions[at]
  if (!question) return null
  const { text, yes, no } = questionText(t, question, byId)

  function reply(answer: boolean) {
    if (answers.length >= questions.length) return
    const next = [...answers, answer]
    setAnswers(next)
    if (next.length === questions.length) onAnswer(next)
  }

  function dismiss() {
    if (answers.length >= questions.length) return
    const next = [...answers, ...questions.slice(answers.length).map(() => false)]
    setAnswers(next)
    onAnswer(next)
  }

  return (
    <Sheet
      open={open}
      onClose={dismiss}
      title={t('tags.group.equivalent')}
      role="alertdialog"
      describedBy={textId}
      initialFocus={noRef}
    >
      {/* announced when the next question takes the place of the last */}
      <div id={textId} className="tags-question" aria-live="polite">
        {questions.length > 1 ? (
          <p className="tags-question-count">{t('tags.group.questionOf', { n: at + 1, count: questions.length })}</p>
        ) : null}
        <p>{text}</p>
      </div>
      <div className="sheet-actions">
        <button ref={noRef} type="button" className={buttonClass({ variant: 'ghost' })} onClick={() => reply(false)}>
          {no}
        </button>
        <button type="button" className={buttonClass({ variant: 'primary' })} onClick={() => reply(true)}>
          {yes}
        </button>
      </div>
    </Sheet>
  )
}
