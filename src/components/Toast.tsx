/**
 * Toast — globalny system powiadomień
 *
 * Użycie:
 *   const { showToast } = useToast();
 *   showToast("Zapisano", "ok");
 *   showToast("Błąd zapisu", "error");
 *   showToast("Uwaga", "warn");
 *
 * Owijamy App w <ToastProvider> w main.tsx.
 */

import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

type ToastType = "ok" | "error" | "warn" | "info";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS = {
  ok:    <CheckCircle  className="w-4 h-4 shrink-0" />,
  error: <XCircle     className="w-4 h-4 shrink-0" />,
  warn:  <AlertTriangle className="w-4 h-4 shrink-0" />,
  info:  <Info        className="w-4 h-4 shrink-0" />,
};

const STYLES: Record<ToastType, React.CSSProperties> = {
  ok:    { background: 'rgba(16,185,129,0.12)',  border: '1px solid rgba(16,185,129,0.3)',  color: '#34d399' },
  error: { background: 'rgba(244,63,94,0.12)',   border: '1px solid rgba(244,63,94,0.3)',   color: '#fb7185' },
  warn:  { background: 'rgba(245,158,11,0.12)',  border: '1px solid rgba(245,158,11,0.3)',  color: '#fbbf24' },
  info:  { background: 'rgba(6,182,212,0.12)',   border: '1px solid rgba(6,182,212,0.3)',   color: '#22d3ee' },
};

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    timers.current.delete(id);
  }, []);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = nextId++;
    setToasts(prev => [...prev.slice(-4), { id, message, type }]);
    const timer = setTimeout(() => remove(id), 4000);
    timers.current.set(id, timer);
  }, [remove]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Portal obszar — fixed, górny prawy narożnik */}
      <div
        style={{
          position: 'fixed',
          top: '1rem',
          right: '1rem',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          pointerEvents: 'none',
        }}
      >
        {toasts.map(toast => (
          <div
            key={toast.id}
            style={{
              ...STYLES[toast.type],
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 500,
              backdropFilter: 'blur(8px)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              pointerEvents: 'all',
              minWidth: '240px',
              maxWidth: '380px',
              animation: 'toastIn 0.2s ease forwards',
            }}
          >
            {ICONS[toast.type]}
            <span style={{ flex: 1, color: 'var(--text-primary)', opacity: 0.95 }}>{toast.message}</span>
            <button
              onClick={() => remove(toast.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', opacity: 0.5 }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast musi być użyty wewnątrz <ToastProvider>");
  return ctx;
}
