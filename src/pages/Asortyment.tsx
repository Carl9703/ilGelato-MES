import React, { useState, useEffect } from "react";
import { Plus, Save, X, Package, ArrowLeft, History, FileText, Search } from "lucide-react";
import { fmtL, fmtDate } from "../utils/fmt";
import ConfirmModal from "../components/ConfirmModal";
import DocumentPreviewModal from "../components/DocumentPreviewModal";
import { SortableTh } from "../components/SortableTh";
import { sortBy, makeSortHandler, type SortDir } from "../utils/sortBy";
import { useToast } from "../components/Toast";
import { Spinner } from "../components/Spinner";
import { EmptyState } from "../components/EmptyState";



type AsortymentOgolne = { id: string; kod_towaru: string; nazwa: string; typ_asortymentu: string; jednostka_miary: string; jednostka_pomocnicza: string | null; przelicznik_jednostki: number | null; czy_wymaga_daty_waznosci: boolean; czy_aktywne: boolean; ilosc: number; rezerwacje: number; cena_srednia: number; };
type Podsumowanie = { stan_calkowity: number; zarezerwowane: number; dostepne: number; cena_srednia_wazona: number; wartosc_magazynowa: number };
type Zasob = { id_partii: string; numer_partii: string; stan: number; zarezerwowane: number; dostepne: number; cena_jednostkowa: number; wartosc: number; data_produkcji: string | null; termin_waznosci: string | null; status_partii: string; dokument_przyjecia: string | null };
type HistoriaRuch = { id: string; data: string; typ: string; referencja: string; partia: string; ilosc: number; cena_jednostkowa: number | null; saldo_po_operacji: number };

type AsortymentDetail = {
  ogolne: AsortymentOgolne;
  podsumowanie: Podsumowanie;
  zasoby: Zasob[];
  historia: HistoriaRuch[];
};

const UNITS = ["kg", "L", "szt", "ml", "g", "opak"];

const typy = ["Surowiec", "Polprodukt", "Wyrob_Gotowy", "Opakowanie"];
const typLabels: Record<string, string> = { Surowiec: "Surowiec", Polprodukt: "Półprodukt", Wyrob_Gotowy: "Wyrób gotowy", Opakowanie: "Opakowanie" };
const typColors: Record<string, string> = { Surowiec: "bg-blue-500/20 text-blue-300", Polprodukt: "bg-amber-500/20 text-amber-300", Wyrob_Gotowy: "bg-emerald-500/20 text-emerald-300", Opakowanie: "bg-purple-500/20 text-purple-300" };

