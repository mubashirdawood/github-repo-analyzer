import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { analyzeRepository } from '../api'
import AppShell from '../components/AppShell'
import { useToast } from '../components/Toast'

function classifyAnalyzeError(message) {
  const msg = (message || '').toLowerCase()
  if (msg.includes('rate limit')) {
    return { title: 'Rate limit reached', tone: 'amber' }
  }
  if (msg.includes('not found') || msg.includes('private')) {
    return { title: 'Repository unavailable', tone: 'rose' }
  }
  if (msg.includes('invalid') && msg.includes('url')) {
    return { title: 'Invalid URL', tone: 'rose' }
  }
  return { title: 'Analysis failed', tone: 'rose' }
}

export default function AnalyzePage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [repoUrl, setRepoUrl] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  const handleAnalyze = async (e) => {
    e.preventDefault()
    if (!repoUrl.trim() || isAnalyzing) return

    // Client-side URL sanity check before hitting the API
    const trimmed = repoUrl.trim()
    const looksLikeGithub =
      /github\.com[/:][^/\s]+\/[^/\s]+/i.test(trimmed) ||
      /^[^/\s]+\/[^/\s]+$/.test(trimmed)

    if (!looksLikeGithub) {
      const msg = 'Invalid GitHub URL. Expected format: https://github.com/owner/repo'
      setError(msg)
      showToast(msg, 'error')
      return
    }

    setIsAnalyzing(true)
    setError('')
    setStatusMessage('Initiating Repository Analysis...')

    try {
      const data = await analyzeRepository(trimmed)
      showToast(`Analyzed ${data.truncated ? 'top 300 files of ' : ''}${trimmed.split('/').slice(-2).join('/')}`, 'success')
      navigate(`/repo/${data.repoId}`, {
        replace: true,
        state: { truncated: Boolean(data.truncated) }
      })
    } catch (err) {
      console.error(err)
      const msg = err.message || 'An error occurred while analyzing the repository.'
      setError(msg)
      showToast(msg, 'error')
    } finally {
      setIsAnalyzing(false)
      setStatusMessage('')
    }
  }

  const errorMeta = error ? classifyAnalyzeError(error) : null
  const errorBoxClass =
    errorMeta?.tone === 'amber'
      ? 'bg-amber-50 border-amber-200 text-amber-900'
      : 'bg-rose-50 border-rose-200 text-rose-800'

  return (
    <AppShell>
      <div className="text-center max-w-3xl mx-auto mb-10 animate-dash-header">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md bg-sky-500 border border-sky-200 text-sky-100 text-xs font-semibold uppercase tracking-wider mb-6">
          New Analysis
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-zinc-900 mb-4 leading-tight">
          Understand any codebase,{' '}
          <span className="text-sky-600">in seconds.</span>
        </h1>
        <p className="text-lg text-zinc-500 max-w-2xl mx-auto">
          Input a public GitHub URL to map its structure and start exploring.
        </p>
      </div>

      <div className="w-full max-w-2xl mx-auto bg-blue-50 border-2 border-zinc-900 rounded-2xl p-6 sm:p-8 shadow-[0_12px_40px_-20px_rgba(0,0,0,0.2)] animate-dash-empty">
        <form onSubmit={handleAnalyze} className="space-y-4">
          <label className="block text-sm font-medium text-zinc-700">GitHub Repository URL</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-zinc-400">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.53 1.03 1.53 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
              </svg>
            </div>
            <input
              type="url"
              value={repoUrl}
              onChange={(e) => {
                setRepoUrl(e.target.value)
                if (error) setError('')
              }}
              placeholder="https://github.com/facebook/react"
              required
              disabled={isAnalyzing}
              className={`w-full bg-zinc-50 border focus:ring-1 rounded-xl py-4 pl-12 pr-4 text-zinc-900 placeholder-zinc-400 transition-all duration-300 focus:outline-none disabled:opacity-70 ${
                error
                  ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/40'
                  : 'border-zinc-200 focus:border-sky-500 focus:ring-sky-500'
              }`}
            />
          </div>

          <button
            type="submit"
            disabled={isAnalyzing || !repoUrl.trim()}
            className="w-full bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white font-medium py-4 px-6 rounded-xl transition-colors flex items-center justify-center gap-3 cursor-pointer disabled:cursor-not-allowed"
          >
            {isAnalyzing ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>{statusMessage || 'Analyzing Repository...'}</span>
              </>
            ) : (
              <span>Analyze Repository</span>
            )}
          </button>
        </form>

        {error && (
          <div className={`mt-4 border p-4 rounded-xl text-sm ${errorBoxClass}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{errorMeta.title}</p>
                <p className="text-xs mt-1 opacity-90">{error}</p>
              </div>
              <button
                type="button"
                onClick={() => setError('')}
                className="text-current/50 hover:text-current cursor-pointer text-lg leading-none"
                aria-label="Dismiss error"
              >
                ×
              </button>
            </div>
          </div>
        )}

        <p className="mt-6 text-center">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 border border-zinc-200 hover:border-zinc-300 bg-white px-4 py-2 rounded-xl transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to dashboard
          </Link>
        </p>
      </div>
    </AppShell>
  )
}
