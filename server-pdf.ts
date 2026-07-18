import puppeteer from 'puppeteer';
import os from 'os';
import path from 'path';
import { writeFileSync, unlinkSync } from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

// Helper functions
const fmtL = (n: number, dec: number): string => n.toFixed(dec).replace('.', ',');

const fmtDate = (d: string | null): string =>
  d ? new Date(d).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

const fmtFull = (d: string): string =>
  new Date(d).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function resolveDisplayUnit(asortyment: any, ilosc_raw: number): { ilosc: number; jm: string } {
  const jmGl: string = asortyment?.jednostka_miary || 'kg';
  const przel: number = asortyment?.przelicznik_jednostki ?? 0;
  const jmPom: string | undefined = asortyment?.jednostka_pomocnicza;
  const auxIsKg = jmPom?.toLowerCase() === 'kg' && przel > 0;
  return {
    ilosc: auxIsKg ? Math.round(ilosc_raw * przel * 1000) / 1000 : ilosc_raw,
    jm: (jmGl.toLowerCase() === 'kg' || auxIsKg) ? 'kg' : jmGl,
  };
}

const num = (v: number | null | undefined, dec = 2) => (v != null ? v.toFixed(dec) : '—');

const docTypeLabel: Record<string, string> = {
  PZ: 'Przyjęcie Zewnętrzne',
  PW: 'Przyjęcie Wewnętrzne',
  WZ: 'Wydanie Zewnętrzne',
  RW: 'Rozchód Wewnętrzny',
};

