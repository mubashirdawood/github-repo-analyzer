import { useState } from 'react'
import MermaidViewer from './MermaidViewer'

/**
 * Architecture diagram preview + interactive Mermaid viewer (single modal).
 */
export default function ArchitectureDiagram({ diagramSyntax, title = 'Architecture Diagram' }) {
  const [open, setOpen] = useState(false)

  if (!diagramSyntax?.trim()) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-8 text-center">
        <p className="text-sm font-medium text-zinc-500">Diagram unavailable for this repo</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">Preview — open interactive viewer for zoom, pan &amp; export</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-black-700 hover:text-sky-800 bg-sky-50 hover:bg-sky-100 border border-black-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
          </svg>
          Open interactive viewer
        </button>
      </div>

      <MermaidViewer
        diagramSyntax={diagramSyntax}
        title={title}
        showPreview
        compact={false}
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  )
}
