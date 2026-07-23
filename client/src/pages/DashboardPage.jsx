import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listRepos, deleteRepo } from '../api'
import AppShell from '../components/AppShell'

function statusBadgeClass(status) {
  switch (status) {
    case 'analyzed':
      return 'bg-green-400 py-1 text-white border-2 border-blue-800'
    case 'failed':
      return 'bg-rose-50 text-rose-700 border-rose-200'
    default:
      return 'bg-amber-50 text-amber-700 border-amber-200'
  }
}

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    })
  } catch {
    return String(value)
  }
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [repos, setRepos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        const data = await listRepos()
        if (!cancelled) setRepos(data.repos || [])
      } catch (err) {
        console.error(err)
        if (!cancelled) setError(err.message || 'Failed to load dashboard')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleDelete(repo, event) {
    event.preventDefault()
    event.stopPropagation()

    const label = `${repo.owner}/${repo.repoName}`
    const confirmed = window.confirm(
      `Delete ${label}?\n\nThis permanently removes the repository and all related data (Q&A, file cache, architecture analysis).`
    )
    if (!confirmed) return

    setDeletingId(repo._id)
    setError('')
    try {
      await deleteRepo(repo._id)
      setRepos((prev) => prev.filter((r) => r._id !== repo._id))
    } catch (err) {
      console.error(err)
      setError(err.message || 'Failed to delete repository')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <AppShell>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8 animate-dash-header">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Dashboard</h1>
          <p className="text-sm text-zinc-900 mt-1 animate-pulse">Your analyzed repositories</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/analyze')}
          className="inline-flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium py-2.5 px-4 rounded-xl cursor-pointer transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Analysis
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-3 py-20 text-zinc-500 animate-dash-fade">
          <svg className="animate-spin h-6 w-6 text-sky-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm">Loading your repos…</span>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 mb-4 animate-dash-fade">
          {error}
        </div>
      )}

      {!loading && !error && repos.length === 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center animate-dash-empty">
          <p className="text-zinc-900 font-medium">No repositories yet</p>
          <p className="text-sm text-zinc-500 mt-2 mb-6">
            Analyze a public GitHub repo to get started.
          </p>
          <Link
            to="/analyze"
            className="inline-flex items-center gap-2 text-sm font-semibold text-sky-600 hover:text-sky-700"
          >
            Start a New Analysis →
          </Link>
        </div>
      )}

      {!loading && repos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 bg-zinc-600 p-3 rounded-2xl gap-4">
          {repos.map((repo, index) => {
            const isDeleting = deletingId === repo._id
            return (
              <div
                key={repo._id}
                className="relative text-left rounded-2xl border-2 border-zinc-800 bg-white hover:border-zinc-900/30 hover:shadow-[0_10px_30px_-18px_rgba(0,0,0,0.25)] p-5 transition-all group animate-dash-card"
                style={{ animationDelay: `${Math.min(index, 8) * 0.06 + 0.08}s` }}
              >
                <button
                  type="button"
                  onClick={() => navigate(`/repo/${repo._id}`)}
                  className="w-full text-left cursor-pointer pr-10"
                  disabled={isDeleting}
                >
                  <div className="flex items-start justify-between  gap-3 mb-3">
                    <h2 className="font-semibold text-zinc-900 group-hover:text-sky-700 truncate transition-colors">
                      {repo.owner}/{repo.repoName}
                    </h2>
                    <span
                      className={`shrink-0 text-[10px] uppercase  tracking-wide font-semibold px-2 py-0.5 rounded-md border ${statusBadgeClass(repo.status)}`}
                    >
                      {repo.status || 'pending'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 truncate mb-3 " title={repo.githubUrl}>
                    {repo.githubUrl}
                  </p>
                  <p className="text-[11px] text-zinc-400">Analyzed {formatDate(repo.createdAt)}</p>
                </button>

                <button
                  type="button"
                  title={`Delete ${repo.owner}/${repo.repoName}`}
                  aria-label={`Delete ${repo.owner}/${repo.repoName}`}
                  disabled={isDeleting}
                  onClick={(e) => handleDelete(repo, e)}
                  className="absolute top-5 right-4 inline-flex  items-center justify-center h-6.5 w-8 rounded-lg border-2 border-red-600 bg-white text-zinc-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  {isDeleting ? (
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-9 0h10" />
                    </svg>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </AppShell>
  )
}
