export const fmtL = (n: number, dec: number): string => n.toFixed(dec).replace('.', ',');

export const fmtDate = (d: string | null): string =>
  d ? new Date(d).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

export const fmtFull = (d: string): string =>
  new Date(d).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function resolveDisplayUnit(asortyment: any, ilosc_raw: number): { ilosc: number; jm: string } {
  const jmGl: string = asortyment?.jednostka_miary || 'kg';
  const przel: number = asortyment?.przelicznik_jednostki ?? 0;
  const jmPom: string | undefined = asortyment?.jednostka_pomocnicza;
  const auxIsKg = jmPom?.toLowerCase() === 'kg' && przel > 0;
  return {
    ilosc: auxIsKg ? Math.round(ilosc_raw * przel * 1000) / 1000 : ilosc_raw,
    jm: (jmGl.toLowerCase() === 'kg' || auxIsKg) ? 'kg' : jmGl,
  };
}
