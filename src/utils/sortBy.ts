export type SortDir = 'asc' | 'desc';

export function sortBy<T>(
  data: T[],
  accessor: (item: T) => string | number | boolean | null | undefined,
  dir: SortDir
): T[] {
  return [...data].sort((a, b) => {
    const av = accessor(a);
    const bv = accessor(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    let cmp: number;
    if (typeof av === 'number' && typeof bv === 'number') {
      cmp = av - bv;
    } else {
      cmp = String(av).localeCompare(String(bv), 'pl', { sensitivity: 'base' });
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

export function makeSortHandler(
  sortKey: string,
  setSortKey: (k: string) => void,
  setSortDir: (fn: (d: SortDir) => SortDir) => void
) {
  return (key: string) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(() => 'asc'); }
  };
}
