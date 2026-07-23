import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { login, signup, setAuthSession } from '../api'
import { useToast } from './Toast'

/**
 * Simple email/password auth form with login ↔ signup toggle.
 * New signups require email verification before a JWT is issued.
 */
export default function AuthPage({ onAuthenticated }) {
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [signupPendingVerify, setSignupPendingVerify] = useState(false)

  const isSignup = mode === 'signup'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || !password || isSubmitting) return

    setIsSubmitting(true)
    setError('')

    try {
      if (isSignup) {
        const data = await signup(email.trim(), password)

        if (data?.requiresVerification || !data?.token) {
          setSignupPendingVerify(true)
          showToast(
            data?.message || 'Check your email to verify your account.',
            data?.emailSent === false ? 'error' : 'success'
          )
          return
        }

        // Backward-compatible path if server ever returns a token on signup
        setAuthSession(data)
        showToast('Account created — welcome to GitLens!', 'success')
        onAuthenticated?.(data)
        return
      }

      const data = await login(email.trim(), password, rememberMe)

      if (!data?.token) {
        throw new Error('No token returned from server')
      }

      setAuthSession(data)
      showToast('Logged in successfully', 'success')
      onAuthenticated?.(data)
    } catch (err) {
      console.error(err)
      const msg = err.message || 'Authentication failed'
      setError(msg)
      showToast(msg, 'error')

      if (err.requiresVerification || /verify your email/i.test(msg)) {
        navigate(`/resend-verification?email=${encodeURIComponent(email.trim())}`)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (signupPendingVerify) {
    return (
      <div className="min-h-screen bg-white text-zinc-900 flex flex-col font-sans relative overflow-hidden selection:bg-sky-200/70 selection:text-zinc-900 app-grid-bg">
        <div className="absolute inset-0 app-noise pointer-events-none" />
        <main className="flex-1 flex items-center justify-center px-4 relative z-10">
          <div className="w-full max-w-md bg-white border border-zinc-200 rounded-2xl p-8 shadow-[0_12px_40px_-18px_rgba(0,0,0,0.18)]">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-lg bg-sky-600 flex items-center justify-center">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-zinc-900">Check your email</h1>
                <p className="text-xs text-zinc-500">Verification required before login</p>
              </div>
            </div>
            <p className="text-sm text-zinc-600 leading-relaxed mb-6">
              We sent a verification link to <span className="font-medium text-zinc-900">{email.trim()}</span>.
              Open it within 24 hours, then sign in.
            </p>
            <div className="flex flex-col gap-3">
              <Link
                to={`/resend-verification?email=${encodeURIComponent(email.trim())}`}
                className="w-full text-center bg-zinc-900 hover:bg-zinc-800 text-white font-medium py-3.5 px-6 rounded-xl transition-colors"
              >
                Resend verification email
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMode('login')
                  setSignupPendingVerify(false)
                  setPassword('')
                  setError('')
                }}
                className="w-full text-center border border-zinc-200 hover:border-zinc-300 text-zinc-700 font-medium py-3.5 px-6 rounded-xl transition-colors cursor-pointer"
              >
                Back to login
              </button>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 flex flex-col font-sans relative overflow-hidden selection:bg-sky-200/70 selection:text-zinc-900 app-grid-bg">
      <div className="absolute inset-0 app-noise pointer-events-none" />

      <main className="flex-1 flex items-center justify-center px-4 relative z-10">
        <div className="w-full max-w-md bg-white border border-zinc-200 rounded-2xl p-8 shadow-[0_12px_40px_-18px_rgba(0,0,0,0.18)]">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900 mb-6 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>

          <div className="flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-lg bg-zinc-900 flex items-center justify-center">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-900">
                GitLens<span className="text-sky-600">.ai</span>
              </h1>
              <p className="text-xs text-zinc-500">
                {isSignup ? 'Create an account to get started' : 'Sign in to continue'}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Email</label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting}
                className="w-full bg-zinc-50 border border-zinc-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-xl py-3 px-4 text-zinc-900 placeholder-zinc-400 transition-all focus:outline-none disabled:opacity-70"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-zinc-700">Password</label>
                {!isSignup && (
                  <Link
                    to={`/forgot-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`}
                    className="text-xs font-medium text-sky-600 hover:text-sky-700"
                  >
                    Forgot password?
                  </Link>
                )}
              </div>
              <input
                type="password"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                disabled={isSubmitting}
                className="w-full bg-zinc-50 border border-zinc-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-xl py-3 px-4 text-zinc-900 placeholder-zinc-400 transition-all focus:outline-none disabled:opacity-70"
                placeholder={isSignup ? 'At least 6 characters' : 'Your password'}
              />
            </div>

            {!isSignup && (
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={isSubmitting}
                  className="h-4 w-4 rounded border-zinc-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-sm text-zinc-600">
                  Remember me{' '}
                  <span className="text-zinc-400">(stay signed in for 30 days)</span>
                </span>
              </label>
            )}

            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-sm">
                {error}
                {/verify your email/i.test(error) && (
                  <div className="mt-2">
                    <Link
                      to={`/resend-verification?email=${encodeURIComponent(email.trim())}`}
                      className="font-medium text-sky-700 hover:text-sky-800 underline"
                    >
                      Resend verification email
                    </Link>
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !email.trim() || !password}
              className="w-full bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white font-medium py-3.5 px-6 rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>{isSignup ? 'Creating account…' : 'Signing in…'}</span>
                </>
              ) : (
                <span>{isSignup ? 'Sign up' : 'Log in'}</span>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-zinc-500">
            {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(isSignup ? 'login' : 'signup')
                setError('')
                setSignupPendingVerify(false)
              }}
              className="text-sky-600 hover:text-sky-700 font-medium cursor-pointer"
            >
              {isSignup ? 'Log in' : 'Sign up'}
            </button>
          </p>
        </div>
      </main>
    </div>
  )
}