export default function Asortyment() {
  const [items, setItems] = useState<AsortymentOgolne[]>([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sortKey, setSortKey] = useState("nazwa");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const handleSort = makeSortHandler(sortKey, setSortKey, setSortDir);
  const { showToast } = useToast();
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<AsortymentOgolne | null>(null);
  const [formData, setFormData] = useState({
    kod_towaru: "", nazwa: "", typ_asortymentu: "Surowiec", jednostka_miary: "kg",
    jednostka_pomocnicza: "", przelicznik_jednostki: "", czy_wymaga_daty_waznosci: false
  });

  // Detail view state
  const [selectedItem, setSelectedItem] = useState<AsortymentOgolne | null>(null);
  const [detailData, setDetailData] = useState<AsortymentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<"ogolne" | "zasoby" | "historia" | "odzywcze" | "alergeny">("ogolne");

  // Wartości odżywcze
  const [odzywczeForm, setOdzywczeForm] = useState<Record<string,string>>({});
  const [odzywczeSaving, setOdzywczeSaving] = useState(false);

  // Alergeny + pola tekstowe
  const [alergenyStan, setAlergenyStan] = useState<Record<string,boolean>>({});
  const [alergenySaving, setAlergenySaving] = useState(false);
  const [skladnikiOpisForm, setSkladnikiOpisForm] = useState({ producent: "", zrodlo_danych: "", skladniki_opis: "", moze_zawierac: "" });
  const [kartoSaving, setKartoSaving] = useState(false);

  const [confirmArchive, setConfirmArchive] = useState(false);

  // Document preview modal
  const [previewDocRef, setPreviewDocRef] = useState<string | null>(null);
  const [previewDocData, setPreviewDocData] = useState<any>(null);
  const [previewDocLoading, setPreviewDocLoading] = useState(false);

  const openDocPreview = async (ref: string) => {
    if (!ref || ref === "—") return;
    setPreviewDocRef(ref);
    setPreviewDocLoading(true);
    setPreviewDocData(null);
    try {
      const res = await fetch(`/api/dokumenty/podglad/${encodeURIComponent(ref)}`);
      if (res.ok) setPreviewDocData(await res.json());
    } catch {} finally { setPreviewDocLoading(false); }
  };

  useEffect(() => { fetchAll(); }, [showArchived]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (previewDocRef) { setPreviewDocRef(null); return; }
      if (showModal) { setShowModal(false); return; }
      if (selectedItem) { setSelectedItem(null); return; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [previewDocRef, showModal, selectedItem]);

  const fetchAll = async () => {
    try {
      const res = await fetch(`/api/asortyment?pokazArchiwalne=${showArchived}`);
      if (res.ok) setItems(await res.json());
    } catch (e) { console.error(e); }
  };

  const openNew = () => {
    setEditingItem(null);
    setFormData({ kod_towaru: "", nazwa: "", typ_asortymentu: "Surowiec", jednostka_miary: "kg", jednostka_pomocnicza: "", przelicznik_jednostki: "", czy_wymaga_daty_waznosci: false });
    setShowModal(true);
  };

  const openEdit = (a: AsortymentOgolne) => {
    setEditingItem(a);
    setFormData({
      kod_towaru: a.kod_towaru, nazwa: a.nazwa, typ_asortymentu: a.typ_asortymentu,
      jednostka_miary: a.jednostka_miary, jednostka_pomocnicza: a.jednostka_pomocnicza || "",
      przelicznik_jednostki: a.przelicznik_jednostki?.toString() || "", czy_wymaga_daty_waznosci: a.czy_wymaga_daty_waznosci
    });
    setShowModal(true);
  };

  const openDetail = async (a: AsortymentOgolne) => {
    setSelectedItem(a);
    setFormData({
      kod_towaru: a.kod_towaru, nazwa: a.nazwa, typ_asortymentu: a.typ_asortymentu,
      jednostka_miary: a.jednostka_miary, jednostka_pomocnicza: a.jednostka_pomocnicza || "",
      przelicznik_jednostki: a.przelicznik_jednostki?.toString() || "", czy_wymaga_daty_waznosci: a.czy_wymaga_daty_waznosci
    });
    setDetailTab("ogolne");
    loadDetail(a.id);
    // Pobierz wartości odżywcze i alergeny
    fetch(`/api/asortyment/${a.id}/odzywcze`).then(r => r.json()).then(d => {
      const FIELDS = ["porcja_g","energia_kj","energia_kcal","tluszcz","kwasy_nasycone","weglowodany","cukry","blonnik","bialko","sol"];
      const form: Record<string,string> = {};
      for (const f of FIELDS) form[f] = d?.[f] != null ? String(d[f]) : "";
      setOdzywczeForm(form);
    }).catch(() => {});
    fetch(`/api/asortyment/${a.id}/alergeny`).then(r => r.json()).then(d => {
      setAlergenyStan(d || {});
      setSkladnikiOpisForm({ producent: (a as any).producent || "", zrodlo_danych: (a as any).zrodlo_danych || "", skladniki_opis: (a as any).skladniki_opis || "", moze_zawierac: (a as any).moze_zawierac || "" });
    }).catch(() => {});
  };

  const saveOdzywcze = async () => {
    if (!selectedItem) return;
    setOdzywczeSaving(true);
    try {
      const r = await fetch(`/api/asortyment/${selectedItem.id}/odzywcze`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(odzywczeForm) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Błąd zapisu wartości odżywczych");
      showToast("Wartości odżywcze zapisane!", "ok");
    } catch (e: any) { showToast(e.message || "Błąd zapisu", "error"); } finally { setOdzywczeSaving(false); }
  };

  const saveAlergeny = async () => {
    if (!selectedItem) return;
    setAlergenySaving(true);
    try {
      const r1 = await fetch(`/api/asortyment/${selectedItem.id}/alergeny`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(alergenyStan) });
      if (!r1.ok) throw new Error((await r1.json().catch(() => ({}))).error || "Błąd zapisu alergenów");
      const r2 = await fetch(`/api/asortyment/${selectedItem.id}/kartoteka`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(skladnikiOpisForm) });
      if (!r2.ok) throw new Error((await r2.json().catch(() => ({}))).error || "Błąd zapisu kartoteki");
      showToast("Alergeny zapisane!", "ok");
    } catch (e: any) { showToast(e.message || "Błąd zapisu", "error"); } finally { setAlergenySaving(false); }
  };

  useEffect(() => {
    if (detailData?.ogolne) {
      const a = detailData.ogolne;
      setFormData({
        kod_towaru: a.kod_towaru,
        nazwa: a.nazwa,
        typ_asortymentu: a.typ_asortymentu,
        jednostka_miary: a.jednostka_miary,
        jednostka_pomocnicza: a.jednostka_pomocnicza || "",
        przelicznik_jednostki: a.przelicznik_jednostki?.toString() || "",
        czy_wymaga_daty_waznosci: a.czy_wymaga_daty_waznosci
      });
    }
  }, [detailData]);

  const toggleAktywne = async () => {
    if (!selectedItem) return;
    const aktywne = selectedItem.czy_aktywne;
    if (aktywne) { setConfirmArchive(true); return; }
    try {
      const res = await fetch(`/api/asortyment/${selectedItem.id}/restore`, { method: "PUT" });
      if (!res.ok) throw new Error((await res.json()).error);
      setSelectedItem({ ...selectedItem, czy_aktywne: true });
      showToast("Przywrócono z archiwum", "ok");
      fetchAll();
    } catch (err: any) { showToast(err.message, "error"); }
  };

  const doArchive = async () => {
    setConfirmArchive(false);
    if (!selectedItem) return;
    try {
      const res = await fetch(`/api/asortyment/${selectedItem.id}?archive=true`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      setSelectedItem({ ...selectedItem, czy_aktywne: false });
      showToast("Przeniesiono do archiwum", "ok");
      fetchAll();
    } catch (err: any) { showToast(err.message, "error"); }
  };

  const handleDetailSubmit = async () => {
    const pStr = formData.przelicznik_jednostki?.toString().replace(",", ".");
    const pNum = (pStr && pStr !== "") ? parseFloat(pStr) : null;
    
    const body = { 
      ...formData, 
      przelicznik_jednostki: pNum
    };
    try {
      const res = await fetch(`/api/asortyment/${selectedItem!.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json()).error);
      const updatedItem = await res.json();
      
      const mergedItem = { ...selectedItem, ...updatedItem };
      setSelectedItem(mergedItem);
      
      // Aktualizuj formData świeżymi danymi
      setFormData({
        kod_towaru: updatedItem.kod_towaru,
        nazwa: updatedItem.nazwa,
        typ_asortymentu: updatedItem.typ_asortymentu,
        jednostka_miary: updatedItem.jednostka_miary,
        jednostka_pomocnicza: updatedItem.jednostka_pomocnicza || "",
        przelicznik_jednostki: updatedItem.przelicznik_jednostki?.toString() || "",
        czy_wymaga_daty_waznosci: updatedItem.czy_wymaga_daty_waznosci
      });

      if (detailData) {
        setDetailData((prev) => prev ? { ...prev, ogolne: updatedItem } : null);
      }
      
      showToast("Zapisano zmiany!", "ok");
      fetchAll();
    } catch (err: any) { showToast(err.message, "error"); }
  };

  const loadDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/asortyment/${id}`);
      const data = await res.json();
      if (res.ok) {
        setDetailData(data);
      } else {
        showToast(data.error || "Błąd pobierania danych", "error");
      }
    } catch (err: any) {
      showToast("Błąd połączenia z serwerem", "error");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pStr = formData.przelicznik_jednostki?.toString().replace(",", ".");
    const pNum = (pStr && pStr !== "") ? parseFloat(pStr) : null;

    const body = {
      ...formData,
      przelicznik_jednostki: pNum
    };
    try {
      const url = editingItem ? `/api/asortyment/${editingItem.id}` : "/api/asortyment";
      const res = await fetch(url, { method: editingItem ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json()).error);
      setShowModal(false); showToast("Zapisano!", "ok"); fetchAll();
      if (selectedItem && editingItem?.id === selectedItem.id) loadDetail(selectedItem.id);
    } catch (err: any) { showToast(err.message, "error"); }
  };

  const fillZero = (n: number) => fmtL(n, 2);
  const fmtDateTime = (d: string) => new Date(d).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const filtered = sortBy<AsortymentOgolne>(
    items.filter(a => {
      const matchesFilter = filter === "all" || a.typ_asortymentu === filter;
      const matchesSearch = !search ||
        a.nazwa.toLowerCase().includes(search.toLowerCase()) ||
        a.kod_towaru.toLowerCase().includes(search.toLowerCase());
      return matchesFilter && matchesSearch;
    }),
    a => {
      switch (sortKey) {
        case 'kod_towaru':     return a.kod_towaru;
        case 'typ_asortymentu': return a.typ_asortymentu;
        case 'jednostka_miary': return a.jednostka_miary;
        case 'ilosc':          return a.ilosc;
        case 'rezerwacje':     return a.rezerwacje;
        case 'dostepne':       return a.ilosc - a.rezerwacje;
        default:               return a.nazwa;
      }
    },
    sortDir
  );

  // --- DETAIL VIEW ---
  if (selectedItem) {
    return (
      <div className="h-full flex flex-col gap-3 animate-view">
        {/* Header */}
        <div className="flex items-center gap-6 shrink-0">
          <button
            onClick={() => setSelectedItem(null)}
            className="flex items-center gap-2 px-3 py-2 rounded text-sm btn-hover-effect"
            style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-white">{selectedItem.nazwa}</h2>
              <span className={`badge ${
                selectedItem.typ_asortymentu === 'Surowiec' ? 'badge-info' :
                selectedItem.typ_asortymentu === 'Polprodukt' ? 'badge-warn' : 'badge-ok'
              }`}>{typLabels[selectedItem.typ_asortymentu]}</span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="mono" style={{ color: 'var(--text-code)' }}>{selectedItem.kod_towaru}</span>
              <span>·</span>
              <span>{selectedItem.jednostka_miary}</span>
            </div>
          </div>
          <button
            onClick={handleDetailSubmit}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-bold text-sm flex items-center gap-2 btn-hover-effect"
          >
            <Save className="w-4 h-4" /> Zapisz zmiany
          </button>
        </div>

        {/* Loading State */}
        {detailLoading && !detailData ? (
          <Spinner.Page />
        ) : detailData && (
          <>
            {/* Wskaźniki ERP — pasek statusu */}
            <div className="mes-panel rounded grid grid-cols-3 shrink-0">
              {[
                { label: "Stan całkowity", value: fillZero(detailData.podsumowanie.stan_calkowity), unit: selectedItem.jednostka_miary, color: 'var(--text-primary)' },
                { label: "Zarezerwowane",  value: fillZero(detailData.podsumowanie.zarezerwowane),  unit: selectedItem.jednostka_miary, color: 'var(--warn)' },
                { label: "Dostępne",       value: fillZero(detailData.podsumowanie.dostepne),       unit: selectedItem.jednostka_miary, color: 'var(--ok)' },
              ].map((stat, idx) => (
                <div key={idx} className="px-5 py-3 flex flex-col gap-1" style={{ borderLeft: idx > 0 ? '1px solid var(--border)' : 'none' }}>
                  <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{stat.label}</div>
                  <div className="font-mono font-bold text-lg leading-none" style={{ color: stat.color }}>
                    {stat.value} <span className="text-xs opacity-50 font-sans uppercase">{stat.unit}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Zakładki */}
            <div className="flex gap-0 rounded overflow-hidden shrink-0" style={{ border: '1px solid var(--border)' }}>
              {[
                { id: "ogolne", label: "Specyfikacja", icon: FileText },
                { id: "zasoby", label: "Zasoby / Partie", icon: Package },
                { id: "historia", label: "Dziennik zdarzeń", icon: History },
                { id: "odzywcze", label: "Wartości odżywcze", icon: null },
                { id: "alergeny", label: "Alergeny", icon: null },
              ].map((tab, i) => (
                <button
                  key={tab.id}
                  onClick={() => setDetailTab(tab.id as any)}
                  className="flex items-center gap-2 px-5 py-2 text-xs font-semibold transition-colors"
                  style={{
                    background: detailTab === tab.id ? 'var(--accent)' : 'var(--bg-surface)',
                    color: detailTab === tab.id ? '#fff' : 'var(--text-secondary)',
                    borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  {tab.icon && <tab.icon className="w-3.5 h-3.5" />}
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
            {/* Tab: ZASOBY */}
            {detailTab === "zasoby" && (
              <div className="mes-panel rounded overflow-hidden">
                {detailData.zasoby.length === 0 ? (
                  <EmptyState message="Brak zasobów na stanie." hint="Dodaj PZ w module Dokumenty." />
                ) : (
                  <table className="mes-table">
                    <thead>
                      <tr>
                        <th>Partia</th>
                        <th>Z dokumentu</th>
                        <th>Status</th>
                        <th>Ważność</th>
                        <th className="text-right">Stan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailData.zasoby.map(z => (
                        <tr key={z.id_partii}>
                          <td className="mono font-bold" style={{ color: 'var(--text-code)' }}>{z.numer_partii}</td>
                          <td>
                            {z.dokument_przyjecia && z.dokument_przyjecia !== "—" ? (
                              <button onClick={() => openDocPreview(z.dokument_przyjecia!)} className="mono hover:underline" style={{ color: 'var(--text-code)' }}>
                                {z.dokument_przyjecia}
                              </button>
                            ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                          </td>
                          <td>
                            <span className={`badge ${z.status_partii === "Dostepna" ? "badge-ok" : "badge-danger"}`}>{z.status_partii}</span>
                          </td>
                          <td style={{ color: 'var(--text-secondary)' }}>{fmtDate(z.termin_waznosci)}</td>
                          <td className="text-right">
                            <span className="font-bold text-white mono">{fillZero(z.stan)}</span>
                            <span className="text-xs ml-1 opacity-50">{selectedItem.jednostka_miary}</span>
                            {z.zarezerwowane > 0 && <div className="text-[10px]" style={{ color: 'var(--warn)' }}>Rez: {fillZero(z.zarezerwowane)}</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Tab: HISTORIA */}
            {detailTab === "historia" && (
              <div className="mes-panel rounded overflow-hidden">
                {detailData.historia.length === 0 ? (
                  <EmptyState message="Brak historii operacji." />
                ) : (
                  <table className="mes-table">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Dokument</th>
                        <th>Partia</th>
                        <th className="text-right">Ilość</th>
                        <th className="text-right">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailData.historia.map(h => (
                        <tr key={h.id}>
                          <td className="mono text-xs" style={{ color: 'var(--text-secondary)' }}>{fmtDateTime(h.data)}</td>
                          <td>
                            {(() => {
                              const typColor: Record<string,string> = { PZ:'#22c55e', PW:'#38bdf8', RW:'#ef4444', WZ:'#f97316' };
                              const typBg: Record<string,string> = { PZ:'rgba(34,197,94,.12)', PW:'rgba(56,189,248,.12)', RW:'rgba(239,68,68,.12)', WZ:'rgba(249,115,22,.12)' };
                              return (
                                <>
                                  <span style={{ display:'inline-block', padding:'1px 6px', borderRadius:3, fontSize:10, fontWeight:800, background: typBg[h.typ] || 'var(--bg-hover)', color: typColor[h.typ] || 'var(--text-muted)', border:`1px solid ${(typColor[h.typ] || '#666')}40`, marginRight:6 }}>{h.typ}</span>
                                  {h.referencja !== "—" ? (
                                    <button onClick={() => openDocPreview(h.referencja)} className="mono hover:underline" style={{ color: 'var(--text-code)' }}>{h.referencja}</button>
                                  ) : <span className="mono" style={{ color: 'var(--text-muted)' }}>—</span>}
                                </>
                              );
                            })()}
                          </td>
                          <td className="mono" style={{ color: 'var(--text-code)' }}>{h.partia}</td>
                          <td className={`text-right mono font-bold ${h.ilosc > 0 ? "text-emerald-400" : "text-red-400"}`}>{h.ilosc > 0 ? "+" : ""}{fillZero(h.ilosc)}</td>
                          <td className="text-right mono font-bold text-white">{fillZero(h.saldo_po_operacji)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Tab: WARTOŚCI ODŻYWCZE */}
            {detailTab === "odzywcze" && (
              <div className="mes-panel rounded">
                <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Wartości odżywcze na 100 g produktu</span>
                  <button onClick={saveOdzywcze} disabled={odzywczeSaving} className="px-4 py-1.5 rounded text-xs font-semibold text-white btn-hover-effect disabled:opacity-50" style={{ background: 'var(--accent)' }}>
                    {odzywczeSaving ? "Zapisywanie…" : "Zapisz"}
                  </button>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      { key: "porcja_g",        label: "Porcja bazowa",                   unit: "g"   },
                      { key: "energia_kj",       label: "Wartość energetyczna",            unit: "kJ"  },
                      { key: "energia_kcal",     label: "Wartość energetyczna",            unit: "kcal"},
                      { key: "tluszcz",          label: "Tłuszcz",                         unit: "g"   },
                      { key: "kwasy_nasycone",   label: "  w tym kwasy nasycone",          unit: "g"   },
                      { key: "weglowodany",      label: "Węglowodany",                     unit: "g"   },
                      { key: "cukry",            label: "  w tym cukry",                   unit: "g"   },
                      { key: "blonnik",          label: "Błonnik",                         unit: "g"   },
                      { key: "bialko",           label: "Białko",                          unit: "g"   },
                      { key: "sol",              label: "Sól",                             unit: "g"   },
                    ].map(({ key, label, unit }) => (
                      <div key={key} className="flex items-center gap-3 px-3 py-2 rounded" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                        <span className="flex-1 text-xs" style={{ color: key.startsWith("  ") ? 'var(--text-muted)' : 'var(--text-secondary)', paddingLeft: key.startsWith("  ") ? 12 : 0 }}>{label.trim()}</span>
                        <input
                          type="number" step="any" min="0"
                          value={odzywczeForm[key] ?? ""}
                          onChange={e => setOdzywczeForm(f => ({ ...f, [key]: e.target.value }))}
                          className="w-24 text-right rounded px-2 py-1 text-sm font-mono outline-none focus:ring-1"
                          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                          placeholder="—"
                        />
                        <span className="w-8 text-xs text-right" style={{ color: 'var(--text-muted)' }}>{unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tab: ALERGENY */}
            {detailTab === "alergeny" && (() => {
              const ALERGENY_EU = [
                { key: "gluten",           label: "Zboża zawierające gluten" },
                { key: "skorupiaki",       label: "Skorupiaki i produkty pochodne" },
                { key: "jaja",             label: "Jaja i produkty jajeczne" },
                { key: "ryby",             label: "Ryby i produkty rybne" },
                { key: "orzeszki_ziemne",  label: "Orzeszki ziemne (arachidowe)" },
                { key: "soja",             label: "Soja i produkty sojowe" },
                { key: "mleko",            label: "Mleko i produkty mleczne (laktoza)" },
                { key: "orzechy",          label: "Orzechy drzewne" },
                { key: "seler",            label: "Seler i produkty pochodne" },
                { key: "gorczyca",         label: "Gorczyca i produkty pochodne" },
                { key: "sezam",            label: "Nasiona sezamu" },
                { key: "dwutlenek_siarki", label: "Dwutlenek siarki i siarczany (>10 mg/kg)" },
                { key: "lubin",            label: "Łubin i produkty z łubinu" },
                { key: "mieczaki",         label: "Mięczaki i produkty pochodne" },
              ];
              return (
                <div className="space-y-4">
                  <div className="mes-panel rounded">
                    <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
                      <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>14 alergenów wg rozp. UE 1169/2011</span>
                      <button onClick={saveAlergeny} disabled={alergenySaving} className="px-4 py-1.5 rounded text-xs font-semibold text-white btn-hover-effect disabled:opacity-50" style={{ background: 'var(--accent)' }}>
                        {alergenySaving ? "Zapisywanie…" : "Zapisz wszystko"}
                      </button>
                    </div>
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-1">
                      {ALERGENY_EU.map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-3 px-3 py-2.5 rounded cursor-pointer transition-colors" style={{ background: alergenyStan[key] ? 'rgba(239,68,68,0.08)' : 'var(--bg-surface)', border: `1px solid ${alergenyStan[key] ? 'rgba(239,68,68,0.3)' : 'var(--border)'}` }}>
                          <input
                            type="checkbox"
                            checked={!!alergenyStan[key]}
                            onChange={e => setAlergenyStan(s => ({ ...s, [key]: e.target.checked }))}
                            className="w-4 h-4 rounded accent-red-500"
                          />
                          <span className="text-sm" style={{ color: alergenyStan[key] ? '#f87171' : 'var(--text-secondary)' }}>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="mes-panel rounded p-4 space-y-3">
                    <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>Pola etykietowe</div>
                    {[
                      { key: "producent",      label: "Producent / Dostawca",         mono: false },
                      { key: "zrodlo_danych",  label: "Źródło danych (np. WŁASNE)",   mono: false },
                    ].map(({ key, label, mono }) => (
                      <div key={key}>
                        <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{label}</label>
                        <input
                          type="text"
                          value={(skladnikiOpisForm as any)[key]}
                          onChange={e => setSkladnikiOpisForm(f => ({ ...f, [key]: e.target.value }))}
                          className={`w-full rounded px-3 py-2 text-sm outline-none focus:ring-1 ${mono ? 'font-mono' : ''}`}
                          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                        />
                      </div>
                    ))}
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Składniki (do etykiety)</label>
                      <textarea rows={3} value={skladnikiOpisForm.skladniki_opis} onChange={e => setSkladnikiOpisForm(f => ({ ...f, skladniki_opis: e.target.value }))}
                        className="w-full rounded px-3 py-2 text-sm outline-none focus:ring-1 resize-none"
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Może zawierać (śladowe alergeny)</label>
                      <textarea rows={2} value={skladnikiOpisForm.moze_zawierac} onChange={e => setSkladnikiOpisForm(f => ({ ...f, moze_zawierac: e.target.value }))}
                        className="w-full rounded px-3 py-2 text-sm outline-none focus:ring-1 resize-none"
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Tab: OGOLNE */}
            {detailTab === "ogolne" && (
              <div className="mes-panel rounded p-5 grid grid-cols-1 lg:grid-cols-3 gap-5 animate-view">
                <div className="lg:col-span-2 space-y-5">
                  <div className="bg-[#0f172a] p-4 rounded-xl border border-[#334155] space-y-4">
                    <h4 className="text-slate-400 text-xs font-bold uppercase tracking-widest">Podstawowe informacje</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-slate-400 text-xs font-bold uppercase mb-1">Nazwa produktu</label>
                        <input type="text" value={formData.nazwa} onChange={e => setFormData({ ...formData, nazwa: e.target.value })} required
                          className="w-full bg-[#334155] border border-[#475569] text-white rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 font-medium" />
                      </div>
                      <div>
                        <label className="block text-slate-400 text-xs font-bold uppercase mb-1">Kod (indeks)</label>
                        <input type="text" value={formData.kod_towaru} onChange={e => setFormData({ ...formData, kod_towaru: e.target.value })} required
                          className="w-full bg-[#334155] border border-[#475569] text-white rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 font-mono font-bold" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#0f172a] p-4 rounded-xl border border-[#334155] space-y-4">
                    <h4 className="text-slate-400 text-xs font-bold uppercase tracking-widest">Logistyka i jednostki</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-slate-400 text-xs font-bold uppercase mb-1">Kategoria</label>
                        <select value={formData.typ_asortymentu} onChange={e => setFormData({ ...formData, typ_asortymentu: e.target.value })}
                          className="w-full bg-[#334155] border border-[#475569] text-white rounded-xl px-4 py-2.5 outline-none focus:border-blue-500">
                          {typy.map(t => <option key={t} value={t}>{typLabels[t]}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-slate-400 text-xs font-bold uppercase mb-1">Jednostka bazowa</label>
                        <select value={formData.jednostka_miary} onChange={e => setFormData({ ...formData, jednostka_miary: e.target.value })}
                          className="w-full bg-[#334155] border border-[#475569] text-white rounded-xl px-4 py-2.5 outline-none focus:border-blue-500">
                          {UNITS.map(j => <option key={j} value={j}>{j}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-slate-400 text-xs font-bold uppercase mb-1">Jednostka pomocnicza</label>
                        <select value={formData.jednostka_pomocnicza || ""} onChange={e => setFormData({ ...formData, jednostka_pomocnicza: e.target.value || null })}
                          className="w-full bg-[#334155] border border-[#475569] text-white rounded-xl px-4 py-2.5 outline-none focus:border-blue-500">
                          <option value="">Brak</option>
                          {UNITS.map(j => <option key={j} value={j}>{j}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-[#0f172a] rounded-xl p-4 border border-[#334155] flex flex-col gap-4">
                   <h4 className="text-slate-400 text-xs font-bold uppercase tracking-widest">Parametry zaawansowane</h4>
                   <div className="space-y-3">
                     <div className="flex items-center justify-between p-3 bg-[#1e293b] rounded-xl border border-[#334155]">
                       <div className="text-sm font-medium text-white">Wymaga daty ważności</div>
                       <input
                         type="checkbox"
                         checked={formData.czy_wymaga_daty_waznosci}
                         onChange={e => setFormData({...formData, czy_wymaga_daty_waznosci: e.target.checked})}
                         className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
                       />
                     </div>
                     {formData.jednostka_pomocnicza && (
                       <div className="p-3 bg-[#1e293b] rounded-xl border border-[#334155]">
                         <label className="text-slate-400 text-[10px] font-bold uppercase tracking-widest block mb-2">Przelicznik jednostek</label>
                            <div className="flex items-center gap-3">
                              <span className="text-slate-500 text-xs font-bold font-mono">1 {formData.jednostka_miary} =</span>
                              <input type="text" value={formData.przelicznik_jednostki} onChange={e => setFormData({ ...formData, przelicznik_jednostki: e.target.value })} className="w-24 bg-[#334155] border border-[#475569] text-white rounded-lg px-2 py-1.5 outline-none focus:border-blue-500 font-mono font-bold text-center" />
                              <span className="text-slate-500 text-xs font-bold font-mono">{formData.jednostka_pomocnicza}</span>
                            </div>
                          </div>
                        )}
                      </div>
                     <div
                       className="flex items-center justify-between p-3 bg-[#1e293b] rounded-xl border border-[#334155] cursor-pointer select-none"
                       onClick={toggleAktywne}
                     >
                       <div>
                         <div className="text-sm font-medium text-white">Kartoteka aktywna</div>
                         <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                           {selectedItem.czy_aktywne ? "Widoczna w systemie" : "Zarchiwizowana — ukryta w listach"}
                         </div>
                       </div>
                       <div className={`w-10 h-5 rounded-full transition-colors relative ${selectedItem.czy_aktywne ? 'bg-emerald-500' : 'bg-slate-600'}`}>
                         <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${selectedItem.czy_aktywne ? 'translate-x-5' : 'translate-x-0.5'}`} />
                       </div>
                     </div>
                   </div>
                </div>
            )}
            </div>
          </>
        )}

        {/* Document Preview Modal */}
        {previewDocRef && (
          <DocumentPreviewModal
            docRef={previewDocRef}
            docData={previewDocData}
            loading={previewDocLoading}
            onClose={() => setPreviewDocRef(null)}
            zIndex={1060}
          />
        )}
      <ConfirmModal
        isOpen={confirmArchive}
        title="Archiwizacja kartoteki"
        message={`Czy na pewno chcesz zarchiwizować "${selectedItem?.nazwa}"? Kartoteka zostanie ukryta w listach systemu.`}
        confirmText="Archiwizuj"
        cancelText="Anuluj"
        onConfirm={doArchive}
        onCancel={() => setConfirmArchive(false)}
      />
      </div>
    );
  }

  // --- MAIN LIST VIEW ---
  return (
    <>
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-lg border border-[#334155] overflow-hidden">
            <div className="flex justify-between items-center p-5 border-b border-[#334155]">
              <h3 className="text-lg font-bold text-white">{editingItem ? "Edycja kartoteki" : "Nowy asortyment"}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-white p-2 rounded-lg hover:bg-[#334155]"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 text-xs font-bold uppercase mb-1">Kod towaru <span className="text-red-400">*</span></label>
                  <input type="text" value={formData.kod_towaru} onChange={e => setFormData({ ...formData, kod_towaru: e.target.value })} required className="w-full bg-[#334155] border border-[#475569] text-white rounded-xl px-4 py-3 outline-none focus:border-indigo-500 font-mono" autoFocus />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs font-bold uppercase mb-1">Typ <span className="text-red-400">*</span></label>
                  <select value={formData.typ_asortymentu} onChange={e => setFormData({ ...formData, typ_asortymentu: e.target.value })} className="w-full bg-[#334155] border border-[#475569] text-white rounded-xl px-4 py-3 outline-none focus:border-indigo-500">
                    {typy.map(t => <option key={t} value={t}>{typLabels[t]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-slate-400 text-xs font-bold uppercase mb-1">Nazwa <span className="text-red-400">*</span></label>
                <input type="text" value={formData.nazwa} onChange={e => setFormData({ ...formData, nazwa: e.target.value })} required className="w-full bg-[#334155] border border-[#475569] text-white rounded-xl px-4 py-3 outline-none focus:border-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 text-xs font-bold uppercase mb-1">Jednostka miary <span className="text-red-400">*</span></label>
                  <select value={formData.jednostka_miary} onChange={e => setFormData({ ...formData, jednostka_miary: e.target.value })} className="w-full bg-[#334155] border border-[#475569] text-white rounded-xl px-4 py-3 outline-none focus:border-indigo-500">
                    {UNITS.map(j => <option key={j} value={j}>{j}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 text-xs font-bold uppercase mb-1">J.M. pomocnicza</label>
                  <select value={formData.jednostka_pomocnicza || ""} onChange={e => setFormData({ ...formData, jednostka_pomocnicza: e.target.value || null })} className="w-full bg-[#334155] border border-[#475569] text-white rounded-xl px-4 py-3 outline-none focus:border-indigo-500">
                    <option value="">Brak</option>
                    {UNITS.map(j => <option key={j} value={j}>{j}</option>)}
                  </select>
                </div>
              </div>
              {formData.jednostka_pomocnicza && (
                <div>
                  <label className="block text-slate-400 text-xs font-bold uppercase mb-1">Przelicznik (1 {formData.jednostka_miary} = ? {formData.jednostka_pomocnicza})</label>
                  <input type="text" value={formData.przelicznik_jednostki} onChange={e => setFormData({ ...formData, przelicznik_jednostki: e.target.value })} className="w-full bg-[#334155] border border-[#475569] text-white rounded-xl px-4 py-3 outline-none focus:border-indigo-500 font-mono" placeholder="np. 1.5 lub 1,5" />
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 text-slate-400 font-semibold hover:bg-[#334155] rounded-xl transition-colors">Anuluj</button>
                <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2"><Save className="w-5 h-5" />Zapisz</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="h-full flex flex-col gap-3 animate-view">
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white tracking-wide">Asortyment</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Centralna kartoteka i zarządzanie zapasami</p>
          </div>
          <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 rounded text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white btn-hover-effect"><Plus className="w-4 h-4" />Dodaj towar</button>
        </div>

        <div className="flex flex-col lg:flex-row gap-2 items-center shrink-0">
          <div className="flex gap-1 shrink-0">
            {["all", ...typy].map(t => (
              <button key={t} onClick={() => setFilter(t)}
                className="px-4 py-2 rounded text-xs font-semibold transition-colors btn-hover-effect"
                style={{
                  background: filter === t ? 'var(--accent)' : 'var(--bg-panel)',
                  color: filter === t ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}>
                {t === "all" ? "Wszystkie" : typLabels[t]}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowArchived(v => !v)}
            className="px-4 py-2 rounded text-xs font-semibold transition-colors btn-hover-effect shrink-0"
            style={{
              background: showArchived ? 'var(--warn)' : 'var(--bg-panel)',
              color: showArchived ? '#fff' : 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
          >
            {showArchived ? "Ukryj archiwalne" : "Pokaż archiwalne"}
          </button>

          <div className="relative flex-1 group">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
            <input 
              type="text" 
              placeholder="Szukaj po nazwie lub kodzie towaru..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full glass-card border-white/5 text-white rounded-xl pl-14 pr-6 py-2.5 outline-none focus:border-indigo-500/50 focus:bg-white/5 transition-all font-bold placeholder:text-slate-600"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white p-2">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="mes-panel rounded overflow-hidden flex-1 min-h-0 overflow-y-auto">
          {filtered.length === 0 ? (
            <EmptyState message="Brak pozycji spełniających kryteria." hint="Zmień filtr lub wyszukiwane hasło." />
          ) : (
            <table className="mes-table">
              <thead>
                <tr>
                  <SortableTh label="Kod"          field="kod_towaru"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Nazwa"         field="nazwa"           sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Typ"           field="typ_asortymentu" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="J.M."          field="jednostka_miary" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Ilość"         field="ilosc"           sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-right" />
                  <SortableTh label="Zarezerwowane" field="rezerwacje"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-right" />
                  <SortableTh label="Dostępne"      field="dostepne"        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-right" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => (
                  <tr key={a.id} onClick={() => openDetail(a)} style={!a.czy_aktywne ? { opacity: 0.5, background: 'repeating-linear-gradient(135deg, transparent, transparent 6px, rgba(0,0,0,0.15) 6px, rgba(0,0,0,0.15) 12px)' } : {}}>
                    <td className="mono" style={{ color: 'var(--text-code)' }}>{a.kod_towaru}</td>
                    <td className="font-medium" style={{ color: a.czy_aktywne ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {a.nazwa}
                      {!a.czy_aktywne && <span className="ml-2 text-[10px] font-bold uppercase tracking-widest opacity-60">archiwum</span>}
                    </td>
                    <td>
                      <span className={`badge ${
                        a.typ_asortymentu === 'Surowiec' ? 'badge-info' :
                        a.typ_asortymentu === 'Polprodukt' ? 'badge-warn' : 'badge-ok'
                      }`}>{typLabels[a.typ_asortymentu]}</span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{a.jednostka_miary}</td>
                    <td className="text-right mono font-medium text-white">{fillZero(a.ilosc)}</td>
                    <td className={`text-right mono font-medium ${a.rezerwacje > 0 ? 'text-amber-400' : ''}`} style={a.rezerwacje <= 0 ? { color: 'var(--text-muted)' } : {}}>
                      {fillZero(a.rezerwacje)}
                    </td>
                    <td className={`text-right mono font-medium ${(a.ilosc - a.rezerwacje) > 0 ? 'text-emerald-400' : ''}`} style={(a.ilosc - a.rezerwacje) <= 0 ? { color: 'var(--text-muted)' } : {}}>
                      {fillZero(a.ilosc - a.rezerwacje)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
