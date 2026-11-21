import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { api } from '../../../api/client'
import { useT } from '../../i18n/i18n'
import { Button } from '../../ui/button/Button'
import { Field } from '../../ui/field/Field'
import './login.css'

type Problem = 'enterPassword' | 'wrong' | 'failed'

/** Where to go after logging in: the app path the login page was sent from,
 * or the brief. Only a path within the app counts (never `//host`). */
function landing(redirect: string | null): string {
  return redirect && redirect.startsWith('/') && !/^\/[/\\]/.test(redirect) ? redirect : '/'
}

/** The login page, outside the shell: the wordmark as on the masthead, a
 * password and Log in. A wrong password (401) says so; any other failure says
 * it could not log in. Success goes back to `redirect`, or to the brief. */
export function Login() {
  const t = useT()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const input = useRef<HTMLInputElement>(null)

  // The one thing to do here, so the password takes the focus; not on a
  // touch screen, where that would throw up the keyboard over the page.
  useEffect(() => {
    if (!window.matchMedia?.('(pointer: coarse)').matches) input.current?.focus()
  }, [])

  async function logIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (!password) {
      setProblem('enterPassword')
      input.current?.focus()
      return
    }
    setBusy(true)
    setProblem(null)
    let next: Problem
    try {
      const { response } = await api.POST('/api/login', { body: { password } })
      if (response.ok) {
        await navigate(landing(params.get('redirect')), { replace: true })
        return
      }
      next = response.status === 401 ? 'wrong' : 'failed'
    } catch {
      next = 'failed'
    }
    setBusy(false)
    setProblem(next)
    setPassword('')
    input.current?.focus()
  }

  const title = t('login.title')
  const article = t('shell.wordmarkArticle')

  return (
    <div className="login-desk">
      <title>{t('shell.documentTitle', { page: title })}</title>
      <main className="login paper">
        <p className="login-wordmark" translate="no">
          {article ? <em className="login-article">{article} </em> : null}
          {t('shell.wordmarkName')}
        </p>
        <div className="login-body">
          <h1 className="login-title display">{title}</h1>
          <p className="login-standfirst">{t('login.standfirst')}</p>
          <form className="login-form" onSubmit={logIn} noValidate>
            <Field label={t('login.password')} error={problem ? t(`login.${problem}`) : null}>
              {(control) => (
                <input
                  {...control}
                  ref={input}
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  spellCheck={false}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              )}
            </Field>
            <Button type="submit" variant="primary" disabled={busy} className="login-submit">
              {busy ? t('login.busy') : t('login.submit')}
            </Button>
          </form>
        </div>
      </main>
    </div>
  )
}
