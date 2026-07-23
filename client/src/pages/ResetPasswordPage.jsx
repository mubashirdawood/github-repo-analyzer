import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { resetPassword } from '../api'
import { useToast } from '../components/Toast'

function validateClientPassword(password) {
  if (password.length < 8) return 'Password must be at least 8 characters'
  if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter'
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter'
  if (!/[0-9]/.test(password)) return 'Password must include a number'
  return null
}

/**
 * Set a new password using the token from the reset email link.
 */
export default function ResetPasswordPage() {
  const { showToast } = useToast()
  const { token } = useParams()
  const tokenLooksValid = useMemo(() => Boolean(token && /^[a-f0-9]{64}$/i.test(token)), [token])

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!tokenLooksValid || isSubmitting) return

    const localError = validateClientPassword(password)
    if (localError) {
      setError(localError)
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const data = await resetPassword(token, password)
      setDone(true)
      showToast(data?.message || 'Password updated successfully.', 'success')
    } catch (err) {
      const msg = err.message || 'Failed to reset password'
      setError(msg)
      showToast(msg, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 flex flex-col font-sans relative overflow-hidden selection:bg-sky-200/70 selection:text-zinc-900 app-grid-bg">
      <div className="absolute inset-0 app-noise pointer-events-none" />
      <main className="flex-1 flex items-center justify-center px-4 relative z-10">
        <div className="w-full max-w-md bg-white border border-zinc-200 rounded-2xl p-8 shadow-[0_12px_40px_-18px_rgba(0,0,0,0.18)]">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900 mb-6 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to login
          </Link>

          <h1 className="text-xl font-bold tracking-tight text-zinc-900 mb-2">Reset password</h1>
          <p className="text-sm text-zinc-500 mb-6">
            Choose a new password with at least 8 characters, including uppercase, lowercase, and a number.
          </p>

          {!tokenLooksValid ? (
            <div className="space-y-4">
              <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-sm">
                This reset link is invalid. Request a new one from the forgot password page.
              </div>
              <Link
                to="/forgot-password"
                className="inline-flex w-full items-center justify-center bg-zinc-900 hover:bg-zinc-800 text-white font-medium py-3.5 px-6 rounded-xl transition-colors"
              >
                Request a new link
              </Link>
            </div>
          ) : done ? (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-sm">
                Your password was updated. You can now sign in with your new password.
              </div>
              <Link
                to="/login"
                className="inline-flex w-full items-center justify-center bg-zinc-900 hover:bg-zinc-800 text-white font-medium py-3.5 px-6 rounded-xl transition-colors"
              >
                Continue to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">New password</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  disabled={isSubmitting}
                  className="w-full bg-zinc-50 border border-zinc-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-xl py-3 px-4 text-zinc-900 placeholder-zinc-400 transition-all focus:outline-none disabled:opacity-70"
                  placeholder="At least 8 characters"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Confirm password</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  disabled={isSubmitting}
                  className="w-full bg-zinc-50 border border-zinc-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-xl py-3 px-4 text-zinc-900 placeholder-zinc-400 transition-all focus:outline-none disabled:opacity-70"
                  placeholder="Re-enter new password"
                />
              </div>

              {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-sm">
                  {error}
                  {/invalid or expired/i.test(error) && (
                    <div className="mt-2">
                      <Link to="/forgot-password" className="font-medium text-sky-700 hover:text-sky-800 underline">
                        Request a new reset link
                      </Link>
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !password || !confirm}
                className="w-full bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white font-medium py-3.5 px-6 rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Updating…</span>
                  </>
                ) : (
                  <span>Update password</span>
                )}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
