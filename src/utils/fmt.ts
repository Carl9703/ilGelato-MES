export const fmtL = (n: number, dec: number): string => n.toFixed(dec).replace('.', ',');

export const fmtDate = (d: string | null): string =>
  d ? new Date(d).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

export const fmtFull = (d: string): string =>
  new Date(d).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
