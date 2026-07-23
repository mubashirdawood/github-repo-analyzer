import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { useToast } from '../components/Toast'
import {
  changeEmail,
  changePassword,
  clearToken,
  deleteAccount,
  exportAccountData,
  getAccount,
  getSecurityActivity,
  listSessions,
  logoutAllSessions,
  logoutSession,
  resendMyVerification,
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
 * Account Settings — profile, security, sessions, data, and deletion.
 */
export default function SettingsPage() {
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')

  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [busySessionId, setBusySessionId] = useState(null)
  const [loggingOutAll, setLoggingOutAll] = useState(false)

  const [activity, setActivity] = useState([])
  const [activityLoading, setActivityLoading] = useState(true)

  const loadAccount = useCallback(async () => {
    setLoading(true)
    setPageError('')
    try {
      const data = await getAccount()
      setUser(data?.user || null)
    } catch (err) {
      setPageError(err.message || 'Failed to load account')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const data = await listSessions()
      setSessions(Array.isArray(data?.sessions) ? data.sessions : [])
    } catch {
      setSessions([])
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  const loadActivity = useCallback(async () => {
    setActivityLoading(true)
    try {
      const data = await getSecurityActivity(25)
      setActivity(Array.isArray(data?.activity) ? data.activity : [])
    } catch {
      setActivity([])
    } finally {
      setActivityLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAccount()
    loadSessions()
    loadActivity()
  }, [loadAccount, loadSessions, loadActivity])

  const current = sessions.find((s) => s.isCurrent) || null
  const others = sessions.filter((s) => !s.isCurrent)

  const handleLogoutDevice = async (session) => {
    if (!session?.id || busySessionId) return
    setBusySessionId(session.id)
    try {
      const result = await logoutSession(session.id)
      if (result?.currentRevoked) {
        clearToken()
        showToast('This device was logged out', 'success')
        navigate('/login', { replace: true })
        return
      }
      showToast('Device logged out', 'success')
      await loadSessions()
    } catch (err) {
      showToast(err.message || 'Failed to log out device', 'error')
    } finally {
      setBusySessionId(null)
    }
  }

  const handleLogoutAll = async () => {
    if (loggingOutAll) return
    if (!window.confirm('Log out of all devices? You will need to sign in again here too.')) return
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
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
            Account settings
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Manage your profile, security, connected accounts, and data.
          </p>
        </div>

        {pageError && (
          <div className="mb-6 bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-sm">
            {pageError}
          </div>
        )}

        {loading ? (
          <div className="border border-zinc-200 rounded-2xl p-6 text-sm text-zinc-500">
            Loading account…
          </div>
        ) : user ? (
          <div className="space-y-8">
            <EmailSection user={user} onUpdated={loadAccount} />
            <PasswordSection user={user} onUpdated={loadAccount} />

            <section>
              <SectionHeading>Session management</SectionHeading>
              <p className="text-sm text-zinc-500 mb-4">
                Active devices signed in to your account.{' '}
                <Link to="/security" className="text-sky-600 hover:text-sky-700 font-medium">
                  Open Security page
                </Link>
              </p>

              <div className="space-y-3 mb-4">
                {sessionsLoading ? (
                  <div className="border border-zinc-200 rounded-2xl p-5 text-sm text-zinc-500">
                    Loading sessions…
                  </div>
                ) : (
                  <>
                    {current ? (
                      <SessionCard
                        session={current}
                        current
                        onLogout={() => handleLogoutDevice(current)}
                        busy={busySessionId === current.id}
                      />
                    ) : (
                      <div className="border border-amber-200 bg-amber-50/60 rounded-2xl p-5 text-sm text-amber-900">
                        This browser is using a legacy token. Sign out and log in again to enable
                        full session management.
                      </div>
                    )}
                    {others.map((session) => (
                      <SessionCard
                        key={session.id}
                        session={session}
                        onLogout={() => handleLogoutDevice(session)}
                        busy={busySessionId === session.id}
                      />
                    ))}
                    {!sessionsLoading && others.length === 0 && current && (
                      <p className="text-sm text-zinc-500 px-1">No other active devices.</p>
                    )}
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={handleLogoutAll}
                disabled={loggingOutAll || sessionsLoading}
                className="text-sm font-medium text-zinc-700 hover:text-zinc-900 border border-zinc-200 hover:border-zinc-300 px-4 py-2.5 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                {loggingOutAll ? 'Logging out…' : 'Log out all devices'}
              </button>
            </section>

            <ActivitySection activity={activity} loading={activityLoading} onRefresh={loadActivity} />
            <DataSection />
            <DeleteSection user={user} />
          </div>
        ) : null}
      </div>
    </AppShell>
  )
}

function SectionHeading({ children }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-3">{children}</h2>
  )
}

function Panel({ children, danger = false }) {
  return (
    <div
      className={`border rounded-2xl p-5 sm:p-6 ${
        danger ? 'border-rose-200 bg-rose-50/30' : 'border-zinc-200 bg-white'
      }`}
    >
      {children}
    </div>
  )
}

function EmailSection({ user, onUpdated }) {
  const { showToast } = useToast()
  const [email, setEmail] = useState(user.email || '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [resending, setResending] = useState(false)

  useEffect(() => {
    setEmail(user.email || '')
  }, [user.email])

  const handleSave = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const data = await changeEmail({
        email: email.trim(),
        password: user.hasPassword ? password : undefined,
      })
      showToast(data?.message || 'Email updated', 'success')
      setPassword('')
      await onUpdated()
    } catch (err) {
      showToast(err.message || 'Failed to change email', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleResend = async () => {
    if (resending) return
    setResending(true)
    try {
      const data = await resendMyVerification()
      showToast(data?.message || 'Verification email sent', 'success')
    } catch (err) {
      showToast(err.message || 'Failed to resend verification', 'error')
    } finally {
      setResending(false)
    }
  }

  return (
    <section>
      <SectionHeading>Email</SectionHeading>
      <Panel>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <p className="text-sm text-zinc-600">
            Status:{' '}
            <span
              className={`font-semibold ${
                user.emailVerified ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              {user.emailVerified ? 'Verified' : 'Unverified'}
            </span>
          </p>
          {!user.emailVerified && (
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="text-xs font-medium text-sky-600 hover:text-sky-700 cursor-pointer disabled:opacity-50"
            >
              {resending ? 'Sending…' : 'Resend verification'}
            </button>
          )}
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={busy}
              className="w-full bg-zinc-50 border border-zinc-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-xl py-3 px-4 text-zinc-900 transition-all focus:outline-none disabled:opacity-70"
            />
          </div>
          {user.hasPassword && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                Confirm with password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={busy}
                className="w-full bg-zinc-50 border border-zinc-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-xl py-3 px-4 text-zinc-900 transition-all focus:outline-none disabled:opacity-70"
              />
            </div>
          )}
          <button
            type="submit"
            disabled={busy || email.trim() === user.email}
            className="bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {busy ? 'Saving…' : 'Update email'}
          </button>
        </form>
      </Panel>
    </section>
  )
}

function PasswordSection({ user, onUpdated }) {
  const { showToast } = useToast()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSave = async (e) => {
    e.preventDefault()
    if (busy) return
    if (newPassword !== confirm) {
      showToast('New passwords do not match', 'error')
      return
    }
    setBusy(true)
    try {
      const data = await changePassword({
        currentPassword: user.hasPassword ? currentPassword : undefined,
        newPassword,
      })
      showToast(data?.message || 'Password updated', 'success')
      setCurrentPassword('')
      setNewPassword('')
      setConfirm('')
      await onUpdated()
    } catch (err) {
      showToast(err.message || 'Failed to change password', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <SectionHeading>{user.hasPassword ? 'Change password' : 'Set password'}</SectionHeading>
      <Panel>
        <p className="text-sm text-zinc-500 mb-4">
          Use at least 8 characters with uppercase, lowercase, and a number.
        </p>
        <form onSubmit={handleSave} className="space-y-3">
          {user.hasPassword && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                Current password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                disabled={busy}
                className="w-full bg-zinc-50 border border-zinc-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-xl py-3 px-4 text-zinc-900 transition-all focus:outline-none disabled:opacity-70"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">New password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              disabled={busy}
              className="w-full bg-zinc-50 border border-zinc-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-xl py-3 px-4 text-zinc-900 transition-all focus:outline-none disabled:opacity-70"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              Confirm new password
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              disabled={busy}
              className="w-full bg-zinc-50 border border-zinc-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-xl py-3 px-4 text-zinc-900 transition-all focus:outline-none disabled:opacity-70"
            />
          </div>
          <button
            type="submit"
            disabled={busy || !newPassword || !confirm}
            className="bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {busy ? 'Saving…' : user.hasPassword ? 'Update password' : 'Set password'}
          </button>
        </form>
      </Panel>
    </section>
  )
}

function ActivitySection({ activity, loading, onRefresh }) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-3">
        <SectionHeading>Security activity</SectionHeading>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="text-xs font-medium text-sky-600 hover:text-sky-700 cursor-pointer disabled:opacity-50 -mt-3"
        >
          Refresh
        </button>
      </div>
      <Panel>
        {loading ? (
          <p className="text-sm text-zinc-500">Loading activity…</p>
        ) : activity.length === 0 ? (
          <p className="text-sm text-zinc-500">No recent login activity recorded.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {activity.map((item) => (
              <li key={item.id} className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900">
                    {item.success ? 'Successful sign-in' : 'Failed sign-in'}
                    {item.reason ? (
                      <span className="text-zinc-400 font-normal"> · {item.reason}</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">
                    {item.ip || 'Unknown IP'}
                    {item.userAgent ? ` · ${item.userAgent}` : ''}
                  </p>
                </div>
                <time className="text-xs text-zinc-500 shrink-0">{formatWhen(item.createdAt)}</time>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </section>
  )
}

function DataSection() {
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)

  const handleExport = async () => {
    if (busy) return
    setBusy(true)
    try {
      await exportAccountData()
      showToast('Account data downloaded', 'success')
    } catch (err) {
      showToast(err.message || 'Export failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <SectionHeading>Export account data</SectionHeading>
      <Panel>
        <p className="text-sm text-zinc-500 mb-4">
          Download a JSON copy of your profile, repositories metadata, sessions, and recent
          security activity.
        </p>
        <button
          type="button"
          onClick={handleExport}
          disabled={busy}
          className="bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {busy ? 'Preparing…' : 'Export my data'}
        </button>
      </Panel>
    </section>
  )
}

function DeleteSection({ user }) {
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)

  const handleDelete = async (e) => {
    e.preventDefault()
    if (busy) return
    if (
      !window.confirm(
        'Permanently delete your account and all repositories? This cannot be undone.'
      )
    ) {
      return
    }
    setBusy(true)
    try {
      await deleteAccount(
        user.hasPassword
          ? { password }
          : { confirmation }
      )
      clearToken()
      showToast('Account deleted', 'success')
      navigate('/', { replace: true })
    } catch (err) {
      showToast(err.message || 'Failed to delete account', 'error')
      setBusy(false)
    }
  }

  return (
    <section>
      <SectionHeading>Delete account</SectionHeading>
      <Panel danger>
        <p className="text-sm text-rose-800/90 mb-4">
          This permanently deletes your account, sessions, and analyzed repositories.
        </p>
        <form onSubmit={handleDelete} className="space-y-3">
          {user.hasPassword ? (
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                Confirm with password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={busy}
                className="w-full bg-white border border-rose-200 focus:border-rose-400 focus:ring-1 focus:ring-rose-400 rounded-xl py-3 px-4 text-zinc-900 transition-all focus:outline-none disabled:opacity-70"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                Type DELETE to confirm
              </label>
              <input
                type="text"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                required
                disabled={busy}
                className="w-full bg-white border border-rose-200 focus:border-rose-400 focus:ring-1 focus:ring-rose-400 rounded-xl py-3 px-4 text-zinc-900 transition-all focus:outline-none disabled:opacity-70"
                placeholder="DELETE"
              />
            </div>
          )}
          <button
            type="submit"
            disabled={
              busy ||
              (user.hasPassword ? !password : confirmation.trim().toUpperCase() !== 'DELETE')
            }
            className="bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {busy ? 'Deleting…' : 'Delete my account'}
          </button>
        </form>
      </Panel>
    </section>
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
              ? 'text-zinc-700 border-zinc-200 bg-white'
              : 'text-rose-700 border-rose-200 bg-rose-50'
          }`}
        >
          {busy ? 'Logging out…' : current ? 'Log out this device' : 'Log out device'}
        </button>
      )}
    </div>
  )
}
