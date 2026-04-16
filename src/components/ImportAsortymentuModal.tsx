import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { X, Upload, FileSpreadsheet, Trash2, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

// ─── typy ─────────────────────────────────────────────────────────────────────

const TYPY_ASORTYMENTU = ["Surowiec", "Polprodukt", "Wyrob_Gotowy", "Opakowanie"] as const;
const UNITS = ["kg", "L", "szt", "ml", "g", "opak"] as const;

interface ImportRow {
  _idx: number;
  kod_towaru: string;
  nazwa: string;
  typ_asortymentu: string;
  jednostka_miary: string;
  jednostka_pomocnicza: string;
  przelicznik_jednostki: string;
  czy_wymaga_daty_waznosci: boolean;
  czy_zasob_nieograniczony: boolean;
  producent: string;
  zrodlo_danych: string;
  _errors: string[];
}

interface ImportResult {
  kod_towaru: string;
  success: boolean;
  error?: string;
}

interface Props {
  onClose: () => void;
  onImported: () => void;
}

// ─── mapowanie nagłówków Excel → pola ────────────────────────────────────────

const HEADER_MAP: Record<string, keyof ImportRow> = {
  "kod towaru":              "kod_towaru",
  "kod_towaru":              "kod_towaru",
  "nazwa":                   "nazwa",
  "typ":                     "typ_asortymentu",
  "typ asortymentu":         "typ_asortymentu",
  "typ_asortymentu":         "typ_asortymentu",
  "jednostka miary":         "jednostka_miary",
  "jednostka_miary":         "jednostka_miary",
  "jm":                      "jednostka_miary",
  "jednostka pomocnicza":    "jednostka_pomocnicza",
  "jednostka_pomocnicza":    "jednostka_pomocnicza",
  "jm pomocnicza":           "jednostka_pomocnicza",
  "przelicznik":             "przelicznik_jednostki",
  "przelicznik_jednostki":   "przelicznik_jednostki",
  "wymaga daty waznosci":    "czy_wymaga_daty_waznosci",
  "czy_wymaga_daty_waznosci":"czy_wymaga_daty_waznosci",
  "zasob nieograniczony":    "czy_zasob_nieograniczony",
  "czy_zasob_nieograniczony":"czy_zasob_nieograniczony",
  "producent":               "producent",
  "zrodlo danych":           "zrodlo_danych",
  "zrodlo_danych":           "zrodlo_danych",
  "źródło danych":           "zrodlo_danych",
};

function parseBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "tak" || s === "true" || s === "1" || s === "yes";
}

function validateRow(row: ImportRow): string[] {
  const errors: string[] = [];
  if (!row.kod_towaru.trim()) errors.push("Brak kodu towaru");
  if (!row.nazwa.trim()) errors.push("Brak nazwy");
  if (!(TYPY_ASORTYMENTU as readonly string[]).includes(row.typ_asortymentu))
    errors.push(`Nieprawidłowy typ: "${row.typ_asortymentu}" (oczekiwano: ${TYPY_ASORTYMENTU.join(", ")})`);
  if (!(UNITS as readonly string[]).includes(row.jednostka_miary))
    errors.push(`Nieznana JM: "${row.jednostka_miary}" (oczekiwano: ${UNITS.join(", ")})`);
  if (row.przelicznik_jednostki && isNaN(parseFloat(row.przelicznik_jednostki.replace(",", "."))))
    errors.push("Przelicznik musi być liczbą");
  return errors;
}

