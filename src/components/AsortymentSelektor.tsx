import React, { useState, useEffect, useRef } from "react";
import { X, Search, Check, Package, ShoppingCart } from "lucide-react";

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
};

const typColors: Record<string, string> = {
  Surowiec: "bg-blue-500/20 text-blue-300",
  Polprodukt: "bg-amber-500/20 text-amber-300",
  Wyrob_Gotowy: "bg-emerald-500/20 text-emerald-300",
};
const typLabels: Record<string, string> = {
  Surowiec: "Surowiec",
  Polprodukt: "Półprodukt",
  Wyrob_Gotowy: "Wyrób gotowy",
};

export default function AsortymentSelektor({ onConfirm, onClose, tryb = "pz", typy, singleSelect = false }: Props) {
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
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#0f172a] border border-[#334155] rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#334155] bg-[#1e293b] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600/20 rounded-xl flex items-center justify-center">
              <Package className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-white font-bold text-base">Wybierz towary</h3>
              <p className="text-slate-500 text-xs">Zaznacz pozycje i wpisz ilości</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white p-2 rounded-lg hover:bg-[#334155] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filtry i wyszukiwanie */}
        <div className="p-4 border-b border-[#334155] bg-[#1e293b]/50 shrink-0 space-y-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Szukaj po nazwie lub kodzie towaru..."
              className="w-full bg-[#0f172a] border border-[#334155] text-white rounded-xl pl-11 pr-10 py-3 outline-none focus:border-blue-500 transition-colors"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex gap-1 bg-[#0f172a] p-1 rounded-xl overflow-x-auto">
            {[
              { id: "all", label: "Wszystkie" },
              { id: "Surowiec", label: "Surowce" },
              { id: "Polprodukt", label: "Półprodukty" },
              { id: "Wyrob_Gotowy", label: "Wyroby gotowe" },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                  filter === f.id ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="p-12 text-center"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Brak wyników</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-[#1e293b]/80 text-slate-400 text-xs uppercase sticky top-0">
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
                  <th className="px-4 py-3 font-semibold text-right w-36">Ilość</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e293b]">
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
                          : "hover:bg-[#1e293b]"
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
                          ? <span className="text-emerald-400 font-bold font-mono">{a.ilosc.toFixed(2)} <span className="text-slate-500 text-[10px]">{a.jednostka_miary}</span></span>
                          : <span className="text-slate-600">0</span>
                        }
                      </td>
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
                            className="w-full bg-[#0f172a] border border-blue-500 text-white rounded-lg px-3 py-1.5 text-right font-mono font-bold outline-none focus:ring-2 focus:ring-blue-500/30 text-sm"
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#334155] bg-[#1e293b] shrink-0 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${selectedCount > 0 ? "bg-blue-600/20 text-blue-300" : "bg-[#0f172a] text-slate-500"}`}>
              <ShoppingCart className="w-4 h-4" />
              <span className="font-bold text-sm">{selectedCount} pozycji zaznaczonych</span>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-5 py-2.5 text-slate-400 hover:bg-[#334155] rounded-xl font-semibold transition-colors">
              Anuluj
            </button>
            <button
              onClick={handleConfirm}
              disabled={selectedCount === 0}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors"
            >
              <Check className="w-4 h-4" />
              Dodaj do dokumentu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
