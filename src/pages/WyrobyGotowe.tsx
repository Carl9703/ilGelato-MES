import React, { useState, useEffect } from "react";
import { Package, RefreshCw, Search } from "lucide-react";
import { fmtDate } from "../utils/fmt";
import { SortableTh } from "../components/SortableTh";
import { sortBy, makeSortHandler, type SortDir } from "../utils/sortBy";

type Row = {
  id_partii: string;
  numer_partii: string;
  kod_towaru: string;
  nazwa: string;
  jednostka_miary: string;
  opakowanie: string | null;
  waga_jednostkowa: number | null;
  ilosc_szt: number | null;
  ilosc_kg: number;
  data_produkcji: string | null;
  termin_waznosci: string | null;
  status_partii: string;
};

export default function WyrobyGotowe() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("nazwa");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const handleSort = makeSortHandler(sortKey, setSortKey, setSortDir);
  const [error, setError] = useState("");

  const fetchStan = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/wyroby-gotowe/stan");
      if (!res.ok) throw new Error("Błąd pobierania danych");
      setRows(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStan(); }, []);

  const q = search.toLowerCase();
  const filtered = sortBy<Row>(
    rows.filter(r => !q || r.kod_towaru.toLowerCase().includes(q) || r.nazwa.toLowerCase().includes(q)),
    r => {
      switch (sortKey) {
        case 'kod_towaru':      return r.kod_towaru;
        case 'opakowanie':      return r.opakowanie ?? '';
        case 'waga_jednostkowa': return r.waga_jednostkowa ?? -1;
        case 'ilosc_szt':       return r.ilosc_szt ?? -1;
        case 'ilosc_kg':        return r.ilosc_kg;
        case 'numer_partii':    return r.numer_partii;
        case 'termin_waznosci': return r.termin_waznosci ?? '';
        default:                return r.nazwa;
      }
    },
    sortDir
  );

  const totalKg = Math.round(rows.reduce((s, r) => s + r.ilosc_kg, 0) * 1000) / 1000;
  const totalSzt = rows.reduce((s, r) => s + (r.ilosc_szt ?? 0), 0);


  return (
    <div className="flex flex-col h-full gap-4">
      {/* Nagłówek */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Package className="w-5 h-5" style={{ color: "var(--accent)" }} />
          <h1 className="text-lg font-semibold text-white">Wyroby gotowe</h1>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--bg-surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
            Stan magazynowy
          </span>
        </div>
        <button
          onClick={fetchStan}
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded transition-colors"
          style={{ background: "var(--bg-surface)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Odśwież
        </button>
      </div>

      {/* Karty podsumowania */}
      <div className="grid grid-cols-2 gap-3 shrink-0">
        <div className="rounded-lg p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Łącznie masa</div>
          <div className="text-2xl font-bold text-white">
            {totalKg.toFixed(2)} <span className="text-sm font-normal" style={{ color: "var(--text-muted)" }}>kg</span>
          </div>
        </div>
        <div className="rounded-lg p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Łącznie sztuk</div>
          <div className="text-2xl font-bold text-white">
            {totalSzt > 0 ? totalSzt : "—"} <span className="text-sm font-normal" style={{ color: "var(--text-muted)" }}>{totalSzt > 0 ? "szt" : ""}</span>
          </div>
        </div>
      </div>

      {/* Wyszukiwarka */}
      <div className="shrink-0 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} />
        <input
          type="text"
          placeholder="Szukaj po kodzie lub nazwie…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm rounded-lg outline-none text-white"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
        />
      </div>

      {/* Tabela */}
      <div className="flex-1 min-h-0 overflow-auto rounded-lg" style={{ border: "1px solid var(--border)" }}>
        {error && (
          <div className="p-4 text-sm" style={{ color: "var(--warn)" }}>{error}</div>
        )}
        {loading && !error && (
          <div className="flex items-center justify-center h-32 text-sm" style={{ color: "var(--text-muted)" }}>
            Ładowanie…
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <Package className="w-8 h-8" style={{ color: "var(--text-muted)" }} />
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Brak wyrobów gotowych w magazynie</p>
          </div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
                <SortableTh label="Kod"       field="kod_towaru"       sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-left px-4 py-3 font-medium"  style={{ color: "var(--text-muted)" }} />
                <SortableTh label="Nazwa"     field="nazwa"            sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-left px-4 py-3 font-medium"  style={{ color: "var(--text-muted)" }} />
                <SortableTh label="Opakowanie" field="opakowanie"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-left px-4 py-3 font-medium"  style={{ color: "var(--text-muted)" }} />
                <SortableTh label="Masa/szt." field="waga_jednostkowa" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-right px-4 py-3 font-medium" style={{ color: "var(--text-muted)" }} />
                <SortableTh label="Ilość szt" field="ilosc_szt"        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-right px-4 py-3 font-medium" style={{ color: "var(--text-muted)" }} />
                <SortableTh label="Ilość kg"  field="ilosc_kg"         sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-right px-4 py-3 font-medium" style={{ color: "var(--text-muted)" }} />
                <SortableTh label="Partia"    field="numer_partii"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-left px-4 py-3 font-medium"  style={{ color: "var(--text-muted)" }} />
                <SortableTh label="Termin"    field="termin_waznosci"  sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-left px-4 py-3 font-medium"  style={{ color: "var(--text-muted)" }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => (
                <tr key={`${row.id_partii}_${row.opakowanie ?? ''}_${idx}`} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: "var(--accent)" }}>{row.kod_towaru}</td>
                  <td className="px-4 py-2.5 font-medium" style={{ color: "var(--text-primary)" }}>{row.nazwa}</td>
                  <td className="px-4 py-2.5" style={{ color: "var(--text-secondary)" }}>{row.opakowanie ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                    {row.waga_jednostkowa ? `${row.waga_jednostkowa.toFixed(2)} kg` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-mono" style={{ color: "var(--text-primary)" }}>
                    {row.ilosc_szt != null ? row.ilosc_szt : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium font-mono" style={{ color: "var(--ok)" }}>
                    {row.ilosc_kg.toFixed(3)} kg
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: "var(--text-muted)" }}>{row.numer_partii}</td>
                  <td className="px-4 py-2.5 text-sm" style={{ color: row.termin_waznosci ? "var(--text-secondary)" : "var(--text-muted)" }}>
                    {fmtDate(row.termin_waznosci)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