function parseSheet(wb: XLSX.WorkBook): ImportRow[] {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

  return raw.map((r, idx) => {
    const mapped: Partial<ImportRow> = { _idx: idx };
    for (const [key, val] of Object.entries(r)) {
      const field = HEADER_MAP[key.trim().toLowerCase()];
      if (!field || field.startsWith("_")) continue;
      (mapped as Record<string, unknown>)[field] = val;
    }
    const row: ImportRow = {
      _idx: idx,
      kod_towaru:              String(mapped.kod_towaru              ?? "").trim(),
      nazwa:                   String(mapped.nazwa                   ?? "").trim(),
      typ_asortymentu:         String(mapped.typ_asortymentu         ?? "Surowiec").trim(),
      jednostka_miary:         String(mapped.jednostka_miary         ?? "kg").trim(),
      jednostka_pomocnicza:    String(mapped.jednostka_pomocnicza    ?? "").trim(),
      przelicznik_jednostki:   String(mapped.przelicznik_jednostki   ?? "").trim(),
      czy_wymaga_daty_waznosci: parseBool(mapped.czy_wymaga_daty_waznosci),
      czy_zasob_nieograniczony: parseBool(mapped.czy_zasob_nieograniczony),
      producent:               String(mapped.producent               ?? "").trim(),
      zrodlo_danych:           String(mapped.zrodlo_danych           ?? "").trim(),
      _errors: [],
    };
    row._errors = validateRow(row);
    return row;
  });
}

// ─── komponent ────────────────────────────────────────────────────────────────

const typLabels: Record<string, string> = {
  Surowiec: "Surowiec", Polprodukt: "Półprodukt",
  Wyrob_Gotowy: "Wyrób gotowy", Opakowanie: "Opakowanie",
};

