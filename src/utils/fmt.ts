/** Formatuje liczbę z przecinkiem jako separatorem dziesiętnym (polska notacja) */
export const fmtL = (n: number, dec: number): string => n.toFixed(dec).replace('.', ',');

/** Formatuje datę w formacie pl-PL, zwraca "—" dla null */
export const fmtDate = (d: string | null): string =>
  d ? new Date(d).toLocaleDateString("pl-PL") : "—";
