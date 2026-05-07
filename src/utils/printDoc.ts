import { fmtL } from './fmt';

const docTypeLabel: Record<string, string> = {
  PZ: 'Przyjęcie Zewnętrzne',
  PW: 'Przyjęcie Wewnętrzne',
  WZ: 'Wydanie Zewnętrzne',
  RW: 'Rozchód Wewnętrzny',
};

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const fmtFull = (d: string) =>
  new Date(d).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const num = (v: number | null | undefined, dec = 2) => (v != null ? v.toFixed(dec) : '—');

function computeVatSummary(docData: any) {
  const pozycje: any[] = docData.pozycje || [];
  let totalNetto = 0, totalVat = 0, totalBrutto = 0;
  const groups: Record<string, { netto: number; vat: number; brutto: number }> = {};
  let hasAnyPrices = false;
  for (const p of pozycje) {
    if (p.wartosc_netto == null || p.wartosc_brutto == null) continue;
    hasAnyPrices = true;
    const netto = p.wartosc_netto;
    const brutto = p.wartosc_brutto;
    const vatKwota = brutto - netto;
    totalNetto += netto; totalVat += vatKwota; totalBrutto += brutto;
    const key = p.stawka_vat != null ? String(p.stawka_vat) : '?';
    if (!groups[key]) groups[key] = { netto: 0, vat: 0, brutto: 0 };
    groups[key].netto += netto;
    groups[key].vat += vatKwota;
    groups[key].brutto += brutto;
  }
  if (!hasAnyPrices) return null;
  return { totalNetto, totalVat, totalBrutto, groups };
}

