import { useEffect, useId, useRef, useState } from 'react'
import { InteractiveMermaidModal } from './InteractiveMermaidViewer'
import { safeRenderMermaid, safeMermaidRenderId } from '../utils/mermaidSafe'

/**
 * Compact preview render (lazy-capable). Never shows Mermaid error-bomb SVG.
 */
function useMermaidPreview(diagramSyntax, reactId, containerRef, setError, active = true) {
  useEffect(() => {
    let cancelled = false

    async function renderDiagram() {
      setError(false)

      if (!active || !diagramSyntax?.trim()) {
        if (containerRef.current) containerRef.current.innerHTML = ''
        return
      }

      await Promise.resolve()
      if (cancelled || !containerRef.current) return

      const result = await safeRenderMermaid(diagramSyntax, safeMermaidRenderId('preview'))

      if (cancelled || !containerRef.current) return

      if (!result.ok) {
        console.warn('Mermaid preview failed:', result.error)
        containerRef.current.innerHTML = ''
        setError(true)
        return
      }

      containerRef.current.innerHTML = result.svg
      const svgEl = containerRef.current.querySelector('svg')
      if (svgEl) {
        svgEl.removeAttribute('height')
        svgEl.style.width = '100%'
        svgEl.style.height = 'auto'
        svgEl.style.maxWidth = '100%'
        svgEl.style.display = 'block'
      }
      setError(false)
    }

    renderDiagram()
    return () => {
      cancelled = true
    }
  }, [diagramSyntax, reactId, containerRef, setError, active])
}

function DiagramUnavailable({ detail }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center">
      <p className="text-sm font-medium text-zinc-500">Diagram unavailable</p>
      {detail ? <p className="text-xs text-zinc-400 mt-1">{detail}</p> : null}
    </div>
  )
}

/**
 * Lazy preview + Interactive Mermaid Viewer modal.
 */
export default function MermaidViewer({
  diagramSyntax,
  title = 'Diagram',
  description,
  open = false,
  onClose,
  showPreview = true,
  lazy = false,
  compact = false
}) {
  const previewRef = useRef(null)
  const sentinelRef = useRef(null)
  const reactId = useId().replace(/:/g, '')
  const [error, setError] = useState(false)
  const [inView, setInView] = useState(!lazy)

  useEffect(() => {
    if (!lazy || !sentinelRef.current) return undefined

    const el = sentinelRef.current
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: '120px', threshold: 0.05 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [lazy])

  useMermaidPreview(
    diagramSyntax,
    reactId,
    previewRef,
    setError,
    showPreview && inView && Boolean(diagramSyntax?.trim())
  )

  if (!diagramSyntax?.trim() && showPreview) {
    return <DiagramUnavailable />
  }

  return (
    <>
      {showPreview ? (
        <div ref={sentinelRef} className="space-y-2">
          <div
            className={`rounded-xl border border-zinc-200 bg-zinc-50 overflow-auto ${
              compact ? 'min-h-[120px] max-h-[160px] p-3' : 'min-h-[280px] max-h-[520px] p-4'
            }`}
          >
            {!inView ? (
              <div className="flex h-[120px] items-center justify-center text-xs text-zinc-400">
                Scroll to load preview…
              </div>
            ) : error ? (
              <DiagramUnavailable detail="Could not render this diagram." />
            ) : (
              <div
                ref={previewRef}
                className="w-full flex justify-center animate-mermaid-in [&_svg]:w-full [&_svg]:h-auto [&_svg]:max-w-full"
              />
            )}
          </div>
        </div>
      ) : null}

      <InteractiveMermaidModal
        open={open}
        onClose={onClose}
        diagramSyntax={diagramSyntax}
        title={title}
        description={description}
        filenameBase={title}
      />
    </>
  )
}
