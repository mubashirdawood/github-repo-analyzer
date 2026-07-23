import { Link } from 'react-router-dom'

/**
 * Shown after GET /api/auth/verify-email/:token succeeds and redirects here.
 */
export default function VerifyEmailSuccessPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 flex flex-col font-sans relative overflow-hidden selection:bg-sky-200/70 selection:text-zinc-900 app-grid-bg">
      <div className="absolute inset-0 app-noise pointer-events-none" />
      <main className="flex-1 flex items-center justify-center px-4 relative z-10">
        <div className="w-full max-w-md bg-white border border-zinc-200 rounded-2xl p-8 shadow-[0_12px_40px_-18px_rgba(0,0,0,0.18)] text-center">
          <div className="mx-auto mb-5 h-12 w-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
            <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 mb-2">Email verified</h1>
          <p className="text-sm text-zinc-600 leading-relaxed mb-8">
            Your account is ready. You can now sign in with your email and password.
          </p>
          <Link
            to="/login"
            className="inline-flex w-full items-center justify-center bg-zinc-900 hover:bg-zinc-800 text-white font-medium py-3.5 px-6 rounded-xl transition-colors"
          >
            Continue to login
          </Link>
        </div>
      </main>
    </div>
  )
}