export function printDocument(docData: any): void {
  if (!docData) return;

  const pozycje: any[] = docData.pozycje || [];
  const isWZ = docData.typ === 'WZ';
  const hasOp = pozycje.some((p: any) => p.wyrob);
  const vatSummary = isWZ ? computeVatSummary(docData) : null;

  const tbody = pozycje.map((p: any, i: number) => {
    const pricecols = isWZ ? `
      <td class="r mono">${num(p.cena_netto)} zł</td>
      <td class="r mono vat-rate">${p.stawka_vat != null ? p.stawka_vat + '%' : '—'}</td>
      <td class="r mono brutto">${num(p.cena_brutto)} zł</td>
      <td class="r mono">${num(p.wartosc_netto)} zł</td>
      <td class="r mono total">${num(p.wartosc_brutto)} zł</td>
    ` : '';
    const iloscKg = p.ilosc_kg != null ? `<span class="sub">${fmtL(p.ilosc_kg, 3)} kg</span>` : '';
    if (hasOp) {
      return `<tr>
        <td class="c lp">${i + 1}</td>
        <td><b>${p.wyrob || p.asortyment}</b>${p.wyrob ? `<span class="sub">${p.asortyment}</span>` : ''}</td>
        <td class="mono small">${p.numer_partii}</td>
        <td class="r mono b">${fmtL(p.ilosc, p.jednostka === 'szt.' ? 0 : 3)} ${p.jednostka}${iloscKg}</td>
        ${pricecols}
      </tr>`;
    }
    return `<tr>
      <td class="c lp">${i + 1}</td>
      <td class="mono small">${p.kod_towaru || ''}</td>
      <td><b>${p.asortyment}</b></td>
      <td class="mono small">${p.numer_partii}</td>
      <td class="r mono b">${fmtL(p.ilosc, 3)} ${p.jednostka}</td>
      ${pricecols}
    </tr>`;
  }).join('');

  const priceHeaders = isWZ
    ? '<th class="r">Cena netto</th><th class="r">VAT</th><th class="r">Cena brutto</th><th class="r">Wartość netto</th><th class="r">Wartość brutto</th>'
    : '';
  const thead = hasOp
    ? `<tr><th>Lp.</th><th>Wyrób / Opakowanie</th><th>Nr partii</th><th class="r">Ilość</th>${priceHeaders}</tr>`
    : `<tr><th>Lp.</th><th>Kod</th><th>Towar</th><th>Nr partii</th><th class="r">Ilość</th>${priceHeaders}</tr>`;

  const sumaMap: Record<string, number> = {};
  pozycje.forEach((p: any) => {
    const key = p.wyrob || p.asortyment;
    sumaMap[key] = (sumaMap[key] || 0) + (p.ilosc_kg ?? (p.jednostka === 'kg' ? p.ilosc : 0));
  });
  const wagaRows = Object.entries(sumaMap)
    .map(([n, kg]) => `<tr><td>${n}</td><td class="r mono b">${fmtL(kg, 3)} kg</td></tr>`)
    .join('');
  const totalKg = Object.values(sumaMap).reduce((s, v) => s + v, 0);

  let vatBlock = '';
  if (isWZ && vatSummary) {
    const gRows = (Object.entries(vatSummary.groups) as [string, { netto: number; vat: number; brutto: number }][])
      .sort(([a], [b]) => parseFloat(a) - parseFloat(b))
      .map(([rate, g]) => `<tr>
        <td class="mono b">${rate}%</td>
        <td class="r mono">${g.netto.toFixed(2)} zł</td>
        <td class="r mono orange">${g.vat.toFixed(2)} zł</td>
        <td class="r mono b orange">${g.brutto.toFixed(2)} zł</td>
      </tr>`).join('');
    const totRow = Object.keys(vatSummary.groups).length > 1
      ? `<tr class="tot"><td class="b">ŁĄCZNIE</td><td class="r mono b">${vatSummary.totalNetto.toFixed(2)} zł</td><td class="r mono b orange">${vatSummary.totalVat.toFixed(2)} zł</td><td class="r mono b orange">${vatSummary.totalBrutto.toFixed(2)} zł</td></tr>`
      : '';
    vatBlock = `<div class="vat-wrap"><div class="vat-box">
      <div class="vat-title">Rozliczenie VAT</div>
      <table class="vat-tbl"><thead><tr><th>Stawka</th><th class="r">Podstawa netto</th><th class="r">Kwota VAT</th><th class="r">Wartość brutto</th></tr></thead>
      <tbody>${gRows}${totRow}</tbody></table>
    </div></div>`;
  }

  const statusLabel = docData.status === 'Zatwierdzony' ? 'ZATWIERDZONY' : docData.status === 'Anulowany' ? 'ANULOWANY' : 'BUFOR';

  const html = `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><title>${docData.referencja}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{font-family:'Segoe UI',system-ui,Arial,sans-serif;font-size:11px;color:#000;background:#fff}
body{padding:14mm 14mm 12mm}
@page{size:A4 portrait;margin:0}

.doc-top{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px}
.doc-type{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#666;margin-bottom:4px}
.doc-name{font-size:22px;font-weight:900;letter-spacing:-.5px;color:#000;line-height:1}
.doc-org{font-size:10px;color:#666;margin-top:3px}
.doc-badge{display:inline-block;padding:3px 10px;border-radius:4px;font-size:9px;font-weight:800;letter-spacing:.06em;background:#eee;color:#333;margin-top:6px}
.doc-ref{text-align:right}
.doc-ref-num{font-family:monospace;font-size:18px;font-weight:900;color:#000}
.doc-ref-date{font-size:10px;color:#555;margin-top:4px}

hr.thick{border:none;border-top:2.5px solid #000;margin:10px 0 14px}

.meta-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:12px 0;border-bottom:1px solid #ccc;margin-bottom:16px}
.meta-label{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#666;margin-bottom:3px}
.meta-val{font-size:13px;font-weight:700;color:#000}
.meta-val.mono{font-family:monospace}
.meta-sub{font-size:10px;color:#444;margin-top:2px}

.section{display:flex;align-items:center;gap:6px;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#666;margin:16px 0 8px}
.section::after{content:'';flex:1;height:1px;background:#ccc}

table{width:100%;border-collapse:collapse}
th{text-align:left;padding:5px 7px;border-bottom:2px solid #000;font-size:8px;text-transform:uppercase;letter-spacing:.06em;color:#444;white-space:nowrap}
td{padding:6px 7px;border-bottom:1px solid #e0e0e0;vertical-align:top;font-size:11px}
tbody tr:last-child td{border-bottom:none}
.r{text-align:right}.c{text-align:center}
.b{font-weight:700}.mono{font-family:monospace;font-size:11px}
.small{font-size:10px}.lp{color:#888;font-size:10px;width:28px}
.sub{display:block;font-size:9px;color:#555;margin-top:1px}
.vat-rate{font-weight:600}.brutto{font-weight:600}.total{font-weight:700}
.waga-total td{font-weight:700;border-top:2px solid #000;background:#f0f0f0;font-size:11px}

.vat-wrap{display:flex;justify-content:flex-end;margin-top:16px}
.vat-box{border:1px solid #ccc;border-radius:6px;overflow:hidden;min-width:360px}
.vat-title{background:#f0f0f0;padding:5px 12px;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#444;border-bottom:1px solid #ccc}
.vat-tbl th{border-bottom:1px solid #ccc;padding:5px 10px;font-size:8px;background:#f0f0f0;font-weight:600}
.vat-tbl td{border-bottom:1px solid #e0e0e0;padding:5px 10px;font-size:11px}
.vat-tbl .tot{background:#e8e8e8;border-top:2px solid #aaa}
.orange{}
</style></head><body>

<div class="doc-top">
  <div>
    <div class="doc-type">${docData.typ} &mdash; Dokument magazynowy</div>
    <div class="doc-name">${docTypeLabel[docData.typ] ?? docData.typ}</div>
    <div class="doc-org">ilGelato MES &middot; Magazyn główny</div>
  </div>
  <div class="doc-ref">
    <div class="doc-ref-num">${docData.referencja}</div>
    <div class="doc-ref-date">Wystawiono: ${fmtFull(docData.data)}</div>
    <div class="doc-ref-date">Wystawił: ${docData.uzytkownik}</div>
    ${docData.data_zatwierdzenia ? `<div class="doc-ref-date">Zatwierdzono: ${fmtFull(docData.data_zatwierdzenia)}</div>` : ''}
  </div>
</div>

<hr class="thick">

<div class="meta-grid">
  ${docData.kontrahent ? `<div>
    <div class="meta-label">${docData.typ === 'WZ' ? 'Odbiorca' : 'Dostawca'}</div>
    <div class="meta-val">${docData.kontrahent.nazwa}</div>
    <div class="meta-sub mono">${docData.kontrahent.kod}</div>
  </div>` : '<div></div>'}
  ${docData.numer_zlecenia ? `<div>
    <div class="meta-label">Zlecenie produkcyjne</div>
    <div class="meta-val mono" style="font-size:13px">${docData.numer_zlecenia}</div>
  </div>` : '<div></div>'}
  <div style="text-align:right">
    <div class="meta-label">Status</div>
    <div class="meta-val">${statusLabel}</div>
  </div>
</div>

<div class="section">Pozycje dokumentu</div>
<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>

${totalKg > 0 ? `
<div class="section">Podsumowanie wagi</div>
<table><tbody>
  ${wagaRows}
  <tr class="waga-total"><td>Masa całkowita dokumentu</td><td class="r mono">${fmtL(totalKg, 3)} kg</td></tr>
</tbody></table>` : ''}

${vatBlock}

</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:0';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  const trigger = () => {
    iframe.contentWindow!.focus();
    iframe.contentWindow!.print();
    setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 1000);
  };
  if (doc.readyState === 'complete') setTimeout(trigger, 150);
  else iframe.onload = trigger;
}
