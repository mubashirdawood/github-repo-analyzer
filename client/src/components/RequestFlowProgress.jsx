import { useEffect, useMemo, useRef, useState } from 'react'

export const FLOW_ANALYSIS_STAGES = [
  { id: 'scanning_routes', label: 'Scanning routes...' },
  { id: 'detecting_modules', label: 'Detecting modules...' },
  { id: 'building_diagram', label: 'Building request flow diagram...' },
  { id: 'summarizing', label: 'Writing analysis summary...' },
  { id: 'caching', label: 'Caching results...' }
]

function formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor((ms || 0) / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  if (m <= 0) return `${s}s`
  return `${m}m ${String(s).padStart(2, '0')}s`
}

function StageIcon({ state }) {
  if (state === 'done') {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
    )
  }
  if (state === 'active') {
    return (
      <span className="relative flex h-6 w-6 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-sky-200/60 animate-ping" />
        <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-sky-50 border border-sky-300">
          <span className="h-2 w-2 rounded-full bg-sky-600 animate-pulse" />
        </span>
      </span>
    )
  }
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 bg-white">
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />
    </span>
  )
}

function StatChip({ label, value, accent }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 min-w-[7.5rem]">
      <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500 font-semibold">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums tracking-tight ${accent || 'text-zinc-900'}`}>
        {value}
      </p>
    </div>
  )
}

/**
 * Live analysis progress for comprehensive request-flow generation.
 */
export default function RequestFlowProgress({
  activeStage = null,
  progress = 0,
  elapsedMs = 0,
  detail = null,
  stats = {},
  stageStatus = {}
}) {
  const [tick, setTick] = useState(0)
  const startedAtRef = useRef(Date.now() - (elapsedMs || 0))

  useEffect(() => {
    startedAtRef.current = Date.now() - (elapsedMs || 0)
  }, [])

  useEffect(() => {
    if (typeof elapsedMs === 'number' && elapsedMs > 0) {
      startedAtRef.current = Date.now() - elapsedMs
    }
  }, [elapsedMs])

  useEffect(() => {
    const id = window.setInterval(() => {
      setTick(Date.now() - startedAtRef.current)
    }, 200)
    return () => window.clearInterval(id)
  }, [])

  const stages = useMemo(() => {
    const activeIdx = FLOW_ANALYSIS_STAGES.findIndex((s) => s.id === activeStage)
    return FLOW_ANALYSIS_STAGES.map((stage, idx) => {
      const explicit = stageStatus[stage.id]
      let state = 'pending'
      if (explicit === 'done' || (activeIdx >= 0 && idx < activeIdx)) state = 'done'
      else if (explicit === 'active' || stage.id === activeStage) state = 'active'
      else if (explicit === 'pending') state = 'pending'
      else if (progress >= 100 && idx <= activeIdx) state = 'done'
      return { ...stage, state }
    })
  }, [activeStage, stageStatus, progress])

  const pct = Math.max(0, Math.min(100, Math.round(progress || 0)))

  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
      <div className="pointer-events-none absolute -top-24 -right-16 h-48 w-48 rounded-full bg-sky-100/80 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-teal-50 blur-3xl" />

      <div className="relative">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 mb-2">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sky-600" />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                Live analysis
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-semibold text-zinc-900 tracking-tight">
              Building system request flow
            </h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-md">
              Detecting modules, composing one repository-wide lifecycle diagram, and computing
              architecture statistics.
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500 font-semibold">Elapsed</p>
            <p className="mt-0.5 font-mono text-xl text-zinc-900 tabular-nums">{formatElapsed(tick)}</p>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-zinc-600 truncate pr-3">
              {detail || stages.find((s) => s.state === 'active')?.label || 'Preparing…'}
            </p>
            <span className="text-xs font-mono text-sky-700 tabular-nums">{pct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 border border-zinc-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-600 via-teal-500 to-emerald-500 transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2.5">
          <StatChip label="Routes" value={stats.routes ?? 0} accent="text-emerald-600" />
          <StatChip label="Controllers" value={stats.controllers ?? 0} accent="text-sky-600" />
          <StatChip label="Services" value={stats.services ?? 0} accent="text-teal-600" />
          <StatChip label="Files" value={stats.files ?? 0} accent="text-amber-600" />
        </div>

        <ol className="space-y-2.5">
          {stages.map((stage) => (
            <li
              key={stage.id}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-300 ${
                stage.state === 'active'
                  ? 'border-sky-200 bg-sky-50'
                  : stage.state === 'done'
                    ? 'border-zinc-200 bg-zinc-50'
                    : 'border-transparent bg-transparent opacity-55'
              }`}
            >
              <StageIcon state={stage.state} />
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium truncate ${
                    stage.state === 'active'
                      ? 'text-sky-900'
                      : stage.state === 'done'
                        ? 'text-zinc-700'
                        : 'text-zinc-400'
                  }`}
                >
                  {stage.label}
                </p>
              </div>
              {stage.state === 'active' ? (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-600">
                  Running
                </span>
              ) : stage.state === 'done' ? (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                  Done
                </span>
              ) : (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Queued
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
