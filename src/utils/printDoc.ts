import { fmtL, fmtDate as fmt, fmtFull, resolveDisplayUnit } from './fmt';

const docTypeLabel: Record<string, string> = {
  PZ: 'Przyjęcie Zewnętrzne',
  PW: 'Przyjęcie Wewnętrzne',
  WZ: 'Wydanie Zewnętrzne',
  RW: 'Rozchód Wewnętrzny',
};

const num = (v: number | null | undefined, dec = 2) => (v != null ? v.toFixed(dec) : '—');

export function computeVatSummary(docData: any) {
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

export function printDocument(docData: any): void {
  if (!docData) return;

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
      <td class="r mono">${p.cena_jednostkowa != null && p.cena_jednostkowa > 0 ? num(p.cena_jednostkowa, 4) + ' zł' : '—'}</td>
      <td class="r mono total">${p.wartosc != null && p.wartosc > 0 ? num(p.wartosc) + ' zł' : '—'}</td>
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
    : isCostDoc
    ? `<th class="r">${isPZ ? 'Cena jm' : 'Koszt jm'}</th><th class="r">${isPZ ? 'Wartość netto' : 'Wartość'}</th>`
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
  </div>` : isWZ && docData.data_dostawy ? `<div>
    <div class="meta-label">Data dostawy</div>
    <div class="meta-val mono">${fmt(docData.data_dostawy)}</div>
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

export function printSesja(sesja: any): void {
  if (!sesja) return;

  const wyroby: any[] = sesja.wyroby || [];
  const allZp: any[] = sesja.zlecenia || [];

  // Agregat surowców ze wszystkich ZP (z cenami zakupu z kartoteki)
  const surowceMap = new Map<string, { nazwa: string; ilosc: number; jm: string; cena_jm: number; wartosc: number }>();
  allZp.forEach((z: any) => {
    (z.ruchy_magazynowe || []).filter((r: any) => r.typ_ruchu === 'Zuzycie').forEach((r: any) => {
      const k = r.partia?.asortyment?.nazwa || '?';
      const asort = r.partia?.asortyment;
      const ilosc_raw = Math.abs(r.ilosc);
      const { ilosc, jm } = resolveDisplayUnit(asort, ilosc_raw);
      const cena = asort?.cena_zakupu ?? 0;
      if (!surowceMap.has(k)) surowceMap.set(k, { nazwa: k, ilosc: 0, jm, cena_jm: cena, wartosc: 0 });
      const e = surowceMap.get(k)!;
      e.ilosc += ilosc;
      e.wartosc += ilosc_raw * cena;
    });
  });
  
  const bazaNazwa = sesja.baza?.receptura?.asortyment_docelowy?.nazwa;
  const surowce = [...surowceMap.values()]
    .filter(s => s.nazwa !== bazaNazwa)
    .sort((a, b) => b.wartosc - a.wartosc);

  // Pozycje — każde opakowanie jako wiersz
  let lp = 0;
  const tbodyPoz = wyroby.map((w: any) => {
    const przyjecie = (w.ruchy_magazynowe || []).find((r: any) => r.typ_ruchu === 'Przyjecie_Z_Produkcji');
    const nrP = (przyjecie as any)?.partia?.numer_partii || w.numer_partii_wyrobu || '—';
    const nazwa = w.receptura?.asortyment_docelowy?.nazwa || '—';
    const ops: any[] = w.opakowania || [];
    if (ops.length === 0) {
      lp++;
      return `<tr>
        <td class="c lp">${lp}</td>
        <td><b>${nazwa}</b></td>
        <td class="mono small">${nrP}</td>
        <td class="r mono">—</td>
        <td class="r mono">—</td>
      </tr>`;
    }
    return ops.map((op: any) => {
      lp++;
      return `<tr>
        <td class="c lp">${lp}</td>
        <td><b>${nazwa}</b><span class="sub">${op.nazwa}</span></td>
        <td class="mono small">${nrP}</td>
        <td class="r mono b">1 szt.</td>
        <td class="r mono b">${fmtL(op.waga_kg, 3)} kg</td>
      </tr>`;
    }).join('');
  }).join('');

  // Podsumowanie per wyrób
  const sumaMap = new Map<string, { szt: number; kg: number }>();
  wyroby.forEach((w: any) => {
    const key = w.receptura?.asortyment_docelowy?.nazwa || '—';
    if (!sumaMap.has(key)) sumaMap.set(key, { szt: 0, kg: 0 });
    const e = sumaMap.get(key)!;
    const ops: any[] = w.opakowania || [];
    e.szt += ops.length;
    e.kg += ops.reduce((s: number, o: any) => s + (o.waga_kg || 0), 0);
  });
  const totalSzt = [...sumaMap.values()].reduce((s, e) => s + e.szt, 0);
  const totalKg = [...sumaMap.values()].reduce((s, e) => s + e.kg, 0);
  const totalWyk = wyroby.reduce((s: number, w: any) => s + (w.rzeczywista_ilosc_wyrobu || 0), 0);
  const tbodySuma = [...sumaMap.entries()].map(([nazwa, e]) => `
    <tr>
      <td><b>${nazwa}</b></td>
      <td class="r mono">${e.szt > 0 ? `${e.szt} szt.` : '—'}</td>
      <td class="r mono b">${fmtL(e.kg, 3)} kg</td>
    </tr>`).join('') +
    `<tr class="waga-total">
      <td>ŁĄCZNIE</td>
      <td class="r mono">${totalSzt > 0 ? `${totalSzt} szt.` : '—'}</td>
      <td class="r mono">${fmtL(totalKg > 0 ? totalKg : totalWyk, 3)} kg</td>
    </tr>`;

  const totalSurWartosc = surowce.reduce((s, r) => s + r.wartosc, 0);
  const hasCeny = surowce.some(s => s.cena_jm > 0);
  const tbodySur = surowce.map(s =>
    `<tr>
      <td><b>${s.nazwa}</b></td>
      <td class="r mono b">${fmtL(s.ilosc, 3)}</td>
      <td>${s.jm}</td>
      ${hasCeny ? `<td class="r mono">${s.cena_jm > 0 ? s.cena_jm.toFixed(2) + ' zł' : '—'}</td><td class="r mono b">${s.wartosc > 0 ? s.wartosc.toFixed(2) + ' zł' : '—'}</td>` : ''}
    </tr>`
  ).join('') + (hasCeny ? `<tr class="waga-total">
    <td colspan="3">Razem wartość surowców</td>
    <td></td>
    <td class="r mono">${totalSurWartosc.toFixed(2)} zł</td>
  </tr>` : '');

  const bazaInfo = sesja.baza
    ? `<div><div class="meta-label">Baza (E1)</div><div class="meta-val">${sesja.baza.receptura?.asortyment_docelowy?.nazwa}</div><div class="meta-sub mono">${fmtL(sesja.baza.rzeczywista_ilosc_wyrobu || 0, 3)} ${sesja.baza.receptura?.asortyment_docelowy?.jednostka_miary || 'kg'}</div></div>`
    : '<div></div>';

  const html = `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><title>Raport sesji ${sesja.numer_sesji}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{font-family:'Segoe UI',system-ui,Arial,sans-serif;font-size:11px;color:#000;background:#fff}
body{padding:14mm 14mm 12mm}
@page{size:A4 portrait;margin:0}
.doc-top{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px}
.doc-type{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#666;margin-bottom:4px}
.doc-name{font-size:22px;font-weight:900;letter-spacing:-.5px;color:#000;line-height:1}
.doc-org{font-size:10px;color:#666;margin-top:3px}
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
.waga-total td{font-weight:700;border-top:2px solid #000;background:#f0f0f0;font-size:11px}
.sig-row{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:32px;padding-top:12px;border-top:1px solid #ccc}
.sig-box{font-size:10px;color:#666}
.sig-line{border-bottom:1px solid #999;height:28px;margin-top:8px}
</style></head><body>

<div class="doc-top">
  <div>
    <div class="doc-type">Sesja produkcyjna &mdash; Raport</div>
    <div class="doc-name">Raport sesji</div>
    <div class="doc-org">ilGelato MES &middot; Magazyn główny</div>
  </div>
  <div class="doc-ref">
    <div class="doc-ref-num">${sesja.numer_sesji}</div>
    <div class="doc-ref-date">Data: ${new Date(sesja.utworzono_dnia).toLocaleString('pl-PL')}</div>
    ${sesja.data_produkcji ? `<div class="doc-ref-date">Data produkcji: ${fmt(sesja.data_produkcji)}</div>` : ''}
    <div class="doc-ref-date">Status: ${sesja.status}</div>
  </div>
</div>

<hr class="thick">

<div class="meta-grid">
  ${bazaInfo}
  <div>
    <div class="meta-label">Wyroby gotowe</div>
    <div class="meta-val">${wyroby.length} pozycji</div>
  </div>
  <div style="text-align:right">
    <div class="meta-label">Masa całkowita</div>
    <div class="meta-val mono">${fmtL(totalKg > 0 ? totalKg : totalWyk, 3)} kg</div>
  </div>
</div>

<div class="section">Pozycje dokumentu</div>
<table>
  <thead><tr><th>Lp.</th><th>Wyrób / Opakowanie</th><th>Nr partii (PW)</th><th class="r">Ilość</th><th class="r">Masa</th></tr></thead>
  <tbody>${tbodyPoz}</tbody>
</table>

<div class="section">Podsumowanie wg towaru</div>
<table>
  <thead><tr><th>Towar</th><th class="r">Ilość (szt.)</th><th class="r">Masa (kg)</th></tr></thead>
  <tbody>${tbodySuma}</tbody>
</table>

${surowce.length > 0 ? `<div class="section">Zużyte surowce (cała sesja)</div>
<table>
  <thead><tr><th>Surowiec</th><th class="r">Ilość</th><th>J.M.</th>${hasCeny ? '<th class="r">Cena jm</th><th class="r">Wartość</th>' : ''}</tr></thead>
  <tbody>${tbodySur}</tbody>
</table>` : ''}


</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:0';
  document.body.appendChild(iframe);
  const iDoc = iframe.contentDocument!;
  iDoc.open();
  iDoc.write(html);
  iDoc.close();
  const trigger = () => {
    iframe.contentWindow!.focus();
    iframe.contentWindow!.print();
    setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 1000);
  };
  if (iDoc.readyState === 'complete') setTimeout(trigger, 150);
  else iframe.onload = trigger;
}

export function printZP(z: any): void {
  if (!z) return;
  const f = (d: string | null) => d ? new Date(d).toLocaleDateString('pl-PL') : '—';
  const statusLabel: Record<string, string> = { Planowane: 'Planowane', W_toku: 'W toku', Zrealizowane: 'Zrealizowane', Anulowane: 'Anulowane' };
  const nazwaWyrobu = z.receptura?.asortyment_docelowy?.nazwa || '—';
  const kodTowaru = z.receptura?.asortyment_docelowy?.kod_towaru || '—';
  const jm = z.receptura?.asortyment_docelowy?.jednostka_miary || '';
  const nrPartii = z.numer_partii_wyrobu || '—';
  const dniTrwalosci = z.receptura?.dni_trwalosci;
  const dataProd = f(z.utworzono_dnia);
  const terminWaznosci = dniTrwalosci
    ? f(new Date(new Date(z.utworzono_dnia).getTime() + dniTrwalosci * 86400000).toISOString())
    : '—';

  // ── Składniki / zużycie ──
  let tbodySkladniki = '';
  if (z.status === 'Planowane') {
    tbodySkladniki = (z.receptura?.skladniki || []).map((s: any) => {
      const qty = fmtL(s.ilosc_wymagana * z.planowana_ilosc_wyrobu * (1 + (s.procent_strat || 0) / 100), 3);
      const partia = s.sugerowane_partie?.[0]?.numer_partii || '—';
      const jmS = s.czy_pomocnicza ? s.asortyment_skladnika?.jednostka_pomocnicza : s.asortyment_skladnika?.jednostka_miary;
      return `<tr><td class="b">${s.asortyment_skladnika?.nazwa}</td><td class="mono small" style="color:#3b82f6">${partia}</td><td class="r mono b">${qty} <span style="font-weight:400;color:#555">${jmS}</span></td></tr>`;
    }).join('');
  } else if (z.status === 'W_toku') {
    tbodySkladniki = (z.receptura?.skladniki || []).map((s: any) => {
      const rezerwacje = (z.rezerwacje || []).filter((r: any) =>
        (r.id_partii && r.partia?.id_asortymentu === s.asortyment_skladnika?.id) || (r.id_asortymentu === s.asortyment_skladnika?.id)
      );
      const suma = rezerwacje.reduce((acc: number, r: any) => acc + (r.ilosc_zarezerwowana || 0), 0);
      const partia = rezerwacje[0]?.partia?.numer_partii || 'Rez. ilościowa';
      return `<tr><td class="b">${s.asortyment_skladnika?.nazwa}</td><td class="mono small" style="color:#3b82f6">${partia}</td><td class="r mono b">${fmtL(suma, 3)} <span style="font-weight:400;color:#555">${s.asortyment_skladnika?.jednostka_miary}</span></td></tr>`;
    }).join('');
  } else {
    tbodySkladniki = (z.ruchy_magazynowe || []).filter((r: any) => r.typ_ruchu === 'Zuzycie').map((r: any) => {
      const asort = r.partia?.asortyment;
      const { ilosc, jm } = resolveDisplayUnit(asort, Math.abs(r.ilosc));
      return `<tr><td class="b">${asort?.nazwa}</td><td class="mono small" style="color:#3b82f6">${r.partia?.numer_partii}</td><td class="r mono b" style="color:#16a34a">${fmtL(ilosc, 3)} <span style="font-weight:400;color:#555">${jm}</span></td></tr>`;
    }).join('');
  }

  // ── Opakowania ──
  const opakowania: any[] = z.opakowania || [];
  const totalKg = opakowania.reduce((s: number, o: any) => s + o.waga_kg, 0);
  const tbodyOp = opakowania.map((op: any, i: number) => `<tr>
    <td class="c lp">${i + 1}</td>
    <td><span class="b">${nazwaWyrobu}</span><span class="sub">${op.nazwa}</span></td>
    <td class="mono small">${nrPartii}</td>
    <td class="c small">${dataProd}</td>
    <td class="c small">${terminWaznosci}</td>
    <td class="r mono b">1 szt.<span class="sub">${fmtL(op.waga_kg, 3)} kg</span></td>
  </tr>`).join('');
  const opBlock = opakowania.length > 0 ? `
<div class="section">Pakowanie</div>
<table>
  <thead><tr><th>Lp.</th><th>Wyrób / Opakowanie</th><th>Nr partii</th><th class="c">Data prod.</th><th class="c">Termin wazn.</th><th class="r">Ilość</th></tr></thead>
  <tbody>${tbodyOp}</tbody>
</table>
<table class="waga-total" style="margin-top:4px"><tr><td colspan="5" style="padding:6px 7px">Razem masa</td><td class="r mono" style="padding:6px 7px">${fmtL(totalKg, 3)} kg</td></tr></table>
` : '';

  const html = `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><title>${z.numer_zlecenia || 'ZP'}</title>
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
.waga-total td{font-weight:700;border-top:2px solid #000;background:#f0f0f0}
.sig-row{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:32px;padding-top:20px;border-top:1px solid #ccc}
.sig-box{font-size:10px;color:#555}
.sig-line{border-bottom:1px solid #94a3b8;height:28px;margin-top:8px}
.footer{margin-top:12px;padding-top:8px;font-size:9px;color:#94a3b8;border-top:1px solid #e0e0e0;text-align:right}
</style></head><body>

<div class="doc-top">
  <div>
    <div class="doc-type">ZP &mdash; Zlecenie Produkcyjne</div>
    <div class="doc-name">${z.numer_zlecenia || 'ZP-TEMP'}</div>
    <div class="doc-org">ilGelato MES &middot; Produkcja</div>
    <div class="doc-badge">${statusLabel[z.status] || z.status}</div>
  </div>
  <div class="doc-ref">
    <div class="doc-ref-num">${nazwaWyrobu}</div>
    <div class="doc-ref-date">Kod: ${kodTowaru} &middot; Receptura v${z.receptura?.numer_wersji}</div>
    <div class="doc-ref-date">Data: ${dataProd}</div>
  </div>
</div>

<hr class="thick">

<div class="meta-grid">
  <div>
    <div class="meta-label">Plan produkcji</div>
    <div class="meta-val mono">${z.planowana_ilosc_wyrobu} ${jm}</div>
  </div>
  ${z.rzeczywista_ilosc_wyrobu != null ? `<div>
    <div class="meta-label">Wykonano</div>
    <div class="meta-val mono" style="color:#16a34a">${z.rzeczywista_ilosc_wyrobu} ${jm}</div>
  </div>` : `<div>
    <div class="meta-label">Partia wyrobu</div>
    <div class="meta-val mono">${nrPartii}</div>
  </div>`}
  <div style="text-align:right">
    <div class="meta-label">Termin ważności</div>
    <div class="meta-val mono">${terminWaznosci}</div>
  </div>
</div>

<div class="section">Zapotrzebowanie materiałowe</div>
<table>
  <thead><tr><th>Surowiec</th><th>Nr partii (FEFO)</th><th class="r">Ilość</th></tr></thead>
  <tbody>${tbodySkladniki}</tbody>
</table>

${opBlock}

<div class="sig-row">
  <div class="sig-box"><div>Sporządził</div><div class="sig-line"></div></div>
  <div class="sig-box"><div>Zatwierdził</div><div class="sig-line"></div></div>
</div>
<div class="footer">Wydrukowano z systemu ilGelato MES &middot; ${new Date().toLocaleString('pl-PL')}</div>

</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:0';
  document.body.appendChild(iframe);
  const iDoc = iframe.contentDocument!;
  iDoc.open();
  iDoc.write(html);
  iDoc.close();
  const trigger = () => {
    iframe.contentWindow!.focus();
    iframe.contentWindow!.print();
    setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 1000);
  };
  if (iDoc.readyState === 'complete') setTimeout(trigger, 150);
  else iframe.onload = trigger;
}