// Compute VAT summary
function computeVatSummary(docData: any) {
  const pozycje: any[] = docData?.pozycje || [];
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

// Generate document HTML
export function generateDocumentHTML(docData: any): string {
  if (!docData) return '';

  const pozycje: any[] = docData.pozycje || [];
  const isWZ = docData.typ === 'WZ';
  const isPW = docData.typ === 'PW';
  const isRW = docData.typ === 'RW';
  const isPZ = docData.typ === 'PZ';
  const isCostDoc = isPW || isRW || isPZ;
  const hasOp = pozycje.some((p: any) => p.wyrob);
  const vatSummary = isWZ ? computeVatSummary(docData) : null;

  const tbody = pozycje.map((p: any, i: number) => {
    const pricecols = isWZ ? `
      <td class="r mono">${num(p.cena_netto)} zł</td>
      <td class="r mono vat-rate">${p.stawka_vat != null ? p.stawka_vat + '%' : '—'}</td>
      <td class="r mono brutto">${num(p.cena_brutto)} zł</td>
      <td class="r mono">${num(p.wartosc_netto)} zł</td>
      <td class="r mono total">${num(p.wartosc_brutto)} zł</td>
    ` : isCostDoc ? `
      <td class="r mono">${p.cena_jednostkowa != null && p.cena_jednostkowa > 0 ? num(p.cena_jednostkowa) + ' zł' : '—'}</td>
      <td class="r mono total">${p.wartosc != null && p.wartosc > 0 ? num(p.wartosc) + ' zł' : '—'}</td>
    ` : '';
    const kgVal = p.ilosc_kg != null ? p.ilosc_kg : (p.jednostka === 'kg' ? p.ilosc : null);
    let kgColStr = kgVal != null ? fmtL(kgVal, 3) + ' kg' : (p.jednostka !== 'kg' ? '' : '—');
    if (isWZ && p.jednostka !== 'kg') {
       const qtyStr = `${fmtL(p.ilosc, p.jednostka === 'szt.' ? 0 : 3)} ${p.jednostka}`;
       kgColStr = kgVal != null ? `${kgColStr}<br><span class="sub" style="font-size:0.85em;color:#6b7280;">(${qtyStr})</span>` : qtyStr;
    }
    const kgCol = isWZ ? `<td class="r mono b">${kgColStr}</td>` : '';
    const iloscKg = (!isWZ && p.ilosc_kg != null) ? `<span class="sub">${fmtL(p.ilosc_kg, 3)} kg</span>` : '';
    const stdIloscCol = !isWZ ? `<td class="r mono b">${fmtL(p.ilosc, p.jednostka === 'szt.' ? 0 : 3)} ${p.jednostka}${iloscKg}</td>` : '';

    if (hasOp) {
      return `<tr>
        <td class="c lp">${i + 1}</td>
        <td><b>${p.wyrob || p.asortyment}</b>${p.wyrob ? `<span class="sub">${p.asortyment}</span>` : ''}</td>
        <td class="mono small">${p.numer_partii}</td>
        ${stdIloscCol}
        ${kgCol}
        ${pricecols}
      </tr>`;
    }
    return `<tr>
      <td class="c lp">${i + 1}</td>
      <td class="mono small">${p.kod_towaru || ''}</td>
      <td><b>${p.asortyment}</b></td>
      <td class="mono small">${p.numer_partii}</td>
      ${stdIloscCol}
      ${kgCol}
      ${pricecols}
    </tr>`;
  }).join('');

  const kgHeader = isWZ ? '<th class="r">Ilość / Waga</th>' : '';
  const stdIloscHeader = !isWZ ? '<th class="r">Ilość</th>' : '';
  const priceHeaders = isWZ
    ? '<th class="r">Cena netto</th><th class="r">VAT</th><th class="r">Cena brutto</th><th class="r">Wartość netto</th><th class="r">Wartość brutto</th>'
    : isCostDoc
    ? `<th class="r">${isPZ ? 'Cena jm' : 'Koszt jm'}</th><th class="r">${isPZ ? 'Wartość netto' : 'Wartość'}</th>`
    : '';
  const thead = hasOp
    ? `<tr><th>Lp.</th><th>Wyrób / Opakowanie</th><th>Nr partii</th>${stdIloscHeader}${kgHeader}${priceHeaders}</tr>`
    : `<tr><th>Lp.</th><th>Kod</th><th>Towar</th><th>Nr partii</th>${stdIloscHeader}${kgHeader}${priceHeaders}</tr>`;

  const sumaMap: Record<string, number> = {};
  pozycje.forEach((p: any) => {
    const key = p.wyrob || p.asortyment;
    const kg = p.ilosc_kg ?? (p.jednostka === 'kg' ? p.ilosc : 0);
    if (kg > 0) sumaMap[key] = (sumaMap[key] || 0) + kg;
  });
  const wagaRows = Object.entries(sumaMap)
    .map(([n, kg]) => `<tr><td>${n}</td><td class="r mono b">${fmtL(kg, 3)} kg</td></tr>`)
    .join('');
  const totalKg = Object.values(sumaMap).reduce((s, v) => s + v, 0);

  let costBlock = '';
  if (isCostDoc) {
    const totalWartosc = pozycje.reduce((s: number, p: any) => s + (p.wartosc || 0), 0);
    if (totalWartosc > 0) {
      if (isPZ) {
        costBlock = `<div class="vat-wrap"><div class="vat-box">
        <div class="vat-title">Wartość dokumentu (netto)</div>
        <table class="vat-tbl"><tbody>
        <tr class="tot"><td class="b">ŁĄCZNIE</td><td class="r mono b">${totalWartosc.toFixed(2)} zł</td></tr>
        </tbody></table>
      </div></div>`;
      } else {
        costBlock = `<div class="vat-wrap"><div class="vat-box">
        <div class="vat-title">Wartość kosztów produkcji</div>
        <table class="vat-tbl"><thead><tr><th>Pozycja</th><th class="r">Wartość</th></tr></thead>
        <tbody>${pozycje.filter((p: any) => p.wartosc > 0).map((p: any) => `<tr><td>${p.wyrob || p.asortyment}</td><td class="r mono">${num(p.wartosc)} zł</td></tr>`).join('')}
        <tr class="tot"><td class="b">ŁĄCZNIE</td><td class="r mono b">${totalWartosc.toFixed(2)} zł</td></tr>
        </tbody></table>
      </div></div>`;
      }
    }
  }

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

  const statusLabel = docData.status === 'Zatwierdzony' ? 'ZATWIERDZONY' : docData.status === 'Faktura wystawiona' ? 'FAKTURA WYSTAWIONA' : docData.status === 'Anulowany' ? 'ANULOWANY' : 'BUFOR';

  return `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><title>${docData.referencja}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{font-family:'Segoe UI',system-ui,Arial,sans-serif;font-size:12px;color:#000;background:#fff}
body{padding:0}
@page{size:A4 portrait;margin:14mm 14mm 12mm 14mm}

.doc-top{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px}
.doc-type{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#666;margin-bottom:4px}
.doc-name{font-size:24px;font-weight:900;letter-spacing:-.5px;color:#000;line-height:1.1}
.doc-org{font-size:11px;color:#666;margin-top:4px}
.doc-badge{display:inline-block;padding:4px 12px;border-radius:4px;font-size:10px;font-weight:800;letter-spacing:.06em;background:#eee;color:#333;margin-top:8px}
.doc-ref{text-align:right}
.doc-ref-num{font-family:monospace;font-size:20px;font-weight:900;color:#000}
.doc-ref-date{font-size:11px;color:#555;margin-top:4px}

hr.thick{border:none;border-top:3px solid #000;margin:12px 0 16px}

.meta-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding:14px 0;border-bottom:1.5px solid #ccc;margin-bottom:18px}
.meta-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#666;margin-bottom:4px}
.meta-val{font-size:14px;font-weight:700;color:#000}
.meta-val.mono{font-family:monospace}
.meta-sub{font-size:11px;color:#444;margin-top:3px}

.section{display:flex;align-items:center;gap:8px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#666;margin:20px 0 10px;page-break-after:avoid}
.section::after{content:'';flex:1;height:1.5px;background:#ccc}

table{width:100%;border-collapse:collapse;page-break-inside:avoid}
th{text-align:left;padding:6px 8px;border-bottom:2.5px solid #000;font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#444;white-space:nowrap;background:#f8f8f8;page-break-after:avoid}
td{padding:7px 8px;border-bottom:1px solid #e0e0e0;vertical-align:top;font-size:12px}
tbody tr:last-child td{border-bottom:none}
.r{text-align:right}.c{text-align:center}
.b{font-weight:700}.mono{font-family:'Courier New',monospace;font-size:12px}
.small{font-size:11px}.lp{color:#888;font-size:11px;width:32px}
.sub{display:block;font-size:10px;color:#555;margin-top:2px}
.vat-rate{font-weight:600}.brutto{font-weight:600}.total{font-weight:700}
.waga-total td{font-weight:700;border-top:2.5px solid #000;background:#f0f0f0;font-size:12px;page-break-before:avoid}

.vat-wrap{display:flex;justify-content:flex-end;margin-top:18px;page-break-inside:avoid}
.vat-box{border:1.5px solid #ccc;border-radius:6px;overflow:hidden;min-width:380px}
.vat-title{background:#f0f0f0;padding:6px 14px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#444;border-bottom:1.5px solid #ccc}
.vat-tbl th{border-bottom:1.5px solid #ccc;padding:6px 12px;font-size:9px;background:#f0f0f0;font-weight:600}
.vat-tbl td{border-bottom:1px solid#e0e0e0;padding:6px 12px;font-size:12px}
.vat-tbl .tot{background:#e8e8e8;border-top:2.5px solid #aaa}
.orange{color:#d97706}

@media print {
  body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  table { page-break-inside: auto }
  tr { page-break-inside: avoid; page-break-after: auto }
  thead { display: table-header-group }
}
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
    <div class="meta-val mono" style="font-size:14px">${docData.numer_zlecenia}</div>
  </div>` : isWZ && docData.data_dostawy ? `<div>
    <div class="meta-label">Data dostawy</div>
    <div class="meta-val mono">${fmtDate(docData.data_dostawy)}</div>
  </div>` : '<div></div>'}
  <div style="text-align:right">
    <div class="meta-label">Status</div>
    <div class="meta-val">${statusLabel}</div>
  </div>
</div>

<div class="section">Pozycje dokumentu</div>
<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>

${isWZ && totalKg > 0 ? `
<div class="section">Podsumowanie wagi</div>
<table><tbody>
  ${wagaRows}
  <tr class="waga-total"><td>Masa całkowita dokumentu</td><td class="r mono">${fmtL(totalKg, 3)} kg</td></tr>
</tbody></table>` : ''}

${costBlock}
${vatBlock}

</body></html>`;
}

export async function generatePDF(html: string): Promise<Buffer> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const workerPath = path.join(__dirname, 'pdf-worker.mjs');

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    child.stdout.on('data', (d: Buffer) => chunks.push(d));
    child.stderr.on('data', (d: Buffer) => errChunks.push(d));

    child.on('close', (code: number) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        const errMsg = Buffer.concat(errChunks).toString();
        reject(new Error(`PDF worker failed (code ${code}): ${errMsg}`));
      }
    });

    child.on('error', (err: Error) => reject(err));

    // Wyślij HTML do workera przez stdin
    child.stdin.write(html, 'utf-8');
    child.stdin.end();
  });
}
