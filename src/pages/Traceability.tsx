import React, { useState, useEffect } from "react";
import { Search, Share2, ArrowRight, ArrowLeft, Package, Factory, ClipboardList, Truck } from "lucide-react";
import { useToast } from "../components/Toast";
import { Spinner } from "../components/Spinner";
import { EmptyState } from "../components/EmptyState";

type TraceData = {
  partia: { id: string; numer_partii: string; asortyment: string; status: string };
  skladniki: any[];
  wyroby_pochodne: any[];
  wydania_wz: { dokument: string | null; ilosc: number; jednostka: string; data: string }[];
};

export default function Traceability() {
  const { showToast } = useToast();
  const [query, setQuery] = useState("");
  const [data, setData] = useState<TraceData | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (numer?: string) => {
    const q = numer || query;
    if (!q) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/trace/partia/${encodeURIComponent(q)}/genealogia`);
      if (res.ok) {
        setData(await res.json());
      } else {
        showToast("Nie znaleziono partii o takim numerze.", "error");
        setData(null);
      }
    } catch {
      showToast("Błąd połączenia z serwerem.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-3 animate-view">
      <div>
        <h2 className="text-lg font-bold text-white tracking-wide">Traceability</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Genealogia partii Lot-to-Lot</p>
      </div>

      {/* Wyszukiwarka */}
      <div className="mes-panel rounded p-4 flex gap-3 items-center">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Numer partii (np. PW-1/03/26)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-full rounded-xl pl-9 pr-4 py-2.5 text-sm font-mono outline-none focus:ring-1"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
            autoFocus
          />
        </div>
        <button
          onClick={() => handleSearch()}
          disabled={loading}
          className="px-5 py-2.5 rounded text-sm font-semibold btn-hover-effect disabled:opacity-50 text-white"
          style={{ background: 'var(--accent)' }}
        >
          {loading ? "Szukanie…" : "Analizuj"}
        </button>
      </div>

      {data && (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
          {/* Panel analizowanej partii */}
          <div className="mes-panel rounded p-4 flex items-center gap-4">
            <Package className="w-5 h-5 shrink-0" style={{ color: 'var(--accent)' }} />
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-lg text-white">{data.partia.numer_partii}</span>
                <span className="badge badge-ok">{data.partia.status}</span>
              </div>
              <div className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{data.partia.asortyment}</div>
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Analizowana partia</div>
          </div>

          {/* Genealogia: surowce → partia → wyroby */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Surowce i składniki */}
            <div className="mes-panel rounded overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>
                <ArrowLeft className="w-3.5 h-3.5" /> Surowce i składniki
              </div>
              {data.skladniki.length > 0 ? (
                <table className="mes-table">
                  <thead>
                    <tr>
                      <th>Partia</th>
                      <th>Asortyment</th>
                      <th className="text-right">Ilość</th>
                      <th>Zlecenie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.skladniki.map((s, i) => (
                      <tr key={i} onClick={() => { setQuery(s.numer_partii); handleSearch(s.numer_partii); }}>
                        <td className="mono" style={{ color: 'var(--text-code)' }}>{s.numer_partii}</td>
                        <td className="text-white">{s.asortyment}</td>
                        <td className="text-right mono">{s.ilosc} <span className="text-xs opacity-50">{s.jednostka}</span></td>
                        <td className="mono text-xs" style={{ color: 'var(--text-muted)' }}>{s.zlecenie_produkcyjne}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState message="Brak danych — surowiec pierwotny" />
              )}
            </div>

            {/* Produkty pochodne */}
            <div className="mes-panel rounded overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>
                Produkty pochodne <ArrowRight className="w-3.5 h-3.5" />
              </div>
              {data.wyroby_pochodne.length > 0 ? (
                <table className="mes-table">
                  <thead>
                    <tr>
                      <th>Partia</th>
                      <th>Asortyment</th>
                      <th className="text-right">Ilość</th>
                      <th>Zlecenie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.wyroby_pochodne.map((w, i) => (
                      <tr key={i} onClick={() => { setQuery(w.numer_partii); handleSearch(w.numer_partii); }}>
                        <td className="mono" style={{ color: 'var(--ok)' }}>{w.numer_partii}</td>
                        <td className="text-white">{w.asortyment}</td>
                        <td className="text-right mono">{w.ilosc} <span className="text-xs opacity-50">{w.jednostka}</span></td>
                        <td className="mono text-xs" style={{ color: 'var(--text-muted)' }}>{w.zlecenie_produkcyjne}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState message="Ostatni etap — produkt końcowy" />
              )}
            </div>
          </div>

          {/* Wydania WZ */}
          {(data.wydania_wz?.length ?? 0) > 0 && (
            <div className="mes-panel rounded overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>
                <Truck className="w-3.5 h-3.5" /> Wydania WZ powiązane z partią
              </div>
              <table className="mes-table">
                <thead>
                  <tr>
                    <th>Dokument WZ</th>
                    <th className="text-right">Ilość</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {data.wydania_wz?.map((w, i) => (
                    <tr key={i}>
                      <td className="mono" style={{ color: 'var(--warn)' }}>{w.dokument ?? '—'}</td>
                      <td className="text-right mono">{w.ilosc} <span className="text-xs opacity-50">{w.jednostka}</span></td>
                      <td className="text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(w.data).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
