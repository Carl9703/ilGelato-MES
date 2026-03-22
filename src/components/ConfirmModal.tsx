import React, { useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = "Potwierdź",
  cancelText = "Anuluj",
  onConfirm,
  onCancel,
  isDestructive = true
}: ConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="flex justify-between items-center p-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            {isDestructive && (
              <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center border border-red-500/20">
                <AlertTriangle className="w-4 h-4 text-red-400" />
              </div>
            )}
            <h3 className="text-base font-bold text-white">{title}</h3>
          </div>
          <button onClick={onCancel} className="text-slate-500 hover:text-white p-2 rounded-lg hover:bg-[#334155] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{message}</p>
        </div>

        <div className="p-4 flex justify-end gap-3" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-app)' }}>
          <button onClick={onCancel} className="btn btn-ghost">
            {cancelText}
          </button>
          <button onClick={onConfirm} className={isDestructive ? 'btn btn-danger' : 'btn btn-primary'}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
