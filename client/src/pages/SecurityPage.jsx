import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { useToast } from '../components/Toast'
import {
  clearToken,
  listSessions,
  logoutAllSessions,
  logoutSession,
} from '../api'

function formatWhen(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return String(value)
  }
}

/**
 * Security settings — view and revoke active device sessions.
 */
export default function SecurityPage() {
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [loggingOutAll, setLoggingOutAll] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listSessions()
      setSessions(Array.isArray(data?.sessions) ? data.sessions : [])
    } catch (err) {
      setError(err.message || 'Failed to load sessions')
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const current = sessions.find((s) => s.isCurrent) || null
  const others = sessions.filter((s) => !s.isCurrent)

  const handleLogoutDevice = async (session) => {
    if (!session?.id || busyId) return
    setBusyId(session.id)
    try {
      const result = await logoutSession(session.id)
      if (result?.currentRevoked) {
        clearToken()
        showToast('This device was logged out', 'success')
        navigate('/login', { replace: true })
        return
      }
      showToast('Device logged out', 'success')
      await load()
    } catch (err) {
      showToast(err.message || 'Failed to log out device', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleLogoutAll = async () => {
    if (loggingOutAll) return
    const ok = window.confirm(
      'Log out of all devices? You will need to sign in again on this device too.'
    )
    if (!ok) return

    setLoggingOutAll(true)
    try {
      await logoutAllSessions()
      clearToken()
      showToast('Logged out of all devices', 'success')
      navigate('/login', { replace: true })
    } catch (err) {
      showToast(err.message || 'Failed to log out all devices', 'error')
      setLoggingOutAll(false)
    }
  }

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">Security</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Manage devices signed in to your account. Expired sessions are removed automatically.
          </p>
        </div>

        {error && (
          <div className="mb-6 bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        <section className="mb-8">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Current session
            </h2>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="text-xs font-medium text-sky-600 hover:text-sky-700 cursor-pointer disabled:opacity-50"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="border border-zinc-200 rounded-2xl p-6 text-sm text-zinc-500">
              Loading sessions…
            </div>
          ) : current ? (
            <SessionCard
              session={current}
              current
              onLogout={() => handleLogoutDevice(current)}
              busy={busyId === current.id}
            />
          ) : (
            <div className="border border-amber-200 bg-amber-50/60 rounded-2xl p-5 text-sm text-amber-900">
              You are signed in with a legacy token that is not tied to a device session. Sign out and
              log in again to enable device management for this browser.
            </div>
          )}
        </section>

        <section className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-3">
            Active devices
          </h2>

          {loading ? null : others.length === 0 ? (
            <div className="border border-zinc-200 rounded-2xl p-6 text-sm text-zinc-500">
              No other active devices.
            </div>
          ) : (
            <ul className="space-y-3">
              {others.map((session) => (
                <li key={session.id}>
                  <SessionCard
                    session={session}
                    onLogout={() => handleLogoutDevice(session)}
                    busy={busyId === session.id}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border border-zinc-200 rounded-2xl p-5 sm:p-6">
          <h2 className="text-base font-semibold text-zinc-900 mb-1">Log out everywhere</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Revoke every active session, including this device. You will need to sign in again.
          </p>
          <button
            type="button"
            onClick={handleLogoutAll}
            disabled={loggingOutAll || loading}
            className="bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {loggingOutAll ? 'Logging out…' : 'Log out all devices'}
          </button>
        </section>
      </div>
    </AppShell>
  )
}

function SessionCard({ session, current = false, onLogout, busy = false }) {
  return (
    <div
      className={`border rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 ${
        current ? 'border-sky-200 bg-sky-50/40' : 'border-zinc-200 bg-white'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <p className="font-semibold text-zinc-900 truncate">
            {session.browser} on {session.os}
          </p>
          {current && (
            <span className="text-[11px] font-semibold uppercase tracking-wide text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full">
              This device
            </span>
          )}
        </div>
        <p className="text-sm text-zinc-600">{session.device}</p>
        <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-zinc-500">
          <div>
            <dt className="font-medium text-zinc-400">IP</dt>
            <dd className="text-zinc-700">{session.ip || '—'}</dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-400">Signed in</dt>
            <dd className="text-zinc-700">{formatWhen(session.loginTime)}</dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-400">Last active</dt>
            <dd className="text-zinc-700">{formatWhen(session.lastActive)}</dd>
          </div>
        </dl>
      </div>

      {onLogout && (
        <button
          type="button"
          onClick={onLogout}
          disabled={busy}
          className={`shrink-0 text-sm font-medium px-3.5 py-2 rounded-xl transition-colors cursor-pointer disabled:opacity-60 border ${
            current
              ? 'text-zinc-700 hover:text-zinc-900 border-zinc-200 hover:border-zinc-300 bg-white'
              : 'text-rose-700 hover:text-rose-800 border-rose-200 hover:border-rose-300 bg-rose-50'
          }`}
        >
          {busy ? 'Logging out…' : current ? 'Log out this device' : 'Log out device'}
        </button>
      )}
    </div>
  )
}
