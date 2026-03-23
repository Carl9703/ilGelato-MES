import React, { useState, useEffect, useRef } from "react";
import { X, Search, Check, Package, ShoppingCart } from "lucide-react";
import { fmtL } from "../utils/fmt";

type AsortymentItem = {
  id: string;
  kod_towaru: string;
  nazwa: string;
  typ_asortymentu: string;
  jednostka_miary: string;
  ilosc?: number;
  cena_srednia?: number;
};

export type WybranyTowar = {
  id_asortymentu: string;
  kod_towaru: string;
  nazwa: string;
  jednostka_miary: string;
  ilosc: string;
};

type Props = {
  onConfirm: (items: WybranyTowar[]) => void;
  onClose: () => void;
  /** "pz" — wszystkie, "wz" — z dostępnym stanem, "prod" - półprodukty/wyroby */
  tryb?: "pz" | "wz" | "prod";
  /** Opcjonalna tablica typów do filtrowania (nadpisuje domyślne dla trybu) */
  typy?: string[];
  /** Czy można wybrać tylko jeden element? */
  singleSelect?: boolean;
  /** Ukryj kolumnę ilości (np. dla WZ gdzie ilość wynika z opakowań) */
  hideIlosc?: boolean;
};

const typColors: Record<string, string> = {
  Surowiec: "bg-blue-500/15 text-blue-400",
  Polprodukt: "bg-amber-500/15 text-amber-500",
  Wyrob_Gotowy: "bg-emerald-500/15 text-emerald-500",
};
const typLabels: Record<string, string> = {
  Surowiec: "Surowiec",
  Polprodukt: "Półprodukt",
  Wyrob_Gotowy: "Wyrób gotowy",
};

