/**
 * Structural validation for Mermaid flowchart (request lifecycle / architecture).
 */

import { buildFallbackRequestLifecycleMermaid } from '../../mermaid/generateComprehensiveRequestFlow.js';

export interface MermaidFlowchartValidationResult {
  valid: boolean;
  mermaid: string;
  errors: string[];
}

/**
 * Strip fences / prose; keep flowchart body.
 */
export function extractMermaidFlowchart(raw: string): string {
  let text = String(raw || '').trim();
  if (!text) return '';

  const fenced = text.match(/```(?:mermaid)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) text = fenced[1].trim();

  const idx = text.search(/^(?:flowchart|graph)\s+/im);
  if (idx > 0) text = text.slice(idx).trim();
  if (idx < 0 && !/^(flowchart|graph)\b/i.test(text)) {
    return '';
  }

  return text;
}

/**
 * Repair common flowchart mistakes for Mermaid 11+.
 */
export function sanitizeMermaidFlowchart(raw: string): string {
  let text = extractMermaidFlowchart(raw);
  if (!text) return '';

  if (/^(flowchart|graph)\b/i.test(text) && !/^(flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/i.test(text)) {
    text = text.replace(/^(flowchart|graph)\b\s*/i, 'flowchart TD\n');
  } else {
    text = text.replace(
      /^(graph)\s+(TD|TB|LR|RL|BT)\b/i,
      (_m, _g, dir: string) => `flowchart ${dir.toUpperCase() === 'TB' ? 'TD' : dir.toUpperCase()}`
    );
    text = text.replace(
      /^(flowchart)\s+(TB)\b/i,
      'flowchart TD'
    );
  }

  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let depth = 0;

  for (const line of lines) {
    let trimmed = line.replace(/\t/g, '  ').replace(/\s+$/g, '').trim();
    if (!trimmed) {
      if (out.length) out.push('');
      continue;
    }
    if (/^```/.test(trimmed)) continue;

    if (/^(flowchart|graph)\s+/i.test(trimmed)) {
      if (out.length === 0) {
        const m = trimmed.match(/^(flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/i);
        const dir = m ? (m[2]!.toUpperCase() === 'TB' ? 'TD' : m[2]!.toUpperCase()) : 'TD';
        out.push(`flowchart ${dir}`);
      }
      continue;
    }

    if (/^subgraph\b/i.test(trimmed)) {
      depth += 1;
      const m = trimmed.match(/^subgraph\s+(.+)$/i);
      if (m) {
        let rest = m[1]!.trim();
        if (!/\[/.test(rest) && /\s/.test(rest)) {
          const id = rest.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '') || 'Group';
          const label = rest.replace(/"/g, "'");
          trimmed = `subgraph ${id}["${label}"]`;
        }
      }
      out.push(`  ${trimmed}`);
      continue;
    }

    if (/^end\b/i.test(trimmed)) {
      depth = Math.max(0, depth - 1);
      out.push('  end');
      continue;
    }

    // Drop sequence leftovers if mixed
    if (/^(sequenceDiagram|actor|participant)\b/i.test(trimmed)) continue;

    trimmed = trimmed.replace(/\s*-->\s*/g, ' --> ');
    out.push(`  ${trimmed}`);
  }

  while (depth > 0) {
    out.push('  end');
    depth -= 1;
  }

  const cleaned = out.filter((l, idx) => {
    if (idx === 0) return /^flowchart\s+/i.test(l.trim());
    return !/^(flowchart|graph)\s+/i.test(l.trim());
  });

  if (!cleaned.length || !/^flowchart\s+/i.test(cleaned[0]!.trim())) return '';
  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Validate Mermaid flowchart structurally (no Mermaid runtime required).
 */
export function validateMermaidFlowchart(raw: string): MermaidFlowchartValidationResult {
  const errors: string[] = [];
  const mermaid = sanitizeMermaidFlowchart(raw);

  if (!mermaid) {
    return { valid: false, mermaid: '', errors: ['Empty flowchart output'] };
  }

  const lines = mermaid
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('%%'));

  if (!/^flowchart\s+(TD|LR|RL|BT)\b/i.test(lines[0] || '')) {
    errors.push('Must start with flowchart TD|LR|RL|BT');
  }

  if (/```/.test(mermaid)) errors.push('Contains markdown fences');
  if (/\bsequenceDiagram\b/i.test(mermaid)) {
    errors.push('Contains sequenceDiagram (expected flowchart)');
  }

  let depth = 0;
  for (const line of lines.slice(1)) {
    if (/^subgraph\b/i.test(line)) depth += 1;
    if (/^end\b/i.test(line)) depth -= 1;
    if (depth < 0) {
      errors.push('Unbalanced end without matching subgraph');
      break;
    }
  }
  if (depth > 0) errors.push('Unclosed subgraph');

  const edges = lines.filter((l) => /-->/.test(l));
  if (edges.length < 1) errors.push('Missing flowchart edges (-->)');

  // Count node-ish declarations (id[...] id(...) id[(...)])
  const nodeLines = lines.filter(
    (l) =>
      /^[A-Za-z][\w]*(\[|\(|\[\()/.test(l) ||
      (/^[A-Za-z][\w]*$/.test(l) && !/^(end|subgraph)\b/i.test(l))
  );
  const nodeCount = Math.max(nodeLines.length, edges.length + 1);
  if (nodeCount > 45) errors.push('Too many nodes (>45)');
  if (nodeCount < 2) errors.push('Too few nodes');

  // Reserved bare id "end" as a node declaration is invalid
  for (const line of lines) {
    if (/^end\b/i.test(line)) continue;
    if (/\bend\s*(\[|\(|-->)/.test(line) || /\s+end\s*-->/.test(line)) {
      errors.push('Invalid use of reserved id "end" as a node');
      break;
    }
  }

  return {
    valid: errors.length === 0,
    mermaid:
      errors.length === 0
        ? mermaid
            .split(/\r?\n/)
            .map((l) => l.replace(/\s+$/g, ''))
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
        : mermaid,
    errors
  };
}

/**
 * Ensure a valid flowchart: sanitize → validate → fallback.
 */
export function ensureValidRequestFlowMermaid(
  raw: string,
  fallbackLabels?: {
    frontend?: string | null;
    backend?: string | null;
    database?: string | null;
  }
): string {
  const first = validateMermaidFlowchart(raw);
  if (first.valid) return first.mermaid;

  const repaired = validateMermaidFlowchart(sanitizeMermaidFlowchart(raw));
  if (repaired.valid) return repaired.mermaid;

  const fallback = buildFallbackRequestLifecycleMermaid(fallbackLabels || {});
  const check = validateMermaidFlowchart(fallback);
  return check.valid ? check.mermaid : fallback;
}