export default function ImportAsortymentuModal({ onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  // ── wczytanie pliku ──────────────────────────────────────────────────────────
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResults(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = ev.target?.result;
      const wb = XLSX.read(data, { type: "binary" });
      const parsed = parseSheet(wb);
      setRows(parsed);
    };
    reader.readAsBinaryString(file);
    // reset input so the same file can be re-loaded
    e.target.value = "";
  };

  // ── edycja komórki ───────────────────────────────────────────────────────────
  const updateRow = <K extends keyof ImportRow>(idx: number, field: K, value: ImportRow[K]) => {
    setRows(prev => prev.map(r => {
      if (r._idx !== idx) return r;
      const updated = { ...r, [field]: value };
      updated._errors = validateRow(updated);
      return updated;
    }));
  };

  const removeRow = (idx: number) => setRows(prev => prev.filter(r => r._idx !== idx));

  // ── import ───────────────────────────────────────────────────────────────────
  const validRows = rows.filter(r => r._errors.length === 0);
  const errorCount = rows.length - validRows.length;

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setLoading(true);
    try {
      const payload = validRows.map(r => ({
        kod_towaru:               r.kod_towaru,
        nazwa:                    r.nazwa,
        typ_asortymentu:          r.typ_asortymentu,
        jednostka_miary:          r.jednostka_miary,
        jednostka_pomocnicza:     r.jednostka_pomocnicza  || null,
        przelicznik_jednostki:    r.przelicznik_jednostki || null,
        czy_wymaga_daty_waznosci: r.czy_wymaga_daty_waznosci,
        czy_zasob_nieograniczony: r.czy_zasob_nieograniczony,
        producent:                r.producent    || null,
        zrodlo_danych:            r.zrodlo_danych || null,
      }));
      const resp = await fetch("/api/asortyment/import-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` },
        body: JSON.stringify({ rows: payload }),
      });
      const data: ImportResult[] = await resp.json();
      setResults(data);
      const anyOk = data.some(d => d.success);
      if (anyOk) onImported();
    } finally {
      setLoading(false);
    }
  };

  // ── wynik importu ────────────────────────────────────────────────────────────
  if (results) {
    const ok  = results.filter(r => r.success);
    const err = results.filter(r => !r.success);
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="bg-[var(--bg-panel)] border border-[var(--border)] rounded-2xl w-full max-w-lg shadow-2xl p-6 flex flex-col gap-4">
          <h2 className="text-lg font-bold text-white">Wynik importu</h2>
          <div className="flex gap-4">
            <div className="flex items-center gap-2 text-emerald-400"><CheckCircle2 className="w-5 h-5" /><span className="font-bold text-xl">{ok.length}</span><span className="text-sm">zaimportowanych</span></div>
            {err.length > 0 && <div className="flex items-center gap-2 text-red-400"><AlertCircle className="w-5 h-5" /><span className="font-bold text-xl">{err.length}</span><span className="text-sm">błędów</span></div>}
          </div>
          {err.length > 0 && (
            <div className="bg-red-950/40 border border-red-800/40 rounded-xl p-3 text-sm max-h-48 overflow-y-auto space-y-1">
              {err.map((r, i) => <div key={i} className="text-red-300"><span className="font-mono font-bold">{r.kod_towaru}</span> — {r.error}</div>)}
            </div>
          )}
          <button onClick={onClose} className="mt-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm">Zamknij</button>
        </div>
      </div>
    );
  }

  // ── główny widok ─────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[var(--bg-panel)] border border-[var(--border)] rounded-2xl w-full max-w-6xl max-h-[90vh] shadow-2xl flex flex-col">

        {/* nagłówek */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-base font-bold text-white">Import asortymentu z Excel</h2>
              {fileName && <p className="text-xs text-slate-400 mt-0.5">{fileName}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {/* treść */}
        <div className="flex-1 overflow-y-auto p-6">
          {rows.length === 0 ? (
            /* strefa upuszczania / wyboru pliku */
            <div className="flex flex-col gap-4">
              <div
                className="border-2 border-dashed border-[var(--border)] rounded-2xl flex flex-col items-center justify-center gap-4 p-12 cursor-pointer hover:border-blue-500 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="w-10 h-10 text-slate-500" />
                <div className="text-center">
                  <p className="text-white font-semibold">Kliknij, aby wybrać plik Excel</p>
                  <p className="text-slate-400 text-sm mt-1">Obsługiwane formaty: .xlsx, .xls, .ods, .csv</p>
                </div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.ods,.csv" className="hidden" onChange={handleFile} />
              </div>
              <div className="flex items-center justify-center">
                <a
                  href="/import_asortyment_template.xlsx"
                  download
                  className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
                  onClick={e => e.stopPropagation()}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Pobierz przykładowy szablon (.xlsx)
                </a>
              </div>
            </div>
          ) : (
            /* tabela podglądu */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-300"><span className="font-bold text-white">{rows.length}</span> wierszy</span>
                  {errorCount > 0 && <span className="flex items-center gap-1 text-xs bg-red-900/40 border border-red-700/40 text-red-300 px-2 py-0.5 rounded-full"><AlertCircle className="w-3 h-3" />{errorCount} z błędami</span>}
                </div>
                <button onClick={() => { setRows([]); setFileName(""); }} className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1"><Upload className="w-3 h-3" />Wczytaj inny plik</button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--bg-app)]">
                      <th className="px-2 py-2 text-left text-slate-400 font-semibold w-8">#</th>
                      <th className="px-2 py-2 text-left text-slate-400 font-semibold">Kod towaru *</th>
                      <th className="px-2 py-2 text-left text-slate-400 font-semibold">Nazwa *</th>
                      <th className="px-2 py-2 text-left text-slate-400 font-semibold">Typ *</th>
                      <th className="px-2 py-2 text-left text-slate-400 font-semibold">JM *</th>
                      <th className="px-2 py-2 text-left text-slate-400 font-semibold">JM pomocnicza</th>
                      <th className="px-2 py-2 text-left text-slate-400 font-semibold">Przelicznik</th>
                      <th className="px-2 py-2 text-center text-slate-400 font-semibold">Daty waż.</th>
                      <th className="px-2 py-2 text-center text-slate-400 font-semibold">Nieogr.</th>
                      <th className="px-2 py-2 text-left text-slate-400 font-semibold">Producent</th>
                      <th className="px-2 py-2 text-left text-slate-400 font-semibold">Źródło</th>
                      <th className="px-2 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row._idx}
                        className={`border-b border-[var(--border)] ${row._errors.length > 0 ? "bg-red-950/20" : "hover:bg-white/[0.02]"}`}
                      >
                        <td className="px-2 py-1.5 text-slate-500 text-center">{row._idx + 1}</td>

                        <CellInput
                          value={row.kod_towaru}
                          onChange={v => updateRow(row._idx, "kod_towaru", v)}
                          mono
                          hasError={!row.kod_towaru.trim()}
                        />
                        <CellInput
                          value={row.nazwa}
                          onChange={v => updateRow(row._idx, "nazwa", v)}
                          hasError={!row.nazwa.trim()}
                        />

                        {/* Typ — select */}
                        <td className="px-1 py-1">
                          <select
                            value={row.typ_asortymentu}
                            onChange={e => updateRow(row._idx, "typ_asortymentu", e.target.value)}
                            className={`bg-[var(--bg-input)] border rounded px-1.5 py-1 text-white outline-none focus:border-blue-500 text-xs w-full ${
                              !(TYPY_ASORTYMENTU as readonly string[]).includes(row.typ_asortymentu) ? "border-red-500" : "border-[var(--border)]"
                            }`}
                          >
                            {TYPY_ASORTYMENTU.map(t => <option key={t} value={t}>{typLabels[t]}</option>)}
                          </select>
                        </td>

                        {/* JM — select */}
                        <td className="px-1 py-1">
                          <select
                            value={row.jednostka_miary}
                            onChange={e => updateRow(row._idx, "jednostka_miary", e.target.value)}
                            className={`bg-[var(--bg-input)] border rounded px-1.5 py-1 text-white outline-none focus:border-blue-500 text-xs w-full ${
                              !(UNITS as readonly string[]).includes(row.jednostka_miary) ? "border-red-500" : "border-[var(--border)]"
                            }`}
                          >
                            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </td>

                        <CellInput value={row.jednostka_pomocnicza} onChange={v => updateRow(row._idx, "jednostka_pomocnicza", v)} placeholder="—" />
                        <CellInput value={row.przelicznik_jednostki} onChange={v => updateRow(row._idx, "przelicznik_jednostki", v)} placeholder="—" mono />

                        {/* bool checkboxy */}
                        <td className="px-2 py-1 text-center">
                          <input type="checkbox" checked={row.czy_wymaga_daty_waznosci} onChange={e => updateRow(row._idx, "czy_wymaga_daty_waznosci", e.target.checked)} className="accent-blue-500" />
                        </td>
                        <td className="px-2 py-1 text-center">
                          <input type="checkbox" checked={row.czy_zasob_nieograniczony} onChange={e => updateRow(row._idx, "czy_zasob_nieograniczony", e.target.checked)} className="accent-blue-500" />
                        </td>

                        <CellInput value={row.producent} onChange={v => updateRow(row._idx, "producent", v)} placeholder="—" />
                        <CellInput value={row.zrodlo_danych} onChange={v => updateRow(row._idx, "zrodlo_danych", v)} placeholder="—" />

                        {/* usuń */}
                        <td className="px-1 py-1 text-center">
                          <button onClick={() => removeRow(row._idx)} className="text-slate-600 hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                        </td>
                      </tr>
                    ))}
                    {rows.some(r => r._errors.length > 0) && rows.filter(r => r._errors.length > 0).map(row => (
                      <tr key={`err-${row._idx}`} className="bg-red-950/10">
                        <td colSpan={12} className="px-3 py-1 text-xs text-red-400">
                          <span className="font-mono font-bold mr-2">Wiersz {row._idx + 1}:</span>{row._errors.join(" · ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* stopka */}
        {rows.length > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border)] shrink-0">
            <div className="text-sm text-slate-400">
              {errorCount > 0
                ? <span className="text-amber-400">Wiersze z błędami ({errorCount}) zostaną pominięte — zaimportowanych zostanie <strong className="text-white">{validRows.length}</strong></span>
                : <span>Gotowe do importu: <strong className="text-white">{validRows.length}</strong> rekordów</span>
              }
            </div>
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:text-white transition-colors">Anuluj</button>
              <button
                onClick={handleImport}
                disabled={validRows.length === 0 || loading}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Zaimportuj {validRows.length > 0 ? `(${validRows.length})` : ""}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── komponent komórki input ──────────────────────────────────────────────────

function CellInput({ value, onChange, placeholder, mono, hasError }: {
  value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; hasError?: boolean;
}) {
  return (
    <td className="px-1 py-1">
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`bg-[var(--bg-input)] border rounded px-1.5 py-1 text-white outline-none focus:border-blue-500 text-xs w-full placeholder-slate-600 ${
          hasError ? "border-red-500" : "border-[var(--border)]"
        } ${mono ? "font-mono" : ""}`}
      />
    </td>
  );
}
