/**
 * Modal — bazowy komponent okna modalnego
 *
 * Użycie:
 *   <Modal isOpen={open} onClose={() => setOpen(false)} title="Tytuł" size="lg">
 *     ...treść...
 *     <Modal.Footer>
 *       <button onClick={onClose} className="btn btn-ghost">Anuluj</button>
 *       <button className="btn btn-primary">Zapisz</button>
 *     </Modal.Footer>
 *   </Modal>
 *
 * Rozmiary: "sm" (480), "md" (640), "lg" (800), "xl" (1024), "full" (95vw)
 *
 * Z-index warstwy (nie zmieniać):
 *   Modal bazowy:    z-index 1000
 *   Modal nad modal: z-index 1010 (AsortymentSelektor)
 *   ConfirmModal:    z-index 1020
 */

import React, { useEffect } from "react";
import { X } from "lucide-react";

type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

const SIZE_MAP: Record<ModalSize, string> = {
  sm:   "480px",
  md:   "640px",
  lg:   "800px",
  xl:   "1024px",
  full: "95vw",
};

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: string;
  size?: ModalSize;
  /** Domyślnie true — klik na backdrop zamyka */
  closeOnBackdrop?: boolean;
  /** Jeśli true, modal zajmuje 90vh i scrolluje wewnętrznie */
  tall?: boolean;
  /** Dodatkowe klasy na kontenerze dialogu */
  className?: string;
  /** Z-index nadpisanie (dla zagnieżdżonych modali) */
  zIndex?: number;
  children: React.ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  size = "md",
  closeOnBackdrop = true,
  tall = false,
  className = "",
  zIndex = 1000,
  children,
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        background: 'rgba(4,8,16,0.75)',
        backdropFilter: 'blur(3px)',
      }}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={className}
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03)',
          width: '100%',
          maxWidth: SIZE_MAP[size],
          maxHeight: tall ? '90vh' : '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'modalIn 0.18s ease forwards',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        {(title || subtitle) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-surface)',
              flexShrink: 0,
            }}
          >
            <div>
              {title && (
                <h3 style={{
                  margin: 0,
                  fontSize: '14px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.01em',
                }}>
                  {title}
                </h3>
              )}
              {subtitle && (
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                  {subtitle}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: '2px',
                marginTop: '1px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Body — scrollowalny */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Footer modalu — przyklejony do dołu */
Modal.Footer = function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: '8px',
        padding: '12px 20px',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
};

/** Sekcja w body modalu z paddingiem */
Modal.Body = function ModalBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={className} style={{ padding: '20px' }}>
      {children}
    </div>
  );
};
