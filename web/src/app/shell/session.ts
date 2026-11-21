import { redirect, type LoaderFunctionArgs } from 'react-router'
import { api } from '../../api/client'
import { BASE_PATH } from '../base'

/** The login page, coming back to `path` afterwards (left out for the
 * brief, where the login page goes anyway). */
export function loginPath(path: string): string {
  return path === '/' ? '/login' : `/login?${new URLSearchParams({ redirect: path })}`
}

/** A URL's path and query within the app, without the base path. */
export function appPath(url: URL): string {
  const pathname = url.pathname.startsWith(BASE_PATH) ? url.pathname.slice(BASE_PATH.length) || '/' : url.pathname
  return pathname + url.search
}

/** The shell's loader: every page needs a session, and the server says
 * whether there is one. No session sends the owner to log in; a server that
 * can't be reached lets the page show (its own calls then fail visibly). */
export async function sessionLoader({ request }: LoaderFunctionArgs) {
  let status: number
  try {
    status = (await api.GET('/api/session')).response.status
  } catch {
    return null // unreachable
  }
  if (status === 401) throw redirect(loginPath(appPath(new URL(request.url))))
  return null
}
