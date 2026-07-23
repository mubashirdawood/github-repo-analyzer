import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { askQuestion, fetchArchitecture, getRepo } from '../api'
import ArchitectureDiagram from '../components/ArchitectureDiagram'
import ArchitectureSkeleton from '../components/ArchitectureSkeleton'
import AppShell from '../components/AppShell'
import { useToast } from '../components/Toast'

const RequestFlowPanel = lazy(() => import('../components/RequestFlowPanel'))

export default function RepoPage() {
  const { id: repoId } = useParams()
  const { showToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [owner, setOwner] = useState('')
  const [repoName, setRepoName] = useState('')
  const [fileTree, setFileTree] = useState([])
  const [truncated, setTruncated] = useState(false)
  const [showTruncatedBanner, setShowTruncatedBanner] = useState(true)
  const [error, setError] = useState('')

  const [chatHistory, setChatHistory] = useState([])
  const [currentQuestion, setCurrentQuestion] = useState('')
  const [isAsking, setIsAsking] = useState(false)

  const [explainQuery, setExplainQuery] = useState('')
  const [explainHistory, setExplainHistory] = useState([])
  const [isExplaining, setIsExplaining] = useState(false)

  const [activeTab, setActiveTab] = useState('chat')
  const [architectureSummary, setArchitectureSummary] = useState('')
  const [diagramSyntax, setDiagramSyntax] = useState('')
  const [isLoadingArchitecture, setIsLoadingArchitecture] = useState(false)
  const [architectureError, setArchitectureError] = useState('')
  const [architectureLoaded, setArchitectureLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadRepo() {
      setLoading(true)
      setLoadError('')
      setChatHistory([])
      setExplainHistory([])
      setExplainQuery('')
      setActiveTab('chat')
      setArchitectureSummary('')
      setDiagramSyntax('')
      setArchitectureLoaded(false)
      setArchitectureError('')

      try {
        const data = await getRepo(repoId)
        if (cancelled) return
        setOwner(data.owner || '')
        setRepoName(data.repoName || '')
        setFileTree(data.fileTree || [])
        setTruncated(Boolean(data.truncated))
        setShowTruncatedBanner(true)
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          const msg = err.message || 'Failed to load repository'
          setLoadError(msg)
          showToast(msg, 'error')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    if (repoId) loadRepo()

    return () => {
      cancelled = true
    }
  }, [repoId, showToast])

  const architectureFetchedRef = useRef(false)

  useEffect(() => {
    architectureFetchedRef.current = false
  }, [repoId])

  useEffect(() => {
    if (!repoId || activeTab !== 'architecture') {
      return
    }

    let cancelled = false

    async function loadArchitecture() {
      const firstLoad = !architectureFetchedRef.current
      if (firstLoad) {
        setIsLoadingArchitecture(true)
      }
      setArchitectureError('')
      try {
        const data = await fetchArchitecture(repoId)
        if (cancelled) return
        setArchitectureSummary(data.architectureSummary || '')
        setDiagramSyntax(data.diagramSyntax || '')
        setArchitectureLoaded(true)
        architectureFetchedRef.current = true
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          const msg = err.message || 'Failed to load architecture.'
          setArchitectureError(msg)
          showToast(msg, 'error')
        }
      } finally {
        if (!cancelled) setIsLoadingArchitecture(false)
      }
    }

    loadArchitecture()

    return () => {
      cancelled = true
    }
  }, [repoId, activeTab, showToast])

  const handleAskQuestion = async (e) => {
    e.preventDefault()
    if (!currentQuestion.trim() || isAsking || !repoId) return

    const questionText = currentQuestion
    setCurrentQuestion('')
    setIsAsking(true)
    setError('')

    const tempId = Date.now()
    setChatHistory((prev) => [
      ...prev,
      { id: tempId, question: questionText, answer: '', filesUsed: [], loading: true }
    ])

    try {
      const data = await askQuestion(repoId, questionText)
      setChatHistory((prev) =>
        prev.map((item) =>
          item.id === tempId
            ? { ...item, answer: data.answer, filesUsed: data.filesUsed || [], loading: false }
            : item
        )
      )
    } catch (err) {
      console.error(err)
      setError(err.message || 'Failed to get answer from server.')
      setChatHistory((prev) =>
        prev.map((item) =>
          item.id === tempId
            ? { ...item, answer: '⚠️ Error: Failed to retrieve answer.', filesUsed: [], loading: false }
            : item
        )
      )
    } finally {
      setIsAsking(false)
    }
  }

  const handleExplain = async (e) => {
    e.preventDefault()
    if (!explainQuery.trim() || isExplaining || !repoId) return

    const questionText = explainQuery.trim()
    setExplainQuery('')
    setIsExplaining(true)
    setError('')

    const tempId = Date.now()
    setExplainHistory((prev) => [
      ...prev,
      { id: tempId, question: questionText, answer: '', filesUsed: [], loading: true }
    ])

    try {
      const data = await askQuestion(repoId, questionText, { mode: 'explain' })
      setExplainHistory((prev) =>
        prev.map((item) =>
          item.id === tempId
            ? { ...item, answer: data.answer, filesUsed: data.filesUsed || [], loading: false }
            : item
        )
      )
    } catch (err) {
      console.error(err)
      setError(err.message || 'Failed to explain code.')
      setExplainHistory((prev) =>
        prev.map((item) =>
          item.id === tempId
            ? { ...item, answer: '⚠️ Error: Failed to retrieve explanation.', filesUsed: [], loading: false }
            : item
        )
      )
    } finally {
      setIsExplaining(false)
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center gap-3 py-24 text-zinc-500">
          <svg className="animate-spin h-6 w-6 text-sky-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm">Loading repository…</span>
        </div>
      </AppShell>
    )
  }

  if (loadError) {
    return (
      <AppShell>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
          <p className="font-semibold text-rose-700">Could not open repository</p>
          <p className="text-sm text-rose-600 mt-1">{loadError}</p>
          <Link to="/dashboard" className="inline-block mt-4 text-sm text-sky-600 hover:text-sky-700 font-medium">
            ← Back to dashboard
          </Link>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="flex flex-col  bg-none shadow border-4 border-zinc-900 rounded-2xl p-3 sm:p-4 sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 min-w-0">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-2xl font-bold text-zinc-900 break-all sm:truncate">
            {owner}/{repoName}
          </h1>
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 w-full sm:w-auto">
          <span className="text-xs font-mono text-zinc-400 sm:text-zinc-500">
            ID: {String(repoId).slice(-6)}
          </span>
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center gap-1.5 text-sm sm:text-base font-semibold text-black hover:text-zinc-900 border border-zinc-100 hover:border-zinc-300 bg-zinc-300 px-2.5 py-1.5 rounded-lg transition-colors"
          >
            ← Dashboard
          </Link>
        </div>
      </div>

      {truncated && showTruncatedBanner && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 flex items-start justify-between gap-3">
          <p>Showing analysis of the top 300 files in this repo</p>
          <button
            type="button"
            onClick={() => setShowTruncatedBanner(false)}
            className="shrink-0 text-amber-600/70 hover:text-amber-800 cursor-pointer text-lg leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-8">
        {activeTab !== 'flows' ? (
          <div className="bg-zinc-100 border-2  border-zinc-900 rounded-2xl p-6 h-fit shadow-[0_8px_24px_-18px_rgba(0,0,0,0.2)]">
            <h2 className="text-lg font-bold  text-zinc-900 flex items-center gap-2 mb-4">
              File Structure
              <span className="text-xs  font-normal text-zinc-500 px-2 py-0.5 bg-zinc-100 rounded-md border border-zinc-200">
                {fileTree.length} files
              </span>
            </h2>
            <div className="max-h-72 lg:max-h-96  overflow-y-auto space-y-1.5 pr-2 custom-scrollbar text-xs font-sans text-zinc-800">
              {fileTree.length > 0 ? (
                fileTree.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 p-1.5 rounded-md hover:bg-zinc-50 border border-transparent hover:text-black hover:border-zinc-200 transition-colors"
                  >
                    <span className="flex items-center gap-2 min-w-0 flex-1" title={file.path}>
                      <svg
                        className="h-3.5 w-3.5 shrink-0 text-sky-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"
                        />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5" />
                      </svg>
                      <span className="truncate font-sans">{file.path}</span>
                    </span>
                    <span className="text-[10px] text-zinc-400 shrink-0 font-sans">
                      {((file.sizeBytes || 0) / 1024).toFixed(1)} KB
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-zinc-400 text-center py-4">No code files matched filters</div>
              )}
            </div>
          </div>
        ) : null}

        <div
          className={`${
            activeTab === 'flows' ? 'lg:col-span-3' : 'lg:col-span-2'
          } flex flex-col bg-zinc-100 border-2 border-zinc-900 rounded-2xl p-4 sm:p-6 min-h-[460px] lg:min-h-[520px] shadow-[0_8px_24px_-18px_rgba(0,0,0,0.2)]`}
        >
          <div className="flex  items-center justify-center gap-4 mb-4 border-4 p-2 rounded-2xl ">
            <div className="flex  flex-wrap items-center gap-1 p-1 rounded-xl bg-zinc-200  border-2  border-zinc-900 ">
              <button
                type="button"
                onClick={() => setActiveTab('chat')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  activeTab === 'chat' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                Q&A
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('explain')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  activeTab === 'explain'
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                Explain
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('architecture')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  activeTab === 'architecture'
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                Architecture
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('flows')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  activeTab === 'flows'
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                Request Flows
              </button>
            </div>
          </div>

          {activeTab === 'flows' ? (
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 max-h-[520px] lg:max-h-[640px]">
              <Suspense
                fallback={
                  <div className="flex items-center justify-center gap-3 py-16 text-zinc-500">
                    <svg className="animate-spin h-5 w-5 text-sky-600" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span className="text-sm">Loading request flows…</span>
                  </div>
                }
              >
                <RequestFlowPanel
                  repoId={repoId}
                  repoLabel={`${owner}/${repoName}`}
                />
              </Suspense>
            </div>
          ) : activeTab === 'chat' ? (
            <>
              <div className="flex-1 overflow-y-auto space-y-6 pr-2 mb-4 custom-scrollbar max-h-[360px] lg:max-h-[400px] font-sans">
                {chatHistory.length === 0 ? (
                  <div className="h-full flex flex-col justify-center items-center text-center text-zinc-500 px-4">
                    <p className="text-sm font-semibold text-zinc-800">Workspace Active</p>
                    <p className="text-xs text-zinc-400 mt-1 max-w-xs">
                      Ask specific questions about logic blocks, exports, or config structures.
                    </p>
                  </div>
                ) : (
                  chatHistory.map((chat) => (
                    <div key={chat.id} className="space-y-3">
                      <div className="flex justify-end">
                        <div className="bg-zinc-900 text-white text-sm px-4 py-2.5 rounded-2xl rounded-tr-none max-w-[85%] font-sans">
                          {chat.question}
                        </div> 
                      </div>
                      <div className="flex justify-start">
                        <div className="bg-zinc-50 border border-zinc-200 border-l-4 border-l-sky-500 text-zinc-700 text-sm px-4 py-3 rounded-2xl rounded-tl-none max-w-[85%] font-sans">
                          {chat.loading ? (
                            <div className="flex items-center gap-2 text-sky-600 py-1 text-xs">
                              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              <span>Evaluating code relevance...</span>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="prose prose-sm text-xs max-w-none space-y-2 text-zinc-700 font-sans [&_pre]:bg-zinc-100 [&_pre]:p-3 [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-zinc-200 [&_code]:text-sky-700 [&_code]:font-sans">
                                <ReactMarkdown>{chat.answer}</ReactMarkdown>
                              </div>
                              {chat.filesUsed?.length > 0 && (
                                <div className="pt-2 border-t border-zinc-200">
                                  <p className="text-[10px] text-zinc-500 font-semibold mb-1.5">Sources evaluated:</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {chat.filesUsed.map((file, fIdx) => (
                                      <span
                                        key={fIdx}
                                        className="bg-white border border-zinc-200 text-zinc-600 text-[9px] px-2 py-0.5 rounded-md font-sans max-w-xs truncate"
                                        title={file}
                                      >
                                        {file.split('/').pop()}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <form
                onSubmit={handleAskQuestion}
                className="flex flex-col sm:flex-row gap-2 bg-zinc-50 border border-zinc-200 p-2 rounded-2xl font-sans"
              >
                <input
                  type="text"
                  value={currentQuestion}
                  onChange={(e) => setCurrentQuestion(e.target.value)}
                  placeholder="e.g. How does this repository initialize Express routes?"
                  disabled={isAsking}
                  required
                  className="flex-1 min-w-0 bg-transparent px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none disabled:opacity-60 font-sans"
                />
                <button
                  type="submit"
                  disabled={isAsking || !currentQuestion.trim()}
                  aria-label="Send"
                  className="inline-flex items-center justify-center gap-2 w-full sm:w-auto shrink-0 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 disabled:opacity-60 text-white px-3 py-2.5 sm:p-2 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  {isAsking ? (
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                  <span className="text-sm font-medium sm:hidden">{isAsking ? 'Sending…' : 'Send'}</span>
                </button>
              </form>
            </>
          ) : activeTab === 'explain' ? (
            <>
              <div className="flex-1 overflow-y-auto space-y-6 pr-2 mb-4 custom-scrollbar max-h-[360px] lg:max-h-[400px] font-sans">
                {explainHistory.length === 0 ? (
                  <div className="h-full flex flex-col justify-center items-center text-center text-zinc-500 px-4">
                    <p className="text-sm font-semibold text-zinc-800">Explain a specific file or function</p>
                    <p className="text-xs text-zinc-400 mt-1 max-w-xs">
                      Try a file path or &quot;explain the login function in auth.js&quot;.
                    </p>
                  </div>
                ) : (
                  explainHistory.map((item) => (
                    <div key={item.id} className="space-y-3">
                      <div className="flex justify-end">
                        <div className="bg-zinc-900 text-white text-sm px-4 py-2.5 rounded-2xl rounded-tr-none max-w-[85%] font-sans">
                          {item.question}
                        </div>
                      </div>
                      <div className="flex justify-start">
                        <div className="bg-zinc-50 border border-zinc-200 border-l-4 border-l-sky-500 text-zinc-700 text-sm px-4 py-3 rounded-2xl rounded-tl-none max-w-[85%] font-sans">
                          {item.loading ? (
                            <div className="flex items-center gap-2 text-sky-600 py-1 text-xs">
                              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              <span>Locating file and explaining…</span>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="prose prose-sm text-xs max-w-none space-y-2 text-zinc-700 font-sans [&_pre]:bg-zinc-100 [&_pre]:p-3 [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-zinc-200 [&_code]:text-sky-700 [&_code]:font-sans">
                                <ReactMarkdown>{item.answer}</ReactMarkdown>
                              </div>
                              {item.filesUsed?.length > 0 && (
                                <div className="pt-2 border-t border-zinc-200">
                                  <p className="text-[10px] text-zinc-500 font-semibold mb-1.5">Focused on:</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {item.filesUsed.map((file, fIdx) => (
                                      <span
                                        key={fIdx}
                                        className="bg-white border border-zinc-200 text-zinc-600 text-[9px] px-2 py-0.5 rounded-md font-sans max-w-xs truncate"
                                        title={file}
                                      >
                                        {file.split('/').pop()}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <form
                onSubmit={handleExplain}
                className="flex flex-col sm:flex-row gap-2 bg-zinc-50 border border-zinc-200 p-2 rounded-2xl font-sans"
              >
                <input
                  type="text"
                  value={explainQuery}
                  onChange={(e) => setExplainQuery(e.target.value)}
                  placeholder="e.g. explain handleSubmit in LoginForm.jsx"
                  disabled={isExplaining}
                  required
                  className="flex-1 min-w-0 bg-transparent px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none disabled:opacity-60 font-sans"
                />
                <button
                  type="submit"
                  disabled={isExplaining || !explainQuery.trim()}
                  aria-label="Send"
                  className="inline-flex items-center justify-center gap-2 w-full sm:w-auto shrink-0 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 disabled:opacity-60 text-white px-3 py-2.5 sm:p-2 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  {isExplaining ? (
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                  <span className="text-sm font-medium sm:hidden">{isExplaining ? 'Sending…' : 'Send'}</span>
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-8 max-h-[520px] lg:max-h-[580px]">
              {isLoadingArchitecture ? (
                <ArchitectureSkeleton />
              ) : architectureError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  <p className="font-semibold text-rose-800">Could not load architecture</p>
                  <p className="text-xs mt-1">{architectureError}</p>
                </div>
              ) : (
                <>
                  <section>
                    <h3 className="text-2xl font-semibold text-balck mb-3">Architecture Summary</h3>
                    <div className="prose prose-sm max-w-none text-zinc-900">
                      <ReactMarkdown>{architectureSummary || '_No summary available._'}</ReactMarkdown>
                    </div>
                  </section>
                  <section className="pb-2">
                    <h3 className="text-2xl font-semibold text-black mb-3">Architecture Diagram</h3>
                    <ArchitectureDiagram
                      diagramSyntax={diagramSyntax}
                      title={`${owner}/${repoName} — Architecture`}
                    />
                  </section>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
