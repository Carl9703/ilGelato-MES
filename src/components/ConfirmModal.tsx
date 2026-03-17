import React from 'react';
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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-md border border-[#334155] overflow-hidden">
        <div className="flex justify-between items-center p-5 border-b border-[#334155]">
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

        <div className="p-4 border-t border-[#334155] bg-[#0f172a]/50 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 text-slate-400 hover:bg-[#334155] rounded-xl font-semibold transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-5 py-2.5 rounded-xl font-bold text-white transition-colors min-h-[44px] ${
              isDestructive
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
