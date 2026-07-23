import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const ToastContext = createContext(null)

let toastId = 0

/**
 * Global toast provider — useToast().showToast(message, type?)
 * type: 'success' | 'error' | 'info'
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback(
    (message, type = 'info', durationMs = 4500) => {
      const id = ++toastId
      setToasts((prev) => [...prev, { id, message, type }])
      if (durationMs > 0) {
        window.setTimeout(() => dismissToast(id), durationMs)
      }
      return id
    },
    [dismissToast]
  )

  const value = useMemo(
    () => ({ showToast, dismissToast }),
    [showToast, dismissToast]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)] pointer-events-none font-sans"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-md animate-dash-fade ${
              toast.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : toast.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-white border-zinc-200 text-zinc-800'
            }`}
          >
            <p className="flex-1 leading-snug">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="shrink-0 text-current/60 hover:text-current cursor-pointer text-lg leading-none"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return ctx
}
