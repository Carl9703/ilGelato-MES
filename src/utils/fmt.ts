export const fmtL = (n: number, dec: number): string => n.toFixed(dec).replace('.', ',');

export const esc = (s: string | null | undefined): string => {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

export const round2 = (v: number): number => Math.round(v * 100) / 100;
export const round3 = (v: number): number => Math.round(v * 1000) / 1000;

export const clampDecimals = (val: string, maxDecimals: number): string => {
  if (!val) return val;
  const parts = val.split(/[.,]/);
  if (parts.length > 1) {
    if (parts[1].length > maxDecimals) {
      return `${parts[0]}.${parts[1].slice(0, maxDecimals)}`;
    }
  }
  return val;
};

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