export default function AsortymentSelektor({ onConfirm, onClose, tryb = "pz", typy, singleSelect = false, hideIlosc = false }: Props) {
  const [items, setItems] = useState<AsortymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(tryb === "prod" ? "Polprodukt" : "all");
  // map: id -> { checked, ilosc }
  const [selected, setSelected] = useState<Record<string, { checked: boolean; ilosc: string }>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchItems();
    setTimeout(() => searchRef.current?.focus(), 100);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/asortyment");
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const filtered = items.filter((a: AsortymentItem) => {
    if (tryb === "wz" && (a.ilosc || 0) <= 0) return false;
    if (typy && typy.length > 0 && !typy.includes(a.typ_asortymentu)) return false;
    
    // Filtrowanie po typie (dropdown/tabsy)
    const matchFilter = filter === "all" || a.typ_asortymentu === filter;
    const matchSearch = !search ||
      a.nazwa.toLowerCase().includes(search.toLowerCase()) ||
      a.kod_towaru.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const toggle = (id: string) => {
    if (singleSelect) {
      const item = items.find(i => i.id === id)!;
      onConfirm([{
        id_asortymentu: id,
        kod_towaru: item.kod_towaru,
        nazwa: item.nazwa,
        jednostka_miary: item.jednostka_miary,
        ilosc: "1", // Domyślna ilość dla single select, do zmiany w formularzu docelowym
      }]);
      return;
    }

    setSelected(prev => {
      const cur = prev[id];
      if (cur?.checked) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: { checked: true, ilosc: "" } };
    });
  };

  const setIlosc = (id: string, val: string) => {
    setSelected(prev => ({ ...prev, [id]: { checked: true, ilosc: val } }));
  };

  const selectedCount = Object.keys(selected).length;

  const allFilteredChecked = filtered.length > 0 && filtered.every(a => !!selected[a.id]?.checked);
  const someFilteredChecked = !allFilteredChecked && filtered.some(a => !!selected[a.id]?.checked);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someFilteredChecked;
    }
  }, [someFilteredChecked]);

  const toggleAll = () => {
    if (allFilteredChecked) {
      // Odznacz wszystkie widoczne
      setSelected(prev => {
        const next = { ...prev };
        filtered.forEach(a => delete next[a.id]);
        return next;
      });
    } else {
      // Zaznacz wszystkie widoczne
      setSelected(prev => {
        const next = { ...prev };
        filtered.forEach(a => { if (!next[a.id]) next[a.id] = { checked: true, ilosc: "" }; });
        return next;
      });
    }
  };

  const handleConfirm = () => {
    const result: WybranyTowar[] = Object.entries(selected).map(([id, s]: [string, { checked: boolean, ilosc: string }]) => {
      const item = items.find(i => i.id === id)!;
      return {
        id_asortymentu: id,
        kod_towaru: item.kod_towaru,
        nazwa: item.nazwa,
        jednostka_miary: item.jednostka_miary,
        ilosc: s.ilosc,
      };
    });
    onConfirm(result);
  };

  return (
    <div className="fixed inset-0 z-[1010] flex items-center justify-center p-4" style={{ background: 'var(--bg-app)', opacity: 0.95, backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}>

        {/* Header */}
        <div className="flex items-center justify-between shrink-0" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}>
              <Package className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)', margin: 0 }}>Wybierz towary</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)', margin: '2px 0 0' }}>Zaznacz pozycje i wpisz ilości</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 4, display: 'flex' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filtry i wyszukiwanie */}
        <div className="shrink-0 space-y-3" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Szukaj po nazwie lub kodzie towaru..."
              className="mes-input"
              style={{ paddingLeft: 34 }}
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex gap-1 overflow-x-auto" style={{ background: 'var(--bg-app)', padding: 4, borderRadius: 6 }}>
            {[
              { id: "all", label: "Wszystkie" },
              { id: "Surowiec", label: "Surowce" },
              { id: "Polprodukt", label: "Półprodukty" },
              { id: "Wyrob_Gotowy", label: "Wyroby gotowe" },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className="whitespace-nowrap"
                style={{
                  padding: '5px 12px',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background 0.15s, color 0.15s',
                  background: filter === f.id ? 'var(--accent)' : 'transparent',
                  color: filter === f.id ? '#080c14' : 'var(--text-secondary)',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="p-12 flex justify-center"><div style={{ width: 20, height: 20, borderWidth: 2, borderStyle: 'solid', borderColor: 'var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /></div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center" style={{ color: 'var(--text-muted)' }}>
              <Package className="w-8 h-8 mx-auto mb-3" style={{ opacity: 0.3 }} />
              <p className="text-sm">Brak wyników</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--bg-panel)]/80 text-[var(--text-muted)] text-xs uppercase sticky top-0">
                <tr>
                  <th className="px-4 py-3 w-10">
                    {!singleSelect && (
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={allFilteredChecked}
                        onChange={toggleAll}
                        className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
                        title={allFilteredChecked ? "Odznacz wszystkie" : "Zaznacz wszystkie"}
                      />
                    )}
                  </th>
                  <th className="px-4 py-3 font-semibold">Kod</th>
                  <th className="px-4 py-3 font-semibold">Nazwa</th>
                  <th className="px-4 py-3 font-semibold">Typ</th>
                  <th className="px-4 py-3 font-semibold text-right">Stan</th>
                  {!hideIlosc && <th className="px-4 py-3 font-semibold text-right w-36">Ilość</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filtered.map(a => {
                  const sel = selected[a.id];
                  const isChecked = !!sel?.checked;
                  return (
                    <tr
                      key={a.id}
                      onClick={() => toggle(a.id)}
                      className={`cursor-pointer transition-colors group ${
                        isChecked
                          ? "bg-blue-600/10 hover:bg-blue-600/15"
                          : "hover:bg-[var(--bg-hover)]"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-all ${
                          isChecked ? "bg-blue-600 border-blue-600" : "border-[#475569] group-hover:border-blue-400"
                        }`}>
                          {isChecked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-blue-300 text-xs">{a.kod_towaru}</td>
                      <td className="px-4 py-3 text-white font-semibold">{a.nazwa}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${typColors[a.typ_asortymentu]}`}>
                          {typLabels[a.typ_asortymentu]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {a.ilosc > 0
                          ? <span className="text-emerald-400 font-bold font-mono">{fmtL(a.ilosc, 2)} <span className="text-slate-500 text-[10px]">{a.jednostka_miary}</span></span>
                          : <span className="text-slate-600">0</span>
                        }
                      </td>
                      {!hideIlosc && (
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          {isChecked && (
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              autoFocus
                              value={sel.ilosc}
                              onChange={e => setIlosc(a.id, e.target.value)}
                              placeholder="0"
                              className="mes-input"
                              style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 13 }}
                            />
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between gap-4" style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
          <div className="flex items-center gap-2" style={{
            padding: '6px 12px',
            borderRadius: 6,
            background: selectedCount > 0 ? 'var(--accent-dim)' : 'var(--bg-app)',
            border: `1px solid ${selectedCount > 0 ? 'var(--border-accent)' : 'var(--border)'}`,
            color: selectedCount > 0 ? 'var(--accent)' : 'var(--text-muted)',
            fontSize: 12,
            fontWeight: 600,
          }}>
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>{selectedCount} pozycji zaznaczonych</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors">Anuluj</button>
            <button onClick={handleConfirm} disabled={selectedCount === 0} className="btn btn-primary">
              <Check className="w-3.5 h-3.5" />
              Dodaj do dokumentu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
