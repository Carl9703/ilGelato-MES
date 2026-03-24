import React, { useState, useEffect } from "react";
import { Plus, Save, X, BookOpen, Trash2, Edit2, Calculator } from "lucide-react";
import { fmtL } from "../utils/fmt";
import { useToast } from "../components/Toast";
import { Spinner } from "../components/Spinner";
import { EmptyState } from "../components/EmptyState";
import { SortableTh } from "../components/SortableTh";
import { sortBy, makeSortHandler, type SortDir } from "../utils/sortBy";

type Asortyment = {
  id: string; kod_towaru: string; nazwa: string; jednostka_miary: string;
  typ_asortymentu: string; jednostka_pomocnicza: string | null; przelicznik_jednostki: number | null;
};
type Skladnik = {
  id_asortymentu_skladnika: string; ilosc_wymagana: number; czy_pomocnicza: boolean;
  asortyment_skladnika: Asortyment;
};
type Receptura = {
  id: string; numer_wersji: number; dni_trwalosci: number | null; wielkosc_produkcji: number; czy_aktywne: boolean;
  asortyment_docelowy: Asortyment; skladniki: Skladnik[];
};

type KartaMode = "view" | "edit" | "new";

export default function Receptury() {
  const { showToast } = useToast();
  const [receptury, setReceptury] = useState<Receptura[]>([]);
  const [asortyment, setAsortyment] = useState<Asortyment[]>([]);

  // Karta state
  const [kartaMode, setKartaMode] = useState<KartaMode | null>(null);
  const [kartaReceptura, setKartaReceptura] = useState<Receptura | null>(null);

  // Form values (used in edit/new modes)
  const [docelowyId, setDocelowyId] = useState("");
  const [wersja, setWersja] = useState(1);
  const [dniTrwalosci, setDniTrwalosci] = useState("");
  const [wielkoscProdukcji, setWielkoscProdukcji] = useState("1");
  const [skladniki, setSkladniki] = useState<{ id_asortymentu_skladnika: string; ilosc_wymagana: string; czy_pomocnicza: boolean }[]>([]);

  const [showArchived, setShowArchived] = useState(false);
  const [sortKey, setSortKey] = useState("produkt");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const handleSort = makeSortHandler(sortKey, setSortKey, setSortDir);

  // Zakładki karty (tylko w view mode)
  const [kartaTab, setKartaTab] = useState<"specyfikacja" | "kalkulator">("specyfikacja");

  // Kalkulator kosztów
  const [kalkulacja, setKalkulacja] = useState<any>(null);
  const [kalcLoading, setKalcLoading] = useState(false);
  const [kalcWielkosc, setKalcWielkosc] = useState("1");
  const [kalcNarzut, setKalcNarzut] = useState("0");

  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && kartaMode) closeKarta(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [kartaMode]);

  // Auto-wylicz rozmiar wsadu jako sumę ilości składników
  useEffect(() => {
    if (kartaMode !== 'edit' && kartaMode !== 'new') return;
    const suma = skladniki.reduce((acc, s) => acc + (parseFloat(s.ilosc_wymagana) || 0), 0);
    if (suma > 0) {
      setWielkoscProdukcji(String(Number(suma.toFixed(3))));
    }
  }, [skladniki]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAll = async (archived = showArchived) => {
    const [rRes, aRes] = await Promise.all([
      fetch(`/api/receptury${archived ? '?includeArchived=true' : ''}`),
      fetch("/api/asortyment")
    ]);
    if (rRes.ok) setReceptury(await rRes.json());
    if (aRes.ok) setAsortyment(await aRes.json());
  };

  const toggleArchived = () => {
    const next = !showArchived;
    setShowArchived(next);
    fetchAll(next);
  };

  const loadKalkulacja = async (id: string, wielkosc?: string, narzut?: string) => {
    setKalcLoading(true);
    setKalkulacja(null);
    try {
      const res = await fetch(`/api/receptury/${id}/kalkulacja`);
      if (res.ok) {
        const d = await res.json();
        setKalkulacja(d);
        setKalcWielkosc(d.wielkosc_produkcji.toString());
        setKalcNarzut(d.narzut_procent.toString());
      }
    } catch {} finally { setKalcLoading(false); }
  };

  const saveKalcParametry = async () => {
    if (!kartaReceptura) return;
    await fetch(`/api/receptury/${kartaReceptura.id}/parametry`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wielkosc_produkcji: kalcWielkosc, narzut_procent: kalcNarzut }),
    });
    loadKalkulacja(kartaReceptura.id);
  };

  // Otwórz kartę w trybie podglądu
  const openView = (r: Receptura) => {
    setKartaReceptura(r);
    setKartaMode("view");
    setKartaTab("specyfikacja");
    loadKalkulacja(r.id);
  };

  // Otwórz kartę w trybie edycji (istniejąca)
  const openEdit = (r: Receptura) => {
    setKartaReceptura(r);
    setKartaMode("edit");
    setDocelowyId(r.asortyment_docelowy.id);
    setWersja(r.numer_wersji);
    setDniTrwalosci(r.dni_trwalosci?.toString() || "");
    setWielkoscProdukcji(r.wielkosc_produkcji?.toString() || "1");
    const wsad = r.wielkosc_produkcji || 1;
    setSkladniki(r.skladniki.map(s => ({
      id_asortymentu_skladnika: s.id_asortymentu_skladnika,
      ilosc_wymagana: String(Number((s.ilosc_wymagana * wsad).toFixed(3))),
      czy_pomocnicza: s.czy_pomocnicza === true
    })));
  };

  // Otwórz kartę w trybie nowy
  const openNew = () => {
    setKartaReceptura(null);
    setKartaMode("new");
    setDocelowyId("");
    setWersja(1);
    setDniTrwalosci("");
    setWielkoscProdukcji("1");
    setSkladniki([]);
  };

  const closeKarta = () => {
    setKartaMode(null);
    setKartaReceptura(null);
  };

  const openNewVersion = (r: Receptura) => {
    // Znajdź najwyższy numer wersji dla tego asortymentu
    const sameProductVersions = receptury.filter(rec => rec.asortyment_docelowy.id === r.asortyment_docelowy.id);
    const maxVersion = Math.max(...sameProductVersions.map(rec => rec.numer_wersji), 0);
    
    setKartaReceptura(null);
    setKartaMode("new");
    setDocelowyId(r.asortyment_docelowy.id);
    setWersja(maxVersion + 1);
    setDniTrwalosci(r.dni_trwalosci?.toString() || "");
    setWielkoscProdukcji(r.wielkosc_produkcji?.toString() || "1");
    const wsad2 = r.wielkosc_produkcji || 1;
    setSkladniki(r.skladniki.map(s => ({
      id_asortymentu_skladnika: s.id_asortymentu_skladnika,
      ilosc_wymagana: String(Number((s.ilosc_wymagana * wsad2).toFixed(3))),
      czy_pomocnicza: s.czy_pomocnicza === true
    })));
  };

  const switchToEdit = () => {
    if (kartaReceptura) openEdit(kartaReceptura);
  };

  const switchToView = () => {
    if (kartaReceptura) openView(kartaReceptura);
    else closeKarta();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docelowyId || skladniki.length === 0) { showToast("Wybierz produkt i dodaj co najmniej jeden składnik.", "error"); return; }
    const wsad = parseFloat(wielkoscProdukcji) || 1;
    const body = {
      id_asortymentu_docelowego: docelowyId,
      numer_wersji: wersja,
      dni_trwalosci: dniTrwalosci ? parseInt(dniTrwalosci) : null,
      wielkosc_produkcji: wsad,
      skladniki: skladniki.map(s => ({ ...s, ilosc_wymagana: String(parseFloat(s.ilosc_wymagana) / wsad) })),
    };
    try {
      const isEdit = kartaMode === "edit" && kartaReceptura;
      const url = isEdit ? `/api/receptury/${kartaReceptura.id}` : "/api/receptury";
      const res = await fetch(url, { method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const saved: Receptura = await res.json();
      showToast("Receptura zapisana!", "ok");
      await fetchAll();
      openView(saved);
    } catch (err: any) { showToast(err.message, "error"); }
  };

  const handleToggleAktywne = async (id: string, current: boolean) => {
    if (kartaReceptura?.id === id) {
      setKartaReceptura({ ...kartaReceptura, czy_aktywne: !current });
    }
    await fetch(`/api/receptury/${id}/aktywne`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ czy_aktywne: !current }),
    });
    fetchAll();
  };

  const produkty = asortyment.filter(a => a.typ_asortymentu === "Wyrob_Gotowy" || a.typ_asortymentu === "Polprodukt");
  const surowce = asortyment.filter(a => a.typ_asortymentu !== "Wyrob_Gotowy") as (Asortyment & { jednostka_pomocnicza: string | null })[];

  const isEditMode = kartaMode === "edit" || kartaMode === "new";

  const selectedAsortyment = asortyment.find(a => a.id === docelowyId);

  return (
    <div className="h-full flex flex-col gap-3 animate-view">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-lg font-bold text-white tracking-wide">Receptury</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Technologie i specyfikacje BOM</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleArchived} className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-semibold transition-colors ${showArchived ? 'bg-slate-600 text-white' : 'text-slate-400 hover:bg-[#334155]'}`}>
            {showArchived ? 'Ukryj archiwalne' : 'Pokaż archiwalne'}
          </button>
          <button onClick={openNew} data-testid="btn-dodaj-recepture" className="flex items-center gap-2 px-4 py-2 rounded text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white btn-hover-effect">
            <Plus className="w-4 h-4" />Nowa receptura
          </button>
        </div>
      </div>

      {/* ===== KARTA RECEPTURY (jeden modal, dwa tryby) ===== */}
      {kartaMode && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm pl-16 lg:pl-60 pr-4">
          <div className="bg-[#1e293b] shadow-2xl border border-[#334155] overflow-hidden flex flex-col" style={{ height: '80vh', marginTop: '10vh' }}>

            {/* NAGŁÓWEK KARTY */}
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
              <div className="flex items-center gap-3 min-w-0">
                <BookOpen className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
                <div className="min-w-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <h3 className="text-base font-bold text-white truncate">
                      {kartaMode === "new" ? "Nowa receptura" : kartaReceptura?.asortyment_docelowy.nazwa}
                    </h3>
                    {kartaMode === "view" && <span className="badge badge-ok">Podgląd</span>}
                    {kartaMode === "edit" && <span className="badge badge-warn">Edycja</span>}
                    {kartaMode === "new" && <span className="badge badge-info">Nowy</span>}
                  </div>
                  {kartaReceptura && (
                    <div className="flex items-center gap-2 mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span className="mono" style={{ color: 'var(--text-code)' }}>{kartaReceptura.asortyment_docelowy.kod_towaru}</span>
                      <span>·</span>
                      {receptury
                        .filter(r => r.asortyment_docelowy.id === kartaReceptura.asortyment_docelowy.id)
                        .sort((a, b) => a.numer_wersji - b.numer_wersji)
                        .map(r => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => kartaMode === "view" && openView(r)}
                            className="px-2 py-0.5 rounded font-bold transition-colors"
                            style={{
                              background: r.id === kartaReceptura.id ? 'var(--accent)' : 'transparent',
                              color: r.id === kartaReceptura.id ? '#fff' : 'var(--text-muted)',
                              cursor: kartaMode === "view" ? 'pointer' : 'default',
                              fontSize: 10,
                            }}
                          >
                            v{r.numer_wersji}
                          </button>
                        ))
                      }
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {kartaMode === "view" && kartaReceptura && (
                  <>
                    <button onClick={() => openNewVersion(kartaReceptura)} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-colors btn-hover-effect">
                      <Plus className="w-4 h-4" /> Nowa wersja
                    </button>
                    <button onClick={switchToEdit} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-colors btn-hover-effect">
                      <Edit2 className="w-4 h-4" /> Edytuj
                    </button>
                    <div
                      onClick={() => handleToggleAktywne(kartaReceptura.id, kartaReceptura.czy_aktywne)}
                      title={kartaReceptura.czy_aktywne ? "Dezaktywuj wersję" : "Aktywuj wersję"}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer select-none transition-colors hover:bg-[#334155]"
                    >
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {kartaReceptura.czy_aktywne ? "Aktywna" : "Archiwalna"}
                      </span>
                      <div className={`w-10 h-5 rounded-full transition-colors relative ${kartaReceptura.czy_aktywne ? 'bg-emerald-500' : 'bg-slate-600'}`}>
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${kartaReceptura.czy_aktywne ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </div>
                    </div>
                  </>
                )}
                {isEditMode && (
                  <button onClick={switchToView} className="px-5 py-2.5 text-slate-400 hover:bg-[#334155] rounded-xl font-semibold transition-colors">
                    {kartaMode === "new" ? "Anuluj" : "Anuluj edycję"}
                  </button>
                )}
                <button onClick={closeKarta} className="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-white transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* ZAKŁADKI (tylko w trybie podglądu) */}
            {kartaMode === "view" && (
              <div className="flex border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
                {[
                  { id: "specyfikacja", label: "Specyfikacja technologiczna", icon: BookOpen },
                  { id: "kalkulator", label: "Kalkulator kosztów", icon: Calculator },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setKartaTab(tab.id as any)}
                    className="flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-widest transition-all border-b-2"
                    style={{
                      borderColor: kartaTab === tab.id ? 'var(--accent)' : 'transparent',
                      color: kartaTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* CIAŁO KARTY */}
            <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
              <form id="receptura-form" onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
                {/* SEKCJA: Specyfikacja + BOM */}
                {(isEditMode || kartaTab === "specyfikacja") && (
                  <div className="flex flex-col flex-1 min-h-0 p-4 gap-3">

                    {/* Meta — kompaktowy pasek */}
                    <div className="flex items-center gap-3 shrink-0 flex-wrap" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
                      {isEditMode ? (
                        <>
                          <div className="flex flex-col gap-0.5 flex-1 min-w-[200px]">
                            <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Produkt docelowy *</label>
                            <select value={docelowyId} onChange={e => setDocelowyId(e.target.value)} required
                              className="text-sm font-bold outline-none"
                              style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)' }}>
                              <option value="">Wybierz produkt…</option>
                              {produkty.map(a => <option key={a.id} value={a.id}>{a.nazwa} ({a.kod_towaru})</option>)}
                            </select>
                          </div>
                          <div style={{ width: 1, height: 32, background: 'var(--border)' }} />
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Wersja</label>
                            <input type="number" value={wersja} onChange={e => setWersja(parseInt(e.target.value) || 1)} min={1}
                              className="w-16 text-sm font-mono font-bold outline-none text-center"
                              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', padding: '2px 6px' }} />
                          </div>
                          <div style={{ width: 1, height: 32, background: 'var(--border)' }} />
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Trwałość (dni)</label>
                            <input type="text" value={dniTrwalosci} onChange={e => setDniTrwalosci(e.target.value)} placeholder="—"
                              className="w-20 text-sm font-mono font-bold outline-none text-center"
                              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', padding: '2px 6px' }} />
                          </div>
                          <div style={{ width: 1, height: 32, background: 'var(--border)' }} />
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Rozmiar wsadu ({selectedAsortyment?.jednostka_miary || 'j.m.'}) <span title="Wyliczane jako suma składników" style={{ color: 'var(--accent)', opacity: 0.7 }}>Σ</span></label>
                            <div className="w-20 text-sm font-mono font-bold text-center"
                              style={{ background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', padding: '2px 6px', opacity: 0.7 }}>
                              {parseFloat(wielkoscProdukcji) || 0}
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex flex-col gap-0.5 flex-1">
                            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Produkt</span>
                            <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{kartaReceptura?.asortyment_docelowy.nazwa}</span>
                          </div>
                          <div style={{ width: 1, height: 32, background: 'var(--border)' }} />
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Wersja</span>
                            <span className="text-sm font-mono font-bold" style={{ color: 'var(--text-code)' }}>v{kartaReceptura?.numer_wersji}</span>
                          </div>
                          <div style={{ width: 1, height: 32, background: 'var(--border)' }} />
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Trwałość</span>
                            <span className="text-sm font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{kartaReceptura?.dni_trwalosci ? `${kartaReceptura.dni_trwalosci} dni` : '—'}</span>
                          </div>
                          <div style={{ width: 1, height: 32, background: 'var(--border)' }} />
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Rozmiar wsadu</span>
                            <span className="text-sm font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{kartaReceptura?.wielkosc_produkcji ?? 1} {kartaReceptura?.asortyment_docelowy.jednostka_miary}</span>
                          </div>
                          <div style={{ width: 1, height: 32, background: 'var(--border)' }} />
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Składniki</span>
                            <span className="text-sm font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{kartaReceptura?.skladniki.length} poz.</span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* BOM — tabela składników */}
                    <div className="flex-1 min-h-0 flex flex-col rounded overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                      {/* Nagłówek tabeli */}
                      <div className="flex items-center justify-between px-3 py-2 shrink-0" style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                          BOM — na {isEditMode ? (parseFloat(wielkoscProdukcji) || 1) : (kartaReceptura?.wielkosc_produkcji ?? 1)} {isEditMode ? (selectedAsortyment?.jednostka_miary || 'j.m.') : kartaReceptura?.asortyment_docelowy.jednostka_miary}
                        </span>
                        {isEditMode && (
                          <button type="button" data-testid="btn-dodaj-skladnik"
                            onClick={() => setSkladniki(prev => [...prev, { id_asortymentu_skladnika: "", ilosc_wymagana: "", czy_pomocnicza: false }])}
                            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest btn-hover-effect px-2 py-1 rounded"
                            style={{ color: 'var(--accent)', background: 'rgba(59,130,246,.1)', border: '1px solid rgba(59,130,246,.2)' }}>
                            <Plus className="w-3 h-3" /> Dodaj surowiec
                          </button>
                        )}
                      </div>

                      {/* Nagłówki kolumn */}
                      <div className="grid shrink-0 text-[10px] font-bold uppercase tracking-widest px-2 py-1.5"
                        style={{ gridTemplateColumns: isEditMode ? '24px 1fr 90px 100px 28px' : '24px 1fr 100px 90px 80px', background: 'var(--bg-app)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', gap: 6 }}>
                        <div>#</div>
                        <div>Surowiec</div>
                        <div className="text-right">Ilość / 1 JM</div>
                        <div>{isEditMode ? 'Jednostka' : 'Jednostka'}</div>
                        {!isEditMode && <div style={{ color: 'var(--text-muted)' }}>Typ</div>}
                        {isEditMode && <div />}
                      </div>

                      {/* Wiersze */}
                      <div className="overflow-y-auto flex-1">
                        {isEditMode ? (
                          skladniki.length === 0 ? (
                            <div className="text-center py-8 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}
                              onClick={() => setSkladniki(prev => [...prev, { id_asortymentu_skladnika: "", ilosc_wymagana: "", czy_pomocnicza: false }])}>
                              Brak składników — kliknij aby dodać
                            </div>
                          ) : (
                            skladniki.map((s, idx) => {
                              const asort = surowce.find(a => a.id === s.id_asortymentu_skladnika);
                              return (
                                <div key={idx} className="grid items-center px-2 py-1.5 border-b hover:bg-[#1e293b] transition-colors"
                                  style={{ gridTemplateColumns: '24px 1fr 90px 100px 28px', borderColor: 'var(--border-dim)', gap: 6 }}>
                                  <span className="text-[11px] font-mono font-bold text-center" style={{ color: 'var(--text-muted)' }}>{idx + 1}</span>
                                  <select value={s.id_asortymentu_skladnika}
                                    onChange={e => { const v = e.target.value; setSkladniki(prev => { const n=[...prev]; n[idx]={...n[idx], id_asortymentu_skladnika:v, czy_pomocnicza:false}; return n; }); }}
                                    className="text-xs font-semibold outline-none w-full"
                                    style={{ background:'var(--bg-input)', border:'1px solid var(--border)', borderRadius:4, color:'var(--text-primary)', padding:'4px 6px' }}>
                                    <option value="">Wybierz surowiec…</option>
                                    {surowce.map(a => <option key={a.id} value={a.id}>{a.nazwa} ({a.kod_towaru})</option>)}
                                  </select>
                                  <input type="text" value={s.ilosc_wymagana} placeholder="0"
                                    onChange={e => { const v=e.target.value.replace(",","."); setSkladniki(prev => { const n=[...prev]; n[idx]={...n[idx], ilosc_wymagana:v}; return n; }); }}
                                    className="text-xs font-mono font-bold text-right outline-none w-full"
                                    style={{ background:'var(--bg-input)', border:'1px solid var(--border)', borderRadius:4, color:'#4ade80', padding:'4px 6px' }} />
                                  <select value={s.czy_pomocnicza ? "pomocnicza" : "podstawowa"}
                                    onChange={e => { const isPom=e.target.value==="pomocnicza"; setSkladniki(prev => { const n=[...prev]; n[idx]={...n[idx], czy_pomocnicza:isPom}; return n; }); }}
                                    className="text-[11px] font-bold outline-none w-full"
                                    style={{ background:'var(--bg-input)', border:'1px solid var(--border)', borderRadius:4, color:'var(--text-secondary)', padding:'4px 6px' }}>
                                    <option value="podstawowa">{asort?.jednostka_miary || 'j.m.'}</option>
                                    {asort?.jednostka_pomocnicza && <option value="pomocnicza">{asort.jednostka_pomocnicza}</option>}
                                  </select>
                                  <button type="button" onClick={() => setSkladniki(prev => prev.filter((_, i) => i !== idx))}
                                    className="flex items-center justify-center w-5 h-5 rounded transition-colors"
                                    style={{ color: 'var(--danger)' }}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              );
                            })
                          )
                        ) : (
                          kartaReceptura?.skladniki.map((s, i) => {
                            const typColors: Record<string,string> = { Surowiec:'rgba(59,130,246,.15)', Polprodukt:'rgba(245,158,11,.15)', Wyrob_Gotowy:'rgba(34,197,94,.15)' };
                            const typLabels: Record<string,string> = { Surowiec:'Sur.', Polprodukt:'Pół.', Wyrob_Gotowy:'WG' };
                            return (
                              <div key={i} className="grid items-center px-2 py-2 border-b hover:bg-[#1e293b] transition-colors"
                                style={{ gridTemplateColumns: '24px 1fr 100px 90px 80px', borderColor: 'var(--border-dim)', gap: 6 }}>
                                <span className="text-[11px] font-mono font-bold text-center" style={{ color: 'var(--text-muted)' }}>{i + 1}</span>
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{s.asortyment_skladnika.nazwa}</div>
                                  <div className="text-[10px] font-mono" style={{ color: 'var(--text-code)' }}>{s.asortyment_skladnika.kod_towaru}</div>
                                </div>
                                <div className="text-right font-mono font-bold text-sm" style={{ color: '#4ade80' }}>
                                  {fmtL(s.ilosc_wymagana * (kartaReceptura?.wielkosc_produkcji ?? 1), 3)}
                                </div>
                                <div className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
                                  {s.czy_pomocnicza ? s.asortyment_skladnika.jednostka_pomocnicza : s.asortyment_skladnika.jednostka_miary}
                                </div>
                                <div>
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: typColors[s.asortyment_skladnika.typ_asortymentu] || 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                                    {typLabels[s.asortyment_skladnika.typ_asortymentu] || s.asortyment_skladnika.typ_asortymentu}
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* SEKCJA: Kalkulator kosztów */}
                {kartaTab === "kalkulator" && kartaReceptura && (
                  <div className="space-y-4">
                    <h4 className="text-slate-400 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                      <Calculator className="w-3.5 h-3.5" />
                      Kalkulator kosztów
                    </h4>

                    {/* Parametry wsadu */}
                    <div className="flex items-end gap-4 flex-wrap">
                      <div>
                        <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Wielkość produkcji (JM)</label>
                        <input type="number" step="any" min="0.001" value={kalcWielkosc}
                          onChange={e => setKalcWielkosc(e.target.value)}
                          className="w-28 rounded px-3 py-2 text-sm font-mono outline-none focus:ring-1"
                          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Narzut (%)</label>
                        <input type="number" step="0.1" min="0" value={kalcNarzut}
                          onChange={e => setKalcNarzut(e.target.value)}
                          className="w-24 rounded px-3 py-2 text-sm font-mono outline-none focus:ring-1"
                          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                        />
                      </div>
                      <button type="button" onClick={saveKalcParametry} disabled={kalcLoading}
                        className="px-4 py-2 rounded text-sm font-semibold text-white btn-hover-effect disabled:opacity-50"
                        style={{ background: 'var(--accent)' }}>
                        {kalcLoading ? "Liczę…" : "Przelicz"}
                      </button>
                    </div>

                    {/* Tabela składników z kosztami */}
                    {kalkulacja && (
                      <div className="mes-panel rounded overflow-hidden">
                        <table className="mes-table">
                          <thead>
                            <tr>
                              <th>Składnik</th>
                              <th className="text-right">Ilość / JM</th>
                              <th className="text-right">Ilość (wsad)</th>
                              <th className="text-right">Udział</th>
                            </tr>
                          </thead>
                          <tbody>
                            {kalkulacja.wiersze.map((w: any) => (
                              <tr key={w.id_asortymentu}>
                                <td>
                                  <div className="font-medium text-white">{w.nazwa}</div>
                                  <div className="mono text-xs" style={{ color: 'var(--text-muted)' }}>{w.kod}</div>
                                </td>
                                <td className="text-right mono">{fmtL(w.ilosc_wymagana, 3)} <span className="opacity-50 text-xs">{w.jednostka}</span></td>
                                <td className="text-right mono font-medium text-white">{fmtL(w.ilosc_na_batch, 3)} <span className="opacity-50 text-xs">{w.jednostka}</span></td>
                                <td className="text-right mono text-xs" style={{ color: 'var(--text-muted)' }}>
                                  {w.udzial_procent > 0 ? `${fmtL(w.udzial_procent, 1)}%` : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {kalcLoading && <Spinner.Page />}
                  </div>
                )}
              </form>
            </div>

            {/* STOPKA z przyciskami zapisu */}
            {isEditMode && (
              <div className="p-4 border-t border-[#334155] bg-[#0f172a]/50 flex justify-between items-center shrink-0">
                <button type="button" onClick={kartaMode === "new" ? closeKarta : switchToView} className="px-5 py-2.5 text-slate-400 hover:bg-[#334155] rounded-xl font-semibold transition-colors">
                  Anuluj
                </button>
                <button
                  form="receptura-form"
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 min-h-[44px] transition-colors btn-hover-effect"
                >
                  <Save className="w-5 h-5" /> Zatwierdź i zapisz
                </button>
              </div>
            )}
            </div>
          </div>
        )}

      {/* LISTA RECEPTUR */}
      <div className="mes-panel rounded overflow-hidden flex-1 min-h-0 overflow-y-auto">
        {receptury.length === 0 ? (
          <EmptyState message="Baza receptur jest pusta. Zacznij od zdefiniowania technologii produkcji." />
        ) : (
          <table className="mes-table">
            <thead>
              <tr>
                <SortableTh label="Produkt"    field="produkt"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh label="Kod"        field="kod"        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh label="Wersja"     field="wersja"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh label="Składniki"  field="skladniki"  sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh label="Trwałość"   field="trwalosc"   sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh label="Status"     field="status"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {sortBy<Receptura>(
                (Object.values(
                  receptury.reduce<Record<string, Receptura[]>>((acc, r) => {
                    const pid = r.asortyment_docelowy.id;
                    if (!acc[pid]) acc[pid] = [];
                    acc[pid].push(r);
                    return acc;
                  }, {})
                ) as Receptura[][]).map(versions => [...versions].sort((a, b) => b.numer_wersji - a.numer_wersji)[0]),
                v => {
                  switch (sortKey) {
                    case 'kod':       return v.asortyment_docelowy.kod_towaru;
                    case 'wersja':    return v.numer_wersji;
                    case 'skladniki': return v.skladniki.length;
                    case 'trwalosc':  return v.dni_trwalosci ?? -1;
                    case 'status':    return v.czy_aktywne ? 0 : 1;
                    default:          return v.asortyment_docelowy.nazwa;
                  }
                },
                sortDir
              ).map(v => {
                const sorted = [...receptury.filter(r => r.asortyment_docelowy.id === v.asortyment_docelowy.id)].sort((a, b) => b.numer_wersji - a.numer_wersji);
                return (
                  <tr key={v.id} onClick={() => openView(v)} className={`cursor-pointer ${v.czy_aktywne ? '' : 'opacity-40'}`}>
                    <td className="font-medium text-white">{v.asortyment_docelowy.nazwa}</td>
                    <td className="mono" style={{ color: 'var(--text-code)' }}>{v.asortyment_docelowy.kod_towaru}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span className="mono font-bold" style={{ color: 'var(--text-primary)' }}>v{v.numer_wersji}</span>
                        {sorted.length > 1 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(99,102,241,0.15)', color: 'rgb(129,140,248)' }}>
                            {sorted.length} wersje
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{v.skladniki.length}</td>
                    <td className="mono" style={{ color: 'var(--text-secondary)' }}>{v.dni_trwalosci ? `${v.dni_trwalosci} dni` : '—'}</td>
                    <td>
                      {v.czy_aktywne
                        ? <span className="badge badge-ok">Aktywna</span>
                        : <span className="badge badge-neutral">Archiwalna</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
