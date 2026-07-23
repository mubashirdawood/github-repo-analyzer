import { Link, useSearchParams } from 'react-router-dom'

/**
 * Shown when verification token is invalid or expired.
 */
export default function VerifyEmailFailedPage() {
  const [params] = useSearchParams()
  const reason = params.get('reason')

  const detail =
    reason === 'expired'
      ? 'This verification link has expired (links are valid for 24 hours).'
      : 'This verification link is invalid or has already been used.'

  return (
    <div className="min-h-screen bg-white text-zinc-900 flex flex-col font-sans relative overflow-hidden selection:bg-sky-200/70 selection:text-zinc-900 app-grid-bg">
      <div className="absolute inset-0 app-noise pointer-events-none" />
      <main className="flex-1 flex items-center justify-center px-4 relative z-10">
        <div className="w-full max-w-md bg-white border border-zinc-200 rounded-2xl p-8 shadow-[0_12px_40px_-18px_rgba(0,0,0,0.18)] text-center">
          <div className="mx-auto mb-5 h-12 w-12 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center">
            <svg className="h-6 w-6 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 mb-2">Verification failed</h1>
          <p className="text-sm text-zinc-600 leading-relaxed mb-8">{detail}</p>
          <div className="flex flex-col gap-3">
            <Link
              to="/resend-verification"
              className="inline-flex w-full items-center justify-center bg-zinc-900 hover:bg-zinc-800 text-white font-medium py-3.5 px-6 rounded-xl transition-colors"
            >
              Resend verification email
            </Link>
            <Link
              to="/login"
              className="inline-flex w-full items-center justify-center border border-zinc-200 hover:border-zinc-300 text-zinc-700 font-medium py-3.5 px-6 rounded-xl transition-colors"
            >
              Back to login
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
