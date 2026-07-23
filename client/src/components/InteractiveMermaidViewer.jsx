import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { safeRenderMermaid, sanitizeMermaidDiagram, safeMermaidRenderId } from '../utils/mermaidSafe'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const ZOOM_STEP = 0.15

function slugify(value) {
  return String(value || 'diagram')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'diagram'
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function getSvgElement(container) {
  return container?.querySelector?.('svg') || null
}

function serializeSvg(svgEl, { withBackground = true } = {}) {
  if (!svgEl) return ''
  const clone = svgEl.cloneNode(true)
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }

  const vb = svgEl.viewBox?.baseVal
  const width = Math.max(
    1,
    Math.ceil(vb?.width || svgEl.clientWidth || svgEl.getBoundingClientRect().width || 800)
  )
  const height = Math.max(
    1,
    Math.ceil(vb?.height || svgEl.clientHeight || svgEl.getBoundingClientRect().height || 600)
  )
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))

  if (withBackground) {
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bg.setAttribute('width', '100%')
    bg.setAttribute('height', '100%')
    bg.setAttribute('fill', '#09090b')
    clone.insertBefore(bg, clone.firstChild)
  }

  return { xml: new XMLSerializer().serializeToString(clone), width, height }
}

function ToolButton({ onClick, disabled, title, children, active = false }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? 'border-sky-300 bg-sky-50 text-sky-700'
          : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 hover:bg-zinc-50'
      }`}
    >
      {children}
    </button>
  )
}

function StatusToast({ message, tone = 'ok' }) {
  if (!message) return null
  const toneClass =
    tone === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
  return (
    <div
      className={`pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-lg ${toneClass}`}
      role="status"
    >
      {message}
    </div>
  )
}

/**
 * Interactive Mermaid canvas: zoom, pan, export, code tools.
 *
 * @param {{
 *   diagramSyntax: string,
 *   title?: string,
 *   description?: string,
 *   filenameBase?: string,
 *   className?: string,
 *   fillHeight?: boolean,
 *   onClose?: () => void,
 *   showClose?: boolean
 * }} props
 */
export default function InteractiveMermaidViewer({
  diagramSyntax,
  title = 'Mermaid Diagram',
  description,
  filenameBase,
  className = '',
  fillHeight = false,
  onClose,
  showClose = false
}) {
  const reactId = useId().replace(/:/g, '')
  const stageRef = useRef(null)
  const svgHostRef = useRef(null)
  const panRef = useRef({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 })

  const [error, setError] = useState(null)
  const [rendering, setRendering] = useState(false)
  const [rendered, setRendered] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [showCode, setShowCode] = useState(false)
  const [toast, setToast] = useState({ message: '', tone: 'ok' })
  const [isBrowserFs, setIsBrowserFs] = useState(false)

  const fileBase = slugify(filenameBase || title)

  const flash = useCallback((message, tone = 'ok') => {
    setToast({ message, tone })
    window.setTimeout(() => setToast({ message: '', tone: 'ok' }), 2200)
  }, [])

  const resetView = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  // Render Mermaid → SVG (sanitized; never injects error-bomb SVG)
  useEffect(() => {
    let cancelled = false

    async function renderDiagram() {
      setError(null)
      setRendered(false)

      if (!diagramSyntax?.trim()) {
        if (svgHostRef.current) svgHostRef.current.innerHTML = ''
        setError('No Mermaid syntax provided.')
        return
      }

      setRendering(true)
      await Promise.resolve()
      if (cancelled || !svgHostRef.current) return

      const result = await safeRenderMermaid(
        diagramSyntax,
        safeMermaidRenderId('interactive')
      )

      if (cancelled || !svgHostRef.current) return

      if (!result.ok) {
        svgHostRef.current.innerHTML = ''
        setRendered(false)
        setError(result.error || 'Failed to parse or render Mermaid diagram.')
        setRendering(false)
        return
      }

      svgHostRef.current.innerHTML = result.svg
      const svgEl = svgHostRef.current.querySelector('svg')
      if (svgEl) {
        svgEl.removeAttribute('height')
        svgEl.style.width = '100%'
        svgEl.style.height = 'auto'
        svgEl.style.maxWidth = 'none'
        svgEl.style.display = 'block'
        svgEl.style.userSelect = 'none'
        svgEl.setAttribute('role', 'img')
        svgEl.setAttribute('aria-label', title)
      }

      setError(null)
      setRendered(true)
      resetView()
      setRendering(false)
    }

    renderDiagram()
    return () => {
      cancelled = true
    }
  }, [diagramSyntax, reactId, title, resetView])

  // Wheel zoom (ctrl/meta or always over stage)
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return undefined

    const onWheel = (e) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
      setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((z + delta).toFixed(2)))))
    }

    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (e) => {
    if (e.button !== 0) return
    panRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      originX: pan.x,
      originY: pan.y
    }
    setDragging(true)
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e) => {
    if (!panRef.current.active) return
    const dx = e.clientX - panRef.current.startX
    const dy = e.clientY - panRef.current.startY
    setPan({
      x: panRef.current.originX + dx,
      y: panRef.current.originY + dy
    })
  }

  const onPointerUp = (e) => {
    panRef.current.active = false
    setDragging(false)
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }

  const zoomIn = () =>
    setZoom((z) => Math.min(MAX_ZOOM, Number((z + ZOOM_STEP).toFixed(2))))
  const zoomOut = () =>
    setZoom((z) => Math.max(MIN_ZOOM, Number((z - ZOOM_STEP).toFixed(2))))

  const exportSvg = () => {
    const svgEl = getSvgElement(svgHostRef.current)
    if (!svgEl) {
      flash('Nothing to export', 'error')
      return
    }
    const { xml } = serializeSvg(svgEl)
    downloadBlob(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }), `${fileBase}.svg`)
    flash('SVG downloaded')
  }

  const exportPng = async () => {
    const svgEl = getSvgElement(svgHostRef.current)
    if (!svgEl) {
      flash('Nothing to export', 'error')
      return
    }

    try {
      const { xml, width, height } = serializeSvg(svgEl)
      const scale = 2

      const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }))
      const img = new Image()
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = () => reject(new Error('Could not rasterize SVG'))
        img.src = url
      })

      const canvas = document.createElement('canvas')
      canvas.width = width * scale
      canvas.height = height * scale
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#09090b'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)

      const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!pngBlob) throw new Error('PNG encode failed')
      downloadBlob(pngBlob, `${fileBase}.png`)
      flash('PNG downloaded')
    } catch (err) {
      console.error(err)
      flash(err?.message || 'PNG export failed', 'error')
    }
  }

  const copyCode = async () => {
    try {
      const code = sanitizeMermaidDiagram(diagramSyntax) || diagramSyntax || ''
      await navigator.clipboard.writeText(code)
      flash('Mermaid code copied')
    } catch {
      flash('Clipboard unavailable', 'error')
    }
  }

  const downloadMmd = () => {
    const code = sanitizeMermaidDiagram(diagramSyntax) || diagramSyntax || ''
    downloadBlob(
      new Blob([code], { type: 'text/plain;charset=utf-8' }),
      `${fileBase}.mmd`
    )
    flash('Mermaid file downloaded')
  }

  const toggleBrowserFullscreen = async () => {
    const el = stageRef.current?.closest('[data-interactive-mermaid-root]')
    if (!el) return
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen()
        setIsBrowserFs(true)
      } else {
        await document.exitFullscreen()
        setIsBrowserFs(false)
      }
    } catch {
      flash('Fullscreen not available', 'error')
    }
  }

  useEffect(() => {
    const onFsChange = () => setIsBrowserFs(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const rootClass = fillHeight
    ? 'flex h-full min-h-0 flex-col'
    : 'flex min-h-[320px] flex-col'

  return (
    <div
      data-interactive-mermaid-root
      className={`${rootClass} overflow-hidden rounded-2xl border border-zinc-200 bg-white text-zinc-900 ${className}`}
    >
      {/* Toolbar */}
      <div className="flex flex-col gap-2 border-b border-zinc-200 bg-white/95 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-zinc-900">{title}</h3>
          {description ? (
            <p className="mt-0.5 line-clamp-1 text-[11px] text-zinc-500">{description}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <ToolButton title="Zoom out" onClick={zoomOut} disabled={!!error}>
            −
          </ToolButton>
          <span className="min-w-[3.25rem] text-center text-[11px] font-mono text-zinc-500">
            {Math.round(zoom * 100)}%
          </span>
          <ToolButton title="Zoom in" onClick={zoomIn} disabled={!!error}>
            +
          </ToolButton>
          <ToolButton title="Reset view" onClick={resetView} disabled={!!error}>
            Reset
          </ToolButton>
          <ToolButton
            title={isBrowserFs ? 'Exit fullscreen' : 'Fullscreen'}
            onClick={toggleBrowserFullscreen}
            active={isBrowserFs}
          >
            {isBrowserFs ? 'Exit FS' : 'Fullscreen'}
          </ToolButton>
          <ToolButton title="Export PNG" onClick={exportPng} disabled={!rendered}>
            PNG
          </ToolButton>
          <ToolButton title="Export SVG" onClick={exportSvg} disabled={!rendered}>
            SVG
          </ToolButton>
          <ToolButton title="Copy Mermaid code" onClick={copyCode} disabled={!diagramSyntax?.trim()}>
            Copy
          </ToolButton>
          <ToolButton title="Download .mmd file" onClick={downloadMmd} disabled={!diagramSyntax?.trim()}>
            .mmd
          </ToolButton>
          <ToolButton
            title="Toggle syntax view"
            onClick={() => setShowCode((v) => !v)}
            active={showCode}
            disabled={!diagramSyntax?.trim()}
          >
            Code
          </ToolButton>
          {showClose ? (
            <ToolButton title="Close viewer" onClick={() => onClose?.()}>
              Close
            </ToolButton>
          ) : null}
        </div>
      </div>

      {/* Body: canvas + optional code panel */}
      <div
        className={`relative flex min-h-0 flex-1 flex-col lg:flex-row ${
          fillHeight ? '' : 'min-h-[360px] sm:min-h-[420px]'
        }`}
      >
        <div
          ref={stageRef}
          className={`relative min-h-[260px] flex-1 overflow-hidden bg-[radial-gradient(ellipse_at_center,_#f4f4f5_0%,_#ffffff_70%)] ${
            showCode ? 'lg:w-1/2' : 'w-full'
          }`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
        >
          {rendering ? (
            <div className="absolute inset-0 z-[1] flex items-center justify-center bg-white/60 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <svg className="h-4 w-4 animate-spin text-sky-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Rendering diagram…
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="absolute inset-0 z-[1] flex items-center justify-center p-6">
              <div className="max-w-md rounded-xl border border-rose-200 bg-rose-50 px-5 py-6 text-center">
                <p className="text-sm font-semibold text-rose-700">Could not render diagram</p>
                <p className="mt-2 text-xs leading-relaxed text-rose-600 break-words">{error}</p>
                <p className="mt-3 text-[11px] text-zinc-500">
                  Open the Code panel to inspect Mermaid syntax.
                </p>
              </div>
            </div>
          ) : (
            <div
              className={`flex h-full w-full items-center justify-center p-4 sm:p-8 transition-opacity duration-500 ease-out ${
                rendered ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <div
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                  transition: dragging ? 'none' : 'transform 120ms ease-out'
                }}
              >
                <div
                  ref={svgHostRef}
                  className={`mermaid-animated-host [&_svg]:max-w-none ${
                    rendered ? 'animate-mermaid-in' : ''
                  }`}
                />
              </div>
            </div>
          )}

          <p className="pointer-events-none absolute bottom-2 left-3 text-[10px] text-zinc-400">
            Scroll to zoom · drag to pan
          </p>
          <StatusToast message={toast.message} tone={toast.tone} />
        </div>

        {showCode ? (
          <div className="flex max-h-[40vh] min-h-[180px] w-full flex-col border-t border-zinc-200 bg-white lg:max-h-none lg:w-1/2 lg:border-l lg:border-t-0">
            <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Mermaid source
              </span>
              <div className="flex gap-1.5">
                <ToolButton title="Copy Mermaid code" onClick={copyCode}>
                  Copy
                </ToolButton>
                <ToolButton title="Download .mmd file" onClick={downloadMmd}>
                  .mmd
                </ToolButton>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <SyntaxHighlighter
                language="javascript"
                style={oneLight}
                customStyle={{
                  margin: 0,
                  padding: '1rem',
                  background: '#fafafa',
                  fontSize: '12px',
                  lineHeight: 1.55,
                  minHeight: '100%'
                }}
                codeTagProps={{ style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } }}
                showLineNumbers
                wrapLongLines
              >
                {sanitizeMermaidDiagram(diagramSyntax) || diagramSyntax || ''}
              </SyntaxHighlighter>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Fullscreen modal shell around InteractiveMermaidViewer.
 */
export function InteractiveMermaidModal({
  open,
  onClose,
  diagramSyntax,
  title,
  description,
  filenameBase
}) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-white/95 backdrop-blur-md p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Mermaid viewer'}
    >
      <InteractiveMermaidViewer
        diagramSyntax={diagramSyntax}
        title={title}
        description={description || 'Esc to close · scroll zoom · drag pan · export tools'}
        filenameBase={filenameBase}
        fillHeight
        className="h-full min-h-0 shadow-2xl shadow-zinc-900/15"
        showClose
        onClose={onClose}
      />
    </div>,
    document.body
  )
}
