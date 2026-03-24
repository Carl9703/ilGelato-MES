import React from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import type { SortDir } from '../utils/sortBy';

type Props = React.Attributes & {
  label: string;
  field: string;
  sortKey: string;
  sortDir: SortDir;
  onSort: (key: string) => void;
  className?: string;
  style?: React.CSSProperties;
};

export function SortableTh({ label, field, sortKey, sortDir, onSort, className, style }: Props) {
  const active = sortKey === field;
  return (
    <th
      className={className}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...style }}
      onClick={() => onSort(field)}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        {label}
        {active
          ? sortDir === 'asc'
            ? <ChevronUp style={{ width: 11, height: 11 }} />
            : <ChevronDown style={{ width: 11, height: 11 }} />
          : <ChevronsUpDown style={{ width: 11, height: 11, opacity: 0.3 }} />
        }
      </span>
    </th>
  );
}
