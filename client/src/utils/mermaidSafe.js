/**
 * Client Mermaid helper — flowchart-first, Mermaid 11.16 safe.
 * Strip fences → soften shapes/labels → parse → render (reject error-bomb SVG).
 */

import mermaid from 'mermaid'

let mermaidReady = false

export function ensureMermaidDark() {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'neutral',
    fontFamily: 'Roboto, ui-sans-serif, system-ui, sans-serif',
    flowchart: {
      htmlLabels: false,
      curve: 'basis',
      padding: 16
    }
  })
  if (!mermaidReady) {
    mermaid.parseError = (err) => {
      console.warn('[mermaid] parse error suppressed:', err)
    }
    mermaidReady = true
  }
}

/** Render IDs must be alphanumeric for Mermaid 11. */
export function safeMermaidRenderId(prefix = 'mmd') {
  const raw = `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 9)}`
  return raw.replace(/[^a-zA-Z0-9]/g, '') || `mmd${Date.now()}`
}

function stripFences(raw) {
  let text = String(raw || '').trim()
  if (!text) return ''
  const fenced = text.match(/```(?:mermaid)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) text = fenced[1].trim()
  return text
}

function softenLabel(label) {
  return String(label)
    .replace(/[()[\]{}|/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Normalize flowchart syntax Mermaid 11 often rejects at render time.
 */
export function softenFlowchartLabels(text) {
  let out = String(text || '')

  // id("Label") → id["Label"]
  out = out.replace(
    /\b([A-Za-z][\w]*)\((["'])([^"']*)\2\)/g,
    (_, id, _q, label) => `${id}["${softenLabel(label)}"]`
  )
  // id[("Label")] → id["Label"]
  out = out.replace(
    /\b([A-Za-z][\w]*)\[\((["'])([^"']*)\2\)\]/g,
    (_, id, _q, label) => `${id}["${softenLabel(label)}"]`
  )
  // id[(Label)] → id["Label"]
  out = out.replace(
    /\b([A-Za-z][\w]*)\[\(([^)\]]+)\)\]/g,
    (_, id, label) => `${id}["${softenLabel(label)}"]`
  )
  out = out.replace(/\["([^"]*)"\]/g, (_, label) => `["${softenLabel(label)}"]`)

  // Prefix bare subgraph ids
  out = out.replace(
    /^([ \t]*)subgraph\s+([A-Za-z][\w]*)(\[|"|\s|$)/gm,
    (full, sp, id, rest) => {
      if (id.startsWith('sg_') || id.startsWith('sub_')) return full
      return `${sp}subgraph sg_${id}${rest}`
    }
  )

  return out
}

/**
 * Prepare flowchart source for Mermaid 11.
 */
export function sanitizeMermaidDiagram(raw) {
  let text = stripFences(raw)
  if (!text) return ''

  const flowIdx = text.search(/^(?:flowchart|graph)\s+/im)
  const seqIdx = text.search(/\bsequenceDiagram\b/i)

  // Prefer flowchart when present; light sequence repair only as fallback
  if (flowIdx >= 0 && (seqIdx < 0 || flowIdx <= seqIdx)) {
    if (flowIdx > 0) text = text.slice(flowIdx).trim()
    text = text.replace(/^(graph)\s+(TD|TB|LR|RL|BT)\b/i, (_, _g, dir) => {
      const d = String(dir).toUpperCase() === 'TB' ? 'TD' : String(dir).toUpperCase()
      return `flowchart ${d}`
    })
    text = text.replace(/^(flowchart)\s+(TB)\b/i, 'flowchart TD')
    if (/^(flowchart|graph)\b/i.test(text) && !/^(flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/i.test(text)) {
      text = text.replace(/^(flowchart|graph)\b\s*/i, 'flowchart TD\n')
    }
    text = text
      .split(/\r?\n/)
      .filter((l) => !/^```/.test(l.trim()))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    return softenFlowchartLabels(text)
  }

  if (seqIdx >= 0) {
    text = text.slice(seqIdx)
    text = text.replace(/^sequenceDiagram\s*[.:;,]?\s*/i, 'sequenceDiagram\n')
    return text
      .split(/\r?\n/)
      .filter((l) => !/^```/.test(l.trim()))
      .join('\n')
      .trim()
  }

  if (/\w+\s*-->\s*\w+/.test(text)) {
    return softenFlowchartLabels(`flowchart TD\n${text}`)
  }
  return ''
}

/**
 * Mermaid embeds `.error-icon` CSS in normal flowchart stylesheets.
 * Only treat as failure when the error diagram markup/text is present.
 */
function looksLikeErrorSvg(svg) {
  if (!svg || typeof svg !== 'string') return true
  const lower = svg.toLowerCase()
  return (
    lower.includes('syntax error in text') ||
    /class\s*=\s*["'][^"']*error-icon/.test(lower) ||
    /class\s*=\s*["'][^"']*error-text/.test(lower)
  )
}

/**
 * Parse + render once. Never returns Mermaid error-bomb SVG.
 * @returns {Promise<{ ok: true, svg: string, mermaid: string } | { ok: false, error: string, mermaid: string }>}
 */
export async function safeRenderMermaid(diagramSyntax, renderId) {
  ensureMermaidDark()

  const mermaidText = sanitizeMermaidDiagram(diagramSyntax)
  if (!mermaidText) {
    return { ok: false, error: 'Empty diagram', mermaid: '' }
  }

  const id = renderId && /^[a-zA-Z][a-zA-Z0-9]*$/.test(renderId)
    ? renderId
    : safeMermaidRenderId('mmd')

  try {
    await mermaid.parse(mermaidText)
  } catch (err) {
    return {
      ok: false,
      error: err?.message || 'Invalid Mermaid syntax',
      mermaid: mermaidText
    }
  }

  try {
    const { svg } = await mermaid.render(id, mermaidText)
    if (looksLikeErrorSvg(svg)) {
      return {
        ok: false,
        error: 'Mermaid returned a syntax error diagram',
        mermaid: mermaidText
      }
    }
    return { ok: true, svg, mermaid: mermaidText }
  } catch (err) {
    return {
      ok: false,
      error: err?.message || 'Mermaid render failed',
      mermaid: mermaidText
    }
  }
}
