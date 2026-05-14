import React, { useState, useEffect } from "react";
import { Package, RefreshCw, Search, Pencil, X, Check } from "lucide-react";
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
  id_asortymentu_opakowania: string | null;
  waga_jednostkowa: number | null;
  ilosc_szt: number | null;
  ilosc_kg: number;
  data_produkcji: string | null;
  termin_waznosci: string | null;
  status_partii: string;
};

type OpakowanieLista = { id: string; nazwa: string; };

type ChangeModal = {
  row: Row;
  noweId: string;
  saving: boolean;
  error: string;
};

export default function WyrobyGotowe() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("nazwa");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const handleSort = makeSortHandler(sortKey, setSortKey, setSortDir);
  const [error, setError] = useState("");
  const [opakowanieLista, setOpakowanieLista] = useState<OpakowanieLista[]>([]);
  const [changeModal, setChangeModal] = useState<ChangeModal | null>(null);

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

  useEffect(() => {
    fetch("/api/opakowania-asortyment")
      .then(r => r.json())
      .then(setOpakowanieLista)
      .catch(() => {});
  }, []);

  const openChange = (row: Row) => {
    setChangeModal({ row, noweId: "", saving: false, error: "" });
  };

  const saveChange = async () => {
    if (!changeModal) return;
    const { row, noweId } = changeModal;
    if (!noweId) { setChangeModal(m => m && ({ ...m, error: "Wybierz nowe opakowanie" })); return; }

    setChangeModal(m => m && ({ ...m, saving: true, error: "" }));
    try {
      const res = await fetch(`/api/partie/${row.id_partii}/zmien-opakowanie`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_asortymentu_stare: row.id_asortymentu_opakowania,
          waga_kg_stare: row.waga_jednostkowa,
          id_asortymentu_nowe: noweId,
          waga_kg_nowe: row.waga_jednostkowa,
          ilosc_szt: row.ilosc_szt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd zapisu");
      setChangeModal(null);
      fetchStan();
    } catch (e: any) {
      setChangeModal(m => m && ({ ...m, saving: false, error: e.message }));
    }
  };

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

  const totalKg = Math.round(filtered.reduce((s, r) => s + r.ilosc_kg, 0) * 1000) / 1000;
  const totalSzt = filtered.reduce((s, r) => s + (r.ilosc_szt ?? 0), 0);


  return (
    <div className="flex flex-col h-full gap-4 animate-view">
      {/* Nagłówek */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-black text-white tracking-tight">Wyroby gotowe</h2>
            <span className="text-[9px] font-bold uppercase tracking-[0.15em] px-2 py-0.5 rounded"
                  style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--border-accent)' }}>
              Stan
            </span>
          </div>
          <p className="text-[11px] mt-0.5 font-medium" style={{ color: 'var(--text-muted)' }}>
            Magazyn wyrobów gotowych — partie i opakowania
          </p>
        </div>
        <button
          onClick={fetchStan}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all btn-hover-effect"
          style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--accent)', border: '1px solid rgba(6,182,212,0.25)' }}
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
              <tr style={{ background: "var(--bg-surface)", borderBottom: "2px solid var(--border)" }}>
                <th style={{ width: 3, padding: 0 }} />
                <SortableTh label="Kod"       field="kod_towaru"       sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-left px-4 py-3 font-medium"  style={{ color: "var(--text-muted)" }} />
                <SortableTh label="Nazwa"     field="nazwa"            sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-left px-4 py-3 font-medium"  style={{ color: "var(--text-muted)" }} />
                <SortableTh label="Opakowanie" field="opakowanie"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-left px-4 py-3 font-medium"  style={{ color: "var(--text-muted)" }} />
                <SortableTh label="Masa/szt." field="waga_jednostkowa" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-right px-4 py-3 font-medium" style={{ color: "var(--text-muted)" }} />
                <SortableTh label="Ilość szt" field="ilosc_szt"        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-right px-4 py-3 font-medium" style={{ color: "var(--text-muted)" }} />
                <SortableTh label="Ilość kg"  field="ilosc_kg"         sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-right px-4 py-3 font-medium" style={{ color: "var(--text-muted)" }} />
                <SortableTh label="Partia"    field="numer_partii"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-left px-4 py-3 font-medium"  style={{ color: "var(--text-muted)" }} />
                <SortableTh label="Termin"    field="termin_waznosci"  sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-left px-4 py-3 font-medium"  style={{ color: "var(--text-muted)" }} />
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => (
                <tr key={`${row.id_partii}_${row.opakowanie ?? ''}_${idx}`} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: 0, width: 0 }}><div style={{ width: 3, height: 36, background: 'var(--ok)', opacity: 0.7 }} /></td>
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
                  <td className="px-2 py-2.5 text-center">
                    {row.id_asortymentu_opakowania && row.ilosc_szt != null && (
                      <button
                        onClick={() => openChange(row)}
                        title="Zmień opakowanie"
                        className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal zmiany opakowania */}
      {changeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => !changeModal.saving && setChangeModal(null)}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-5 shadow-2xl" style={{ background: "var(--bg-panel)", border: "1px solid var(--border)" }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-white text-base">Zmień opakowanie</h2>
              <button onClick={() => !changeModal.saving && setChangeModal(null)} className="text-[var(--text-muted)] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Bieżące */}
            <div className="rounded-lg p-3 space-y-1" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
              <div className="text-[10px] font-black uppercase text-[var(--text-muted)]">Aktualne opakowanie</div>
              <div className="font-medium text-white">{changeModal.row.opakowanie}</div>
              <div className="text-xs text-[var(--text-muted)]">{changeModal.row.waga_jednostkowa?.toFixed(2)} kg/szt · {changeModal.row.ilosc_szt} szt. w partii</div>
            </div>

            {/* Nowe opakowanie */}
            <div>
              <label className="block text-xs font-black uppercase text-[var(--text-muted)] mb-1.5">Nowe opakowanie</label>
              <select
                value={changeModal.noweId}
                onChange={e => setChangeModal(m => m && ({ ...m, noweId: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
              >
                <option value="">— wybierz —</option>
                {opakowanieLista.map(op => (
                  <option key={op.id} value={op.id}>{op.nazwa}</option>
                ))}
              </select>
            </div>

            {changeModal.error && (
              <p className="text-sm" style={{ color: "var(--warn)" }}>{changeModal.error}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setChangeModal(null)}
                disabled={changeModal.saving}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ background: "var(--bg-surface)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
              >
                Anuluj
              </button>
              <button
                onClick={saveChange}
                disabled={changeModal.saving}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                <Check className="w-4 h-4" />
                {changeModal.saving ? "Zapisuję…" : "Zmień"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
