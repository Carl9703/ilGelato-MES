/**
 * Karta produkcyjna — wydruk planu turnusu na halę.
 *
 * Odwzorowuje układ arkusza, z którego dotąd korzystała produkcja: blok na każdy
 * smak, wiersz na każde opakowanie i pusta kolumna „waga końcowa" do wpisania
 * długopisem po zważeniu. Każdy blok dostaje wiersze zapasowe, bo z jednego
 * wsadu czasem wychodzi więcej opakowań, niż zaplanowano.
 */
import { downloadPdfFromHtml } from "./printDoc";
import { esc, fmtL, pluralPL } from "./fmt";

export interface WsadDoDruku {
  mnoznik: number;
  opakowanie: string;
  liczba: number;
}

export interface PozycjaDoDruku {
  nazwa: string;
  kg: number;
  wsady: WsadDoDruku[];
}

export interface KartaProdukcjiOptions {
  numer_sesji: string;
  data_produkcji: string;
  typ: string;
  notatki?: string;
  baza_kg: number | null;
  nazwa_bazy: string | null;
  pozycje: PozycjaDoDruku[];
}

/** Ile pustych wierszy dołożyć na końcu bloku smaku. */
const WIERSZE_ZAPASOWE = 2;

const TYP_LABEL: Record<string, string> = {
  lody: "Lody mleczne",
  sorbety: "Sorbety",
  kubeczki: "Kubeczki",
};

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{font-family:'Segoe UI',system-ui,Arial,sans-serif;font-size:11px;color:#000;background:#fff}
@page{size:A4 portrait;margin:12mm 12mm 10mm 12mm}
.top{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px}
.tytul{font-size:20px;font-weight:900;letter-spacing:-.5px;line-height:1}
.podtytul{font-size:10px;color:#555;margin-top:3px}
.ref{text-align:right}
.ref-num{font-family:monospace;font-size:14px;font-weight:700}
.ref-data{font-size:11px;color:#555;margin-top:2px}
hr.thick{border:none;border-top:2.5px solid #000;margin:8px 0 10px}
.baza{border:1.5px solid #000;padding:6px 10px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center}
.baza-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#444}
.baza-wartosc{font-family:monospace;font-size:16px;font-weight:900}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:4px 6px;border-bottom:2px solid #000;font-size:8px;text-transform:uppercase;letter-spacing:.06em;color:#444;white-space:nowrap}
td{padding:5px 6px;font-size:11px;vertical-align:middle}
.blok{border-bottom:1.5px solid #000}
.blok td{border-bottom:1px dotted #bbb}
.blok tr:last-child td{border-bottom:none}
.smak{font-weight:800;font-size:12px}
.mnoznik{font-family:monospace;font-weight:700;font-size:13px;white-space:nowrap}
.opak{white-space:nowrap}
.opak-nr{font-family:monospace;color:#666;margin-right:5px}
.waga{border-bottom:1px solid #999;min-width:70px}
.suma-smaku{font-family:monospace;font-size:9px;color:#666;white-space:nowrap}
.notatki{margin-top:14px;border:1px solid #000;padding:8px 10px}
.notatki-label{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#444;margin-bottom:4px}
.stopka{margin-top:18px;text-align:right;font-size:9px;color:#666}
`;

/** Buduje HTML karty. Wydzielone z `drukujKarteProdukcji`, żeby dało się je sprawdzić poza przeglądarką. */
export function budujKarteHtml(opt: KartaProdukcjiOptions): string {
  const dataTxt = opt.data_produkcji
    ? new Date(opt.data_produkcji).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "—";

  const sumaKg = opt.pozycje.reduce((s, p) => s + p.kg, 0);

  const bloki = opt.pozycje.map((poz) => {
    // Każdy wsad to osobne mrożenie; opakowania numerujemy w obrębie smaku.
    const wiersze: string[] = [];
    let nrOpakowania = 0;

    poz.wsady.forEach((w) => {
      for (let i = 0; i < Math.max(1, w.liczba); i++) {
        nrOpakowania++;
        // Mnożnik pokazujemy tylko przy pierwszym opakowaniu danego wsadu
        const mnoznikTxt = i === 0 ? `×${fmtL(w.mnoznik, w.mnoznik % 1 === 0 ? 0 : 2)}` : "";
        wiersze.push(`<tr>
          <td class="mnoznik">${esc(mnoznikTxt)}</td>
          <td class="smak">${nrOpakowania === 1 ? esc(poz.nazwa) : ""}</td>
          <td class="opak"><span class="opak-nr">${nrOpakowania}</span>${esc(w.opakowanie)}</td>
          <td class="waga"></td>
        </tr>`);
      }
    });

    for (let i = 0; i < WIERSZE_ZAPASOWE; i++) {
      wiersze.push(`<tr>
        <td></td>
        <td>${wiersze.length === 0 && i === 0 ? `<span class="smak">${esc(poz.nazwa)}</span>` : ""}</td>
        <td class="opak"><span class="opak-nr">${nrOpakowania + i + 1}</span>…</td>
        <td class="waga"></td>
      </tr>`);
    }

    return `<tbody class="blok">
      ${wiersze.join("")}
      <tr><td colspan="4" class="suma-smaku">plan: ${fmtL(poz.kg, 3)} kg</td></tr>
    </tbody>`;
  }).join("");

  const html = `<style>${CSS}</style>
<div class="top">
  <div>
    <div class="tytul">Karta produkcyjna</div>
    <div class="podtytul">${esc(TYP_LABEL[opt.typ] ?? opt.typ)} · ${opt.pozycje.length} ${pluralPL(opt.pozycje.length, "smak", "smaki", "smaków")} · ${fmtL(sumaKg, 1)} kg planowanego wyrobu</div>
  </div>
  <div class="ref">
    <div class="ref-num">${esc(opt.numer_sesji)}</div>
    <div class="ref-data">${esc(dataTxt)}</div>
  </div>
</div>
<hr class="thick" />

${opt.baza_kg != null ? `<div class="baza">
  <div>
    <div class="baza-label">Etap 1 — baza do zrobienia</div>
    <div style="font-size:11px;margin-top:2px">${esc(opt.nazwa_bazy ?? "—")}</div>
  </div>
  <div class="baza-wartosc">${fmtL(opt.baza_kg, 1)} kg</div>
</div>` : ""}

<table>
  <thead>
    <tr>
      <th style="width:70px">Wsad</th>
      <th style="width:34%">Smak</th>
      <th>Opakowanie</th>
      <th style="width:110px">Waga końcowa</th>
    </tr>
  </thead>
  ${bloki}
</table>

${opt.notatki?.trim() ? `<div class="notatki">
  <div class="notatki-label">Notatki</div>
  <div>${esc(opt.notatki).replace(/\n/g, "<br/>")}</div>
</div>` : ""}

<div class="stopka">
  Wydrukowano: ${new Date().toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
</div>`;

  return html;
}

export async function drukujKarteProdukcji(opt: KartaProdukcjiOptions) {
  await downloadPdfFromHtml(
    budujKarteHtml(opt),
    `karta-produkcji-${opt.numer_sesji.replace(/\//g, "-")}.pdf`
  );
}
