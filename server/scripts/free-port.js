/**
 * Frees PORT (default 5000) if another process is still listening.
 * Prevents EADDRINUSE crashes when a previous `npm run dev` did not exit cleanly.
 */
import { execSync } from 'child_process'

const port = String(process.env.PORT || 5000)

function freePortWindows(p) {
  let out = ''
  try {
    out = execSync(`netstat -ano | findstr :${p}`, { encoding: 'utf8' })
  } catch {
    return
  }

  const pids = new Set()
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes('LISTENING')) continue
    const parts = line.trim().split(/\s+/)
    const pid = parts[parts.length - 1]
    if (pid && /^\d+$/.test(pid) && pid !== '0') {
      pids.add(pid)
    }
  }

  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' })
      console.log(`[dev] Freed port ${p} (stopped PID ${pid})`)
    } catch {
      // Process may already be gone
    }
  }
}

function freePortUnix(p) {
  try {
    const out = execSync(`lsof -tiTCP:${p} -sTCP:LISTEN`, { encoding: 'utf8' }).trim()
    if (!out) return
    for (const pid of out.split(/\n/)) {
      try {
        execSync(`kill -9 ${pid}`, { stdio: 'ignore' })
        console.log(`[dev] Freed port ${p} (stopped PID ${pid})`)
      } catch {
        // ignore
      }
    }
  } catch {
    // nothing listening
  }
}

if (process.platform === 'win32') {
  freePortWindows(port)
} else {
  freePortUnix(port)
}
