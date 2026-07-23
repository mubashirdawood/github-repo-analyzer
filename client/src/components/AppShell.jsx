import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { clearToken, logoutCurrentSession } from '../api'

/**
 * Shared chrome for authenticated pages.
 */
export default function AppShell({ children, titleRight = null }) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = async () => {
    try {
      await logoutCurrentSession()
    } catch {
      // ignore — always clear local credentials
    }
    clearToken()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 flex flex-col font-sans relative overflow-hidden selection:bg-sky-200/70 selection:text-zinc-900 app-grid-bg">
      <div className="absolute inset-0 app-noise pointer-events-none" />

      <header className="border-b border-zinc-200 bg-white/85 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          <Link to="/dashboard" className="flex items-center gap-2 sm:gap-3 min-w-0 shrink">
            <div className="h-9 w-9 rounded-lg bg-zinc-900 flex items-center justify-center shrink-0">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <span className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 truncate">
              GitLens<span className="text-sky-600">.ai</span>
            </span>
          </Link>

          <div className="hidden sm:flex items-center gap-3">
            {titleRight}
            <Link
              to="/settings"
              className="text-xs font-medium text-zinc-600 hover:text-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-200 hover:border-zinc-300 transition-colors"
            >
              Settings
            </Link>
            <Link
              to="/security"
              className="text-xs font-medium text-zinc-600 hover:text-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-200 hover:border-zinc-300 transition-colors"
            >
              Security
            </Link>
            <Link
              to="/analyze"
              className="text-xs font-medium text-black-700 hover:text-sky-800 px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-sky-300 bg-blue-300 transition-colors"
            >
              New Analysis
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs font-medium text-zinc-600 hover:text-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-200 hover:border-zinc-300 transition-colors cursor-pointer"
            >
              Log out
            </button>
          </div>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 text-zinc-700 sm:hidden shrink-0"
            aria-expanded={menuOpen}
            aria-label="Toggle menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-zinc-200 bg-white px-4 py-3 sm:hidden">
            <nav className="flex flex-col gap-2" aria-label="Mobile">
              {titleRight ? <div className="px-1 py-1">{titleRight}</div> : null}
              <Link
                to="/settings"
                onClick={() => setMenuOpen(false)}
                className="text-sm font-medium text-zinc-700 hover:text-zinc-900 px-3 py-2.5 rounded-lg border border-zinc-200 hover:border-zinc-300 transition-colors text-center"
              >
                Settings
              </Link>
              <Link
                to="/security"
                onClick={() => setMenuOpen(false)}
                className="text-sm font-medium text-zinc-700 hover:text-zinc-900 px-3 py-2.5 rounded-lg border border-zinc-200 hover:border-zinc-300 transition-colors text-center"
              >
                Security
              </Link>
              <Link
                to="/analyze"
                onClick={() => setMenuOpen(false)}
                className="text-sm font-medium text-sky-700 hover:text-sky-800 px-3 py-2.5 rounded-lg border border-sky-200 hover:border-sky-300 bg-sky-50/80 transition-colors text-center"
              >
                New Analysis
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="text-sm font-medium text-zinc-600 hover:text-zinc-900 px-3 py-2.5 rounded-lg border border-zinc-200 hover:border-zinc-300 transition-colors cursor-pointer"
              >
                Log out
              </button>
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 relative z-10 w-full">
        {children}
      </main>

      <footer className="border-t border-zinc-200 bg-white/70 py-8 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-zinc-500">&copy; 2026 GitLens.ai. Built with React and Express.</p>
          <span className="text-xs text-sky-600 font-medium">Heuristic Indexing Active</span>
        </div>
      </footer>
    </div>
  )
}
