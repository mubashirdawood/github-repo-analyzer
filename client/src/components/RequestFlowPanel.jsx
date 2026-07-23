import { useCallback, useEffect, useRef, useState } from 'react'
import { generateRequestFlowsStream, getRequestFlows } from '../api'
import MermaidViewer from './MermaidViewer'
import RequestFlowProgress, { FLOW_ANALYSIS_STAGES } from './RequestFlowProgress'

function initialStageStatus() {
  return Object.fromEntries(FLOW_ANALYSIS_STAGES.map((s) => [s.id, 'pending']))
}

function complexityAccent(level) {
  if (level === 'high') return 'text-amber-700 border-amber-200 bg-amber-50'
  if (level === 'low') return 'text-emerald-700 border-emerald-200 bg-emerald-50'
  return 'text-sky-700 border-sky-200 bg-sky-50'
}

function StatCell({ label, value }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold">{label}</p>
      <p className="mt-1 text-sm font-semibold text-zinc-900 tabular-nums break-words">{value}</p>
    </div>
  )
}

function DashboardCard({ title, children, action }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-zinc-200">
        <h3 className="text-sm font-semibold text-zinc-900 tracking-tight">{title}</h3>
        {action || null}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

/**
 * Request Flow dashboard — one comprehensive diagram + repository statistics.
 */
export default function RequestFlowPanel({ repoId, repoLabel = 'Repository' }) {
  const [requestFlow, setRequestFlow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [cached, setCached] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)

  const [activeStage, setActiveStage] = useState(FLOW_ANALYSIS_STAGES[0].id)
  const [progress, setProgress] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [detail, setDetail] = useState(null)
  const [stats, setStats] = useState({})
  const [stageStatus, setStageStatus] = useState(initialStageStatus)

  const abortRef = useRef(null)

  const applyProgressEvent = useCallback((event) => {
    if (!event || typeof event !== 'object') return

    if (event.stage) {
      setActiveStage(event.stage)
      setStageStatus((prev) => {
        const next = { ...prev }
        const idx = FLOW_ANALYSIS_STAGES.findIndex((s) => s.id === event.stage)
        FLOW_ANALYSIS_STAGES.forEach((s, i) => {
          if (i < idx) next[s.id] = 'done'
          else if (i === idx) {
            next[s.id] = event.status === 'done' ? 'done' : 'active'
          }
        })
        if (event.status === 'done' && idx >= 0) {
          next[FLOW_ANALYSIS_STAGES[idx].id] = 'done'
        }
        return next
      })
    }

    if (typeof event.progress === 'number') setProgress(event.progress)
    if (typeof event.elapsedMs === 'number') setElapsedMs(event.elapsedMs)
    if (event.detail != null) setDetail(event.detail)
    else if (event.label) setDetail(event.label)
    if (event.stats && typeof event.stats === 'object') {
      setStats((prev) => ({ ...prev, ...event.stats }))
    }
  }, [])

  const resetProgressUi = useCallback(() => {
    setActiveStage(FLOW_ANALYSIS_STAGES[0].id)
    setProgress(2)
    setElapsedMs(0)
    setDetail('Starting repository scan…')
    setStats({})
    setStageStatus({
      ...initialStageStatus(),
      [FLOW_ANALYSIS_STAGES[0].id]: 'active'
    })
  }, [])

  const runStreamedGeneration = useCallback(
    async ({ force = false, signal } = {}) => {
      resetProgressUi()
      setGenerating(true)

      const result = await generateRequestFlowsStream(repoId, {
        force,
        signal,
        onProgress: applyProgressEvent
      })

      const flow = result.requestFlow || null
      setRequestFlow(flow)
      setCached(Boolean(result.cached))
      if (result.stats) setStats((prev) => ({ ...prev, ...result.stats }))
      if (flow?.stats) {
        setStats((prev) => ({
          ...prev,
          routes: flow.stats.apiRoutes ?? prev.routes,
          controllers: flow.stats.controllers ?? prev.controllers,
          services: flow.stats.services ?? prev.services,
          files: flow.stats.totalSourceFiles ?? prev.files
        }))
      }
      setProgress(100)
      setStageStatus(Object.fromEntries(FLOW_ANALYSIS_STAGES.map((s) => [s.id, 'done'])))
      setDetail(result.cached ? 'Loaded from cache' : 'System request flow ready')
      return result
    },
    [repoId, applyProgressEvent, resetProgressUi]
  )

  const loadFlows = useCallback(
    async ({ forceGenerate = false } = {}) => {
      if (!repoId) return

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setError('')
      if (forceGenerate) {
        setGenerating(true)
        setLoading(false)
      } else {
        setLoading(true)
        setGenerating(false)
      }

      try {
        if (!forceGenerate) {
          const cachedRes = await getRequestFlows(repoId)
          if (controller.signal.aborted) return
          if (cachedRes.requestFlow?.mermaid) {
            setRequestFlow(cachedRes.requestFlow)
            setCached(Boolean(cachedRes.cached))
            return
          }
        }

        await runStreamedGeneration({
          force: forceGenerate,
          signal: controller.signal
        })
      } catch (err) {
        if (controller.signal.aborted) return
        console.error(err)
        setError(err.message || 'Failed to load request flow.')
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
          setGenerating(false)
        }
      }
    },
    [repoId, runStreamedGeneration]
  )

  useEffect(() => {
    loadFlows()
    return () => {
      abortRef.current?.abort()
    }
  }, [loadFlows])

  const showProgress = generating
  const flowStats = requestFlow?.stats || {}
  const languages = Array.isArray(flowStats.languages) ? flowStats.languages : []
  const layers = requestFlow?.layers || flowStats.layers || []
  const technologies = requestFlow?.technologies || flowStats.technologies || []
  const entryPoints = requestFlow?.entryPoints || flowStats.entryPoints || []
  const complexity = requestFlow?.complexity || flowStats.complexity || 'medium'
  const complexityScore =
    requestFlow?.complexityScore ?? flowStats.complexityScore ?? 0

  return (
    <div className="flex flex-col min-h-[460px]">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-lg font-bold text-zinc-900">Request Flow</h2>
          <p className="text-xs text-zinc-500 mt-1">
            {requestFlow?.mermaid
              ? `System lifecycle diagram${cached ? ' · cached' : ''} · ${repoLabel}`
              : 'One comprehensive view of how requests move through this application'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadFlows({ forceGenerate: true })}
          disabled={loading || generating}
          className="inline-flex items-center justify-center gap-2 text-xs font-semibold text-zinc-800 hover:text-zinc-900 border border-zinc-300 hover:border-zinc-500 bg-white disabled:opacity-50 px-3 py-2 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0"
        >
          {generating ? (
            <>
              <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Analyzing…
            </>
          ) : (
            'Regenerate'
          )}
        </button>
      </div>

      {showProgress ? (
        <div className="animate-mermaid-in">
          <RequestFlowProgress
            activeStage={activeStage}
            progress={progress}
            elapsedMs={elapsedMs}
            detail={detail}
            stats={stats}
            stageStatus={stageStatus}
          />
        </div>
      ) : loading ? (
        <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-10 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-zinc-300 bg-zinc-100">
            <svg className="h-5 w-5 animate-spin text-sky-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-zinc-700">Checking analysis cache…</p>
          <p className="text-xs text-zinc-600 mt-1">Looking for a matching commit SHA</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <p className="font-semibold text-rose-700">Could not load request flow</p>
          <p className="text-xs mt-1">{error}</p>
          <button
            type="button"
            onClick={() => loadFlows({ forceGenerate: true })}
            className="mt-3 text-xs font-semibold text-sky-600 hover:text-sky-700 cursor-pointer"
          >
            Try again
          </button>
        </div>
      ) : !requestFlow?.mermaid ? (
        <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-10 text-center">
          <p className="text-sm font-medium text-zinc-700">No request flow yet</p>
          <p className="text-xs text-zinc-600 mt-1">Generate a system-wide lifecycle diagram for this repo.</p>
          <button
            type="button"
            onClick={() => loadFlows({ forceGenerate: true })}
            className="mt-4 text-xs font-semibold text-sky-600 hover:text-sky-700 cursor-pointer"
          >
            Generate request flow
          </button>
        </div>
      ) : (
        <div className="space-y-5 animate-mermaid-in">
          {/* Repository Statistics */}
          <DashboardCard title="Repository Statistics">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              <StatCell label="Framework" value={flowStats.framework || 'Unknown'} />
              <StatCell label="Frontend Components" value={flowStats.frontendComponents ?? 0} />
              <StatCell label="Pages" value={flowStats.pages ?? 0} />
              <StatCell label="API Routes" value={flowStats.apiRoutes ?? 0} />
              <StatCell label="Controllers" value={flowStats.controllers ?? 0} />
              <StatCell label="Services" value={flowStats.services ?? 0} />
              <StatCell label="Models" value={flowStats.models ?? 0} />
              <StatCell label="Middleware" value={flowStats.middleware ?? 0} />
              <StatCell label="DB Collections" value={flowStats.databaseCollections ?? 0} />
              <StatCell label="External APIs" value={flowStats.externalApis ?? 0} />
              <StatCell label="Authentication" value={flowStats.authentication || 'None'} />
              <StatCell label="Source Files" value={flowStats.totalSourceFiles ?? 0} />
            </div>
            {languages.length > 0 ? (
              <div className="mt-4 pt-4 border-t border-zinc-200">
                <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold mb-2">
                  Languages
                </p>
                <div className="flex flex-wrap gap-2">
                  {languages.map((lang) => (
                    <span
                      key={lang.name}
                      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700"
                    >
                      {lang.name}
                      <span className="font-mono text-zinc-500">{lang.percent}%</span>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </DashboardCard>

          {/* Complexity + Layers row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <DashboardCard title="Complexity Score">
              <div className="flex items-end gap-4">
                <div>
                  <p className="text-4xl font-semibold tabular-nums text-zinc-900 tracking-tight">
                    {complexityScore}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">out of 100</p>
                </div>
                <span
                  className={`mb-1 inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${complexityAccent(complexity)}`}
                >
                  {complexity}
                </span>
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                Estimated architecture layers:{' '}
                <span className="text-zinc-700 font-medium">
                  {flowStats.architectureLayers ?? layers.length}
                </span>
              </p>
            </DashboardCard>

            <DashboardCard title="Architecture Layers">
              {layers.length === 0 ? (
                <p className="text-xs  text-zinc-600">No layers detected.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {layers.map((layer) => (
                    <span
                      key={layer}
                      className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700"
                    >
                      {layer}
                    </span>
                  ))}
                </div>
              )}
            </DashboardCard>
          </div>

          {/* Main diagram */}
          <DashboardCard
            title="Main Request Flow Diagram"
            action={
              <button
                type="button"
                onClick={() => setViewerOpen(true)}
                className="text-xs font-semibold text-sky-600 hover:text-sky-700 cursor-pointer"
              >
                Open interactive viewer
              </button>
            }
          >
            <MermaidViewer
              diagramSyntax={requestFlow.mermaid}
              title={`${repoLabel} · Request Lifecycle`}
              description={requestFlow.summary}
              showPreview
              compact={false}
              open={viewerOpen}
              onClose={() => setViewerOpen(false)}
            />
          </DashboardCard>

          {/* Summary */}
          <DashboardCard title="Analysis Summary">
            <p className="text-sm text-zinc-700 leading-relaxed">
              {requestFlow.summary || flowStats.summary || 'Summary unavailable.'}
            </p>
          </DashboardCard>

          {/* Technologies + Entry points */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <DashboardCard title="Detected Technologies">
              {technologies.length === 0 ? (
                <p className="text-xs text-zinc-600">No technologies detected.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {technologies.map((tech) => (
                    <span
                      key={tech}
                      className="rounded-md border border-black-200 bg-green-500 px-2.5 py-1 text-xs font-medium text-black-700"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              )}
            </DashboardCard>

            <DashboardCard title="Important Entry Points">
              {entryPoints.length === 0 ? (
                <p className="text-xs text-zinc-600">No entry points listed.</p>
              ) : (
                <ul className="space-y-1.5">
                  {entryPoints.map((ep) => (
                    <li
                      key={ep}
                      className="font-mono text-xs text-zinc-400 border-b border-zinc-200 last:border-0 pb-1.5 last:pb-0"
                    >
                      {ep}
                    </li>
                  ))}
                </ul>
              )}
            </DashboardCard>
          </div>
        </div>
      )}
    </div>
  )
}
