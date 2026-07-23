import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { resendVerification } from '../api'
import { useToast } from '../components/Toast'

/**
 * Public page to request a new email verification link.
 */
export default function ResendVerificationPage() {
  const { showToast } = useToast()
  const [params] = useSearchParams()
  const [email, setEmail] = useState(params.get('email') || '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || isSubmitting) return

    setIsSubmitting(true)
    setError('')

    try {
      const data = await resendVerification(email.trim())
      setSent(true)
      showToast(data?.message || 'If that account needs verification, we sent a new link.', 'success')
    } catch (err) {
      const msg = err.message || 'Failed to resend verification email'
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

          <h1 className="text-xl font-bold tracking-tight text-zinc-900 mb-2">Resend verification</h1>
          <p className="text-sm text-zinc-500 mb-6">
            Enter the email you used to sign up. We will send a new link if the account is still unverified.
          </p>

          {sent ? (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-sm">
                If an unverified account exists for that email, a new verification link has been sent.
                Check your inbox (and spam folder).
              </div>
              <Link
                to="/login"
                className="inline-flex w-full items-center justify-center bg-zinc-900 hover:bg-zinc-800 text-white font-medium py-3.5 px-6 rounded-xl transition-colors"
              >
                Go to login
              </Link>
            </div>
          ) : (
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

              {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !email.trim()}
                className="w-full bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white font-medium py-3.5 px-6 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Sending…' : 'Send verification email'}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
