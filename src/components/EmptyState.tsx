/**
 * EmptyState — standardowy komunikat "brak danych"
 *
 * Użycie:
 *   <EmptyState message="Brak zleceń produkcyjnych." />
 *   <EmptyState icon={Factory} message="Brak zleceń." hint="Utwórz pierwsze zlecenie." />
 */

import { type LucideIcon, Inbox } from "lucide-react";

interface EmptyStateProps {
  message: string;
  hint?: string;
  icon?: LucideIcon;
}

export function EmptyState({ message, hint, icon: Icon = Inbox }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      gap: '10px',
      textAlign: 'center',
    }}>
      <Icon
        style={{ width: 28, height: 28, color: 'var(--text-muted)', opacity: 0.5 }}
        strokeWidth={1.5}
      />
      <p style={{ margin: 0, fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
        {message}
      </p>
      {hint && (
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
          {hint}
        </p>
      )}
    </div>
  );
}
