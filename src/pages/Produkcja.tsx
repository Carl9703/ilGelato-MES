import React, { useState, useEffect } from "react";
import { Plus, Save, X, Factory, AlertCircle, Play, Trash2, CheckCircle2, AlertTriangle, Database, Clock, Clipboard, MapPin, FileText, ChevronDown, ChevronUp, Package, Trash, Eye, Printer, Check, RotateCcw, Zap, Calendar, BarChart2, Calculator } from "lucide-react";
import AsortymentSelektor, { WybranyTowar } from "../components/AsortymentSelektor";
import { fmtL } from "../utils/fmt";
import ConfirmModal from "../components/ConfirmModal";

type Asortyment = { id: string; kod_towaru: string; nazwa: string; jednostka_miary: string; jednostka_pomocnicza?: string | null; przelicznik_jednostki?: number | null };
type SkladnikReceptury = { 
  id_asortymentu_skladnika: string; 
  ilosc_wymagana: number; 
  procent_strat?: number;
  czy_pomocnicza: boolean;
  asortyment_skladnika: Asortyment; 
  sugerowane_partie?: { id: string; numer_partii: string; termin_waznosci: string | null; stan: number }[] 
};
type Receptura = { id: string; numer_wersji: number; wielkosc_produkcji: number; asortyment_docelowy: Asortyment; skladniki: SkladnikReceptury[]; utworzono_dnia: string };
type RuchMagazynowy = { id: string; typ_ruchu: string; ilosc: number; referencja_dokumentu: string | null; utworzono_dnia: string; partia: { id_asortymentu: string; numer_partii: string; termin_waznosci: string | null; asortyment: Asortyment } };
type OpakowaniePozycja = { id_asortymentu: string; nazwa: string; waga_kg: number };
type Zlecenie = {
  id: string;
  numer_zlecenia: string | null;
  id_receptury: string;
  planowana_ilosc_wyrobu: number;
  rzeczywista_ilosc_wyrobu?: number;
  opakowania?: OpakowaniePozycja[];
  status: string;
  utworzono_dnia: string;
  receptura: Receptura;
  ruchy_magazynowe: RuchMagazynowy[];
  rezerwacje?: any[];
  numer_partii_wyrobu?: string;
};

export default function Produkcja() {
  const [zlecenia, setZlecenia] = useState<Zlecenie[]>([]);
  const [receptury, setReceptury] = useState<Receptura[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [itemToRealize, setItemToRealize] = useState<Zlecenie | null>(null);
  const [rzeczywistaIlosc, setRzeczywistaIlosc] = useState<string>("");
  const [zuzytePartie, setZuzytePartie] = useState<{ [ingredId: string]: Array<{ id_partii: string, ilosc: number }> }>({});
  const [activePicker, setActivePicker] = useState<{ ingredId: string, skladnik: SkladnikReceptury } | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [recepturaId, setRecepturaId] = useState("");
  const [ilosc, setIlosc] = useState(1);
  const [filter, setFilter] = useState<string>("all");
  const [pickListZlecenie, setPickListZlecenie] = useState<Zlecenie | null>(null);
  const [activeTab, setActiveTab] = useState<"product" | "materials">("product");
  const [viewZlecenie, setViewZlecenie] = useState<Zlecenie | null>(null);
  const [showSelektor, setShowSelektor] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<WybranyTowar | null>(null);
  const [selectedRecId, setSelectedRecId] = useState("");
  const [planowanaIlosc, setPlanowanaIlosc] = useState("1");
  const [stockData, setStockData] = useState<Record<string, number>>({});

  const bomData = React.useMemo(() => {
    if (!selectedRecId) return null;
    const skladniki = receptury.find(r => r.id === selectedRecId)?.skladniki ?? [];
    const qtyNum = parseFloat(planowanaIlosc.replace(",", ".")) || 0;
    const anyShortage = skladniki.some(s => {
      const req = qtyNum * s.ilosc_wymagana * (1 + (s.procent_strat || 0) / 100);
      const available = stockData[s.id_asortymentu_skladnika] ?? 0;
      return req > 0 && available < req;
    });
    return { skladniki, qtyNum, anyShortage };
  }, [selectedRecId, receptury, planowanaIlosc, stockData]);
  
  // Page-level tabs
  const [pageTab, setPageTab] = useState<"zlecenia" | "rozliczenie" | "koszty">("zlecenia");

  // Rozliczenie produkcji
  type Receptura2 = { id: string; numer_wersji: number; asortyment_docelowy: { nazwa: string; kod_towaru: string; typ_asortymentu: string; jednostka_miary: string }; skladniki: any[] };
  const [recepturyAll, setRecepturyAll] = useState<Receptura2[]>([]);
  const [planIlosci, setPlanIlosci] = useState<Record<string, string>>({});
  const [rozliczenie, setRozliczenie] = useState<any>(null);
  const [rozliczLoading, setRozliczLoading] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editIlosc, setEditIlosc] = useState("");

  // Pakowanie w realizacji
  const [opakowaniaWpisy, setOpakowaniaWpisy] = useState<Array<{ id_asortymentu: string; nazwa: string; waga_kg: string }>>([]);
  const [dostepneOpakowania, setDostepneOpakowania] = useState<Array<{ id: string; nazwa: string }>>([]);

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

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (!selectedRecId) { setStockData({}); return; }
    const rec = receptury.find(r => r.id === selectedRecId);
    if (!rec || rec.skladniki.length === 0) return;
    fetch("/api/asortyment")
      .then(r => r.json())
      .then((items: any[]) => {
        const ids = new Set(rec.skladniki.map(s => s.id_asortymentu_skladnika));
        const map: Record<string, number> = {};
        items.forEach(item => { if (ids.has(item.id)) map[item.id] = item.ilosc ?? 0; });
        setStockData(map);
      })
      .catch(() => {});
  }, [selectedRecId, receptury]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (previewDocRef) { setPreviewDocRef(null); return; }
      if (activePicker) { setActivePicker(null); return; }
      if (showSelektor) { setShowSelektor(false); return; }
      if (itemToRealize) { setItemToRealize(null); return; }
      if (pickListZlecenie) { setPickListZlecenie(null); return; }
      if (viewZlecenie) { setViewZlecenie(null); return; }
      if (isAdding) { setIsAdding(false); return; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [previewDocRef, activePicker, showSelektor, itemToRealize, pickListZlecenie, viewZlecenie, isAdding]);

  const fetchData = async () => {
    try {
      const [zlecRes, recRes] = await Promise.all([fetch("/api/produkcja"), fetch("/api/receptury")]);
      if (zlecRes.ok) {
        const data: Zlecenie[] = await zlecRes.json();
        setZlecenia(data);
        // Sync open detail view
        setViewZlecenie(prev => prev ? data.find(z => z.id === prev.id) || null : null);
      }
      if (recRes.ok) { const rec = await recRes.json(); setReceptury(rec); setRecepturyAll(rec); }
    } catch {}
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    if (!selectedProduct || !selectedRecId) { setError("Wybierz produkt i recepturę."); return; }
    
    try {
      const qtyNum = parseFloat(planowanaIlosc.replace(",", "."));
      if (isNaN(qtyNum) || qtyNum <= 0) throw new Error("Podaj poprawną ilość.");

      const res = await fetch("/api/produkcja", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ 
          id_receptury: selectedRecId,
          planowana_ilosc_wyrobu: qtyNum 
        }) 
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }

      setIsAdding(false); 
      setSelectedProduct(null); 
      setSelectedRecId("");
      setPlanowanaIlosc("1");
      setSuccess("Zlecenie zostało utworzone!"); 
      fetchData(); 
      setTimeout(() => setSuccess(""), 2000);
    } catch (err: any) { 
      setError(err.message); 
    }
  };

  const onSelektorConfirm = (items: WybranyTowar[]) => {
    if (items.length === 0) return;
    const product = items[0];
    const availableRecs = receptury.filter(r => r.asortyment_docelowy.id === product.id_asortymentu);
    
    if (availableRecs.length === 0) {
       setError(`Produkt ${product.nazwa} nie posiada aktywnej receptury.`);
       return;
    }

    setSelectedProduct(product);
    // Wybierz najnowszą wersję domyślnie
    const defaultRec = availableRecs[0];
    setSelectedRecId(defaultRec.id);
    setPlanowanaIlosc(String(defaultRec.wielkosc_produkcji ?? 1));
    setShowSelektor(false);
    setIsAdding(true);
  };

  const handleStartProduction = async (z: Zlecenie) => {
    setError("");
    try {
      const res = await fetch(`/api/produkcja/${z.id}/rozpocznij`, { method: "POST" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setSuccess("Zlecenie rozpoczęte! Surowce zarezerwowane."); fetchData(); setTimeout(() => setSuccess(""), 2000);
    } catch (err: any) { setError(err.message); }
  };

  const handleSaveEdit = async () => {
    if (!viewZlecenie) return;
    setError("");
    try {
      const qty = parseFloat(editIlosc.replace(",", "."));
      if (isNaN(qty) || qty <= 0) { setError("Podaj prawidłową ilość."); return; }
      const res = await fetch(`/api/produkcja/${viewZlecenie.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planowana_ilosc_wyrobu: qty }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setSuccess("Zlecenie zaktualizowane."); fetchData(); setTimeout(() => setSuccess(""), 2000);
    } catch (err: any) { setError(err.message); }
  };

  const handleRealizuj = async (z: Zlecenie) => {
    setError(""); setItemToRealize(z); setRzeczywistaIlosc(z.planowana_ilosc_wyrobu.toString());
    setOpakowaniaWpisy([]);
    fetch("/api/asortyment")
      .then(r => r.json())
      .then((items: any[]) => setDostepneOpakowania(items.filter(a => a.typ_asortymentu === "Opakowanie" && a.czy_aktywne)))
      .catch(() => {});
    const initialValues: { [ingredId: string]: Array<{ id_partii: string, ilosc: number }> } = {};
    
    z.receptura?.skladniki?.forEach(s => {
      const ingId = s.asortyment_skladnika?.id;
      let required = s.ilosc_wymagana * z.planowana_ilosc_wyrobu * (1 + (s.procent_strat || 0) / 100);
      if (s.czy_pomocnicza && s.asortyment_skladnika?.przelicznik_jednostki) {
        required = required / s.asortyment_skladnika.przelicznik_jednostki;
      }
      required = Math.round(required * 100) / 100; // Round to 2 decimals

      const allocation: Array<{ id_partii: string, ilosc: number }> = [];
      let remaining = required;

      // Sort suggested batches by expiry date (FEFO) - just in case backend didn't
      const sortedBatches = [...(s.sugerowane_partie || [])].sort((a, b) => {
        if (!a.termin_waznosci) return 1;
        if (!b.termin_waznosci) return -1;
        return new Date(a.termin_waznosci).getTime() - new Date(b.termin_waznosci).getTime();
      });

      for (const p of sortedBatches) {
        if (remaining <= 0) break;
        const stan = p.stan;
        if (stan <= 0) continue;
        
        const take = Math.round(Math.min(stan, remaining) * 100) / 100;
        if (take > 0) {
          allocation.push({ id_partii: p.id, ilosc: take });
          remaining = Math.round((remaining - take) * 100) / 100;
        }
      }
      initialValues[ingId] = allocation;
    });

    setZuzytePartie(initialValues);
  };

  const confirmRealizuj = async () => {
    if (!itemToRealize) return;
    const qtyStr = rzeczywistaIlosc.toString().replace(",", ".");
    const qtyNum = parseFloat(qtyStr);
    if (isNaN(qtyNum) || qtyNum <= 0) { setError("Ilość musi być > 0"); return; }
    const payload = (Object.values(zuzytePartie) as Array<Array<{ id_partii: string; ilosc: number }>>).flatMap(arr => arr).filter(p => p.id_partii && p.ilosc > 0);
    try {
      const opakowaniaDo = opakowaniaWpisy
        .filter(o => o.id_asortymentu && parseFloat(o.waga_kg.replace(",", ".")) > 0)
        .map(o => ({ id_asortymentu: o.id_asortymentu, nazwa: o.nazwa, waga_kg: parseFloat(o.waga_kg.replace(",", ".")) }));
      const res = await fetch(`/api/produkcja/${itemToRealize.id}/realizuj`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rzeczywista_ilosc: qtyNum, zuzyte_partie: payload, opakowania: opakowaniaDo }) });
      if (!res.ok) { const d = await res.json(); setError(d.error); return; }
      setItemToRealize(null); setSuccess("Zlecenie zrealizowane!"); fetchData(); setTimeout(() => setSuccess(""), 2000);
    } catch { setError("Błąd realizacji"); }
  };

  const handleDelete = async (id: string) => {
    try { await fetch(`/api/produkcja/${id}`, { method: "DELETE" }); fetchData(); } catch {}
  };

  const handlePrintZP = (z: Zlecenie) => {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("pl-PL") : "—";
    const statusLabel: Record<string, string> = { Planowane: "Planowane", W_toku: "W toku", Zrealizowane: "Zrealizowane", Anulowane: "Anulowane" };

    let skladnikiHTML = "";
    if (z.status === "Planowane") {
      skladnikiHTML = (z.receptura?.skladniki || []).map(s => {
        const qty = fmtL(s.ilosc_wymagana * z.planowana_ilosc_wyrobu * (1 + (s.procent_strat || 0) / 100), 3);
        const partia = s.sugerowane_partie?.[0]?.numer_partii || "—";
        return `<tr><td>${s.asortyment_skladnika?.nazwa}</td><td style="font-family:monospace;color:#3b82f6">${partia}</td><td style="text-align:right;font-weight:700">${qty} ${s.asortyment_skladnika?.jednostka_miary}</td></tr>`;
      }).join("");
    } else if (z.status === "W_toku") {
      const skladniki = z.receptura?.skladniki || [];
      skladnikiHTML = skladniki.map(s => {
        const rezerwacje = (z.rezerwacje || []).filter((r: any) =>
          (r.id_partii && r.partia?.id_asortymentu === s.asortyment_skladnika?.id) || (r.id_asortymentu === s.asortyment_skladnika?.id)
        );
        const suma = rezerwacje.reduce((acc: number, r: any) => acc + (r.ilosc_zarezerwowana || 0), 0);
        const partia = rezerwacje[0]?.partia?.numer_partii || "Rez. ilościowa";
        return `<tr><td>${s.asortyment_skladnika?.nazwa}</td><td style="font-family:monospace;color:#3b82f6">${partia}</td><td style="text-align:right;font-weight:700">${fmtL(suma, 3)} ${s.asortyment_skladnika?.jednostka_miary}</td></tr>`;
      }).join("");
    } else {
      skladnikiHTML = (z.ruchy_magazynowe || []).filter(r => r.typ_ruchu === "Zuzycie").map(r =>
        `<tr><td>${r.partia?.asortyment?.nazwa}</td><td style="font-family:monospace;color:#3b82f6">${r.partia?.numer_partii}</td><td style="text-align:right;font-weight:700;color:#16a34a">${fmtL(Math.abs(r.ilosc), 3)} ${r.partia?.asortyment?.jednostka_miary}</td></tr>`
      ).join("");
    }

    const wyrobHTML = z.numer_partii_wyrobu
      ? `<tr><td>Nr partii wyrobu</td><td style="font-family:monospace;color:#3b82f6">${z.numer_partii_wyrobu}</td></tr>` : "";

    win.document.write(`<!DOCTYPE html><html><head><title>${z.numer_zlecenia || "ZP"}</title><style>
      body{font-family:Inter,system-ui,sans-serif;padding:40px;color:#1e293b;max-width:800px;margin:0 auto}
      h1{font-size:24px;margin:0 0 4px}
      .meta{color:#64748b;font-size:13px;margin-bottom:24px}
      .badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;margin-left:8px;background:#e0e7ff;color:#4338ca}
      table{width:100%;border-collapse:collapse;margin-top:16px}
      th{text-align:left;padding:8px;border-bottom:2px solid #334155;font-size:12px;text-transform:uppercase;color:#64748b}
      td{padding:8px;border-bottom:1px solid #e5e7eb}
      .section-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin:24px 0 4px}
      .info-table td{border:none;padding:4px 8px}
      .info-table td:first-child{color:#64748b;width:160px}
      .info-table td:last-child{font-weight:700}
      @media print{body{padding:20px}@page{size:A4;margin:15mm}}
    </style></head><body>
    <h1>${z.numer_zlecenia || "ZP-TEMP"} <span class="badge">${statusLabel[z.status] || z.status}</span></h1>
    <div class="meta">${z.receptura?.asortyment_docelowy?.nazwa} · ${z.receptura?.asortyment_docelowy?.kod_towaru} · Wystawiono: ${fmt(z.utworzono_dnia)}</div>
    <div class="section-title">Parametry zlecenia</div>
    <table class="info-table"><tbody>
      <tr><td>Plan</td><td>${z.planowana_ilosc_wyrobu} ${z.receptura?.asortyment_docelowy?.jednostka_miary}</td></tr>
      ${z.rzeczywista_ilosc_wyrobu != null ? `<tr><td>Wykonano</td><td style="color:#16a34a">${z.rzeczywista_ilosc_wyrobu} ${z.receptura?.asortyment_docelowy?.jednostka_miary}</td></tr>` : ""}
      ${wyrobHTML}
      <tr><td>Status</td><td>${statusLabel[z.status] || z.status}</td></tr>
    </tbody></table>
    ${z.opakowania && z.opakowania.length > 0 ? `
    <div class="section-title">Pakowanie</div>
    <table><thead><tr><th>Opakowanie</th><th style="text-align:right">Waga</th></tr></thead><tbody>
    ${z.opakowania.map(op => `<tr><td>${op.nazwa}</td><td style="text-align:right;font-weight:700">${op.waga_kg.toFixed(3).replace('.', ',')} kg</td></tr>`).join("")}
    <tr style="border-top:2px solid #334155"><td style="font-weight:700">Razem</td><td style="text-align:right;font-weight:900">${z.opakowania.reduce((s, o) => s + o.waga_kg, 0).toFixed(3).replace('.', ',')} kg</td></tr>
    </tbody></table>` : ""}
    <div class="section-title">Zapotrzebowanie i zużycie surowców</div>
    <table><thead><tr><th>Surowiec</th><th>Nr Partii</th><th style="text-align:right">Ilość</th></tr></thead><tbody>${skladnikiHTML}</tbody></table>
    </body></html>`);
    win.document.close();
    win.print();
  };

  const getStatusStyle = (s: string) => {
    switch (s) {
      case "Planowane": return "badge-info";
      case "W_toku": return "badge-warn";
      case "Zrealizowane": return "badge-ok";
      case "Anulowane": return "bg-rose-500/20 text-rose-400 border border-rose-500/20";
      default: return "badge-neutral";
    }
  };

  const filtered = zlecenia.filter(z => filter === "all" || z.status === filter);

  const handleRozlicz = async () => {
    const pozycje = (Object.entries(planIlosci) as [string, string][])
      .map(([id_receptury, ilosc]) => ({ id_receptury, ilosc_produkcji: parseFloat(ilosc) || 0 }))
      .filter(p => p.ilosc_produkcji > 0);
    if (pozycje.length === 0) return;
    setRozliczLoading(true);
    setRozliczenie(null);
    try {
      const res = await fetch("/api/produkcja/rozliczenie", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pozycje }) });
      if (res.ok) setRozliczenie(await res.json());
    } catch {} finally { setRozliczLoading(false); }
  };

  return (
    <div className="h-full flex flex-col gap-3 animate-view">
      {success && <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 p-3 rounded-xl text-sm font-semibold flex items-center gap-2 shrink-0"><CheckCircle2 className="w-4 h-4 shrink-0" /> {success}</div>}
      {error && !itemToRealize && <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-3 rounded-xl text-sm font-semibold flex items-center gap-2 shrink-0"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</div>}

      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-lg font-bold text-white tracking-wide">Produkcja</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Zlecenia i realizacja produkcji</p>
        </div>
        {pageTab === "zlecenia" && !isAdding && (
          <button onClick={() => setShowSelektor(true)} data-testid="btn-nowe-zlecenie" className="flex items-center gap-2 px-4 py-2 rounded text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white btn-hover-effect">
            <Plus className="w-4 h-4" /> Nowe zlecenie
          </button>
        )}
        {pageTab === "rozliczenie" && (
          <button onClick={handleRozlicz} disabled={rozliczLoading} className="flex items-center gap-2 px-4 py-2 rounded text-sm font-semibold text-white btn-hover-effect disabled:opacity-50" style={{ background: 'var(--accent)' }}>
            <Calculator className="w-4 h-4" /> {rozliczLoading ? "Liczę…" : "Rozlicz"}
          </button>
        )}
      </div>

      {/* Page Tab Bar */}
      <div className="flex gap-0 rounded overflow-hidden w-fit shrink-0" style={{ border: '1px solid var(--border)' }}>
        {[
          { id: "zlecenia",     label: "Zlecenia produkcji", icon: Factory },
          { id: "rozliczenie",  label: "Rozliczenie produkcji", icon: BarChart2 },
          { id: "koszty",       label: "Koszty produkcji", icon: Calculator },
        ].map((tab, i) => (
          <button key={tab.id} onClick={() => setPageTab(tab.id as any)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold transition-colors"
            style={{
              background: pageTab === tab.id ? 'var(--accent)' : 'var(--bg-surface)',
              color: pageTab === tab.id ? '#fff' : 'var(--text-secondary)',
              borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
            }}>
            <tab.icon className="w-3.5 h-3.5" />{tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
      {/* ══════════ TAB: ROZLICZENIE PRODUKCJI ══════════ */}
      {pageTab === "rozliczenie" && (
        <div className="space-y-4">
          <div className="mes-panel rounded overflow-hidden">
            <div className="px-4 py-3 border-b text-xs font-bold uppercase tracking-widest" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>
              Wpisz planowane ilości produkcji
            </div>
            <table className="mes-table">
              <thead>
                <tr>
                  <th>Produkt</th>
                  <th>Kod</th>
                  <th>Typ</th>
                  <th>Składniki</th>
                  <th className="text-right" style={{ width: 140 }}>Ilość produkcji</th>
                  <th style={{ width: 60 }}>J.M.</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Grupuj po typie asortymentu
                  const typy: Record<string, typeof recepturyAll> = {};
                  for (const r of recepturyAll) {
                    const t = r.asortyment_docelowy.typ_asortymentu;
                    if (!typy[t]) typy[t] = [];
                    typy[t].push(r);
                  }
                  const typLabels: Record<string,string> = { Wyrob_Gotowy: "Wyroby gotowe", Polprodukt: "Półprodukty", Surowiec: "Surowce" };
                  return Object.entries(typy).flatMap(([typ, recs]) => [
                    <tr key={`hdr-${typ}`} style={{ background: 'var(--bg-surface)' }}>
                      <td colSpan={6} className="px-3 py-1.5 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                        {typLabels[typ] || typ}
                      </td>
                    </tr>,
                    ...recs.sort((a,b) => a.asortyment_docelowy.nazwa.localeCompare(b.asortyment_docelowy.nazwa)).map(r => (
                      <tr key={r.id}>
                        <td className="font-medium text-white">{r.asortyment_docelowy.nazwa}</td>
                        <td className="mono" style={{ color: 'var(--text-code)' }}>{r.asortyment_docelowy.kod_towaru}</td>
                        <td><span className="badge badge-neutral text-xs">{typLabels[r.asortyment_docelowy.typ_asortymentu] || r.asortyment_docelowy.typ_asortymentu}</span></td>
                        <td style={{ color: 'var(--text-muted)' }}>{r.skladniki.length}</td>
                        <td className="text-right">
                          <input
                            type="number" min="0" step="any"
                            value={planIlosci[r.id] || ""}
                            onChange={e => setPlanIlosci(prev => ({ ...prev, [r.id]: e.target.value }))}
                            placeholder="0"
                            className="w-24 text-right rounded px-2 py-1 text-sm font-mono outline-none focus:ring-1"
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                          />
                        </td>
                        <td className="mono text-xs" style={{ color: 'var(--text-muted)' }}>{r.asortyment_docelowy.jednostka_miary}</td>
                      </tr>
                    )),
                  ]);
                })()}
              </tbody>
            </table>
          </div>

          {/* Wyniki rozliczenia produktów */}
          {rozliczenie && rozliczenie.produkty.length > 0 && (
            <div className="mes-panel rounded overflow-hidden">
              <div className="px-4 py-3 border-b text-xs font-bold uppercase tracking-widest" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>
                Raport zużycia — produkty
              </div>
              <table className="mes-table">
                <thead>
                  <tr>
                    <th>Produkt</th>
                    <th>Kod</th>
                    <th className="text-right">Ilość</th>
                    <th className="text-right">Koszt / JM</th>
                    <th className="text-right">Wartość</th>
                  </tr>
                </thead>
                <tbody>
                  {rozliczenie.produkty.map((p: any) => (
                    <tr key={p.id_receptury}>
                      <td className="font-medium text-white">{p.nazwa}</td>
                      <td className="mono" style={{ color: 'var(--text-code)' }}>{p.kod}</td>
                      <td className="text-right mono font-medium text-white">{fmtL(p.ilosc_produkcji, 3)} <span className="opacity-50 text-xs">{p.jednostka}</span></td>
                      <td className="text-right mono" style={{ color: 'var(--text-secondary)' }}>{fmtL(p.koszt_jm, 2)} PLN</td>
                      <td className="text-right mono font-bold" style={{ color: 'var(--ok)' }}>{fmtL(p.wartosc, 2)} PLN</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg-surface)' }}>
                    <td colSpan={4} className="px-3 py-2 text-xs font-black uppercase" style={{ color: 'var(--text-muted)' }}>Suma końcowa</td>
                    <td className="px-3 py-2 text-right font-black mono text-white">{fmtL(rozliczenie.suma_produkty, 2)} PLN</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════ TAB: KOSZTY PRODUKCJI ══════════ */}
      {pageTab === "koszty" && (
        <div className="space-y-4">
          {!rozliczenie ? (
            <div className="mes-panel rounded p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              Najpierw uzupełnij ilości w zakładce <strong className="text-white">Rozliczenie produkcji</strong> i kliknij „Rozlicz".
            </div>
          ) : rozliczenie.skladniki.length === 0 ? (
            <div className="mes-panel rounded p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Brak danych do wyświetlenia.</div>
          ) : (
            <div className="mes-panel rounded overflow-hidden">
              <div className="px-4 py-3 border-b text-xs font-bold uppercase tracking-widest" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>
                Raport zużycia surowców
              </div>
              <table className="mes-table">
                <thead>
                  <tr>
                    <th>Składnik</th>
                    <th>Kod</th>
                    <th>J.M.</th>
                    <th className="text-right">Zużycie</th>
                    <th className="text-right">Cena śr.</th>
                    <th className="text-right">Wartość</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const typLabels: Record<string,string> = { Wyrob_Gotowy: "Wyroby gotowe", Polprodukt: "Półprodukty", Surowiec: "Surowce", Opakowanie: "Opakowania" };
                    const grouped: Record<string, any[]> = {};
                    for (const s of rozliczenie.skladniki) {
                      if (!grouped[s.typ]) grouped[s.typ] = [];
                      grouped[s.typ].push(s);
                    }
                    return Object.entries(grouped).flatMap(([typ, items]) => {
                      const suma = items.reduce((s: number, i: any) => s + i.wartosc, 0);
                      return [
                        <tr key={`hdr-${typ}`} style={{ background: 'var(--bg-surface)' }}>
                          <td colSpan={6} className="px-3 py-1.5 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                            {typLabels[typ] || typ}
                          </td>
                        </tr>,
                        ...items.map((s: any) => (
                          <tr key={s.id_asortymentu}>
                            <td className="font-medium text-white">{s.nazwa}</td>
                            <td className="mono text-xs" style={{ color: 'var(--text-code)' }}>{s.kod}</td>
                            <td className="mono text-xs" style={{ color: 'var(--text-muted)' }}>{s.jednostka}</td>
                            <td className="text-right mono font-medium text-white">{fmtL(s.zuzycie, 3)}</td>
                            <td className="text-right mono" style={{ color: s.cena_srednia > 0 ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                              {s.cena_srednia > 0 ? `${fmtL(s.cena_srednia, 2)} PLN` : '—'}
                            </td>
                            <td className="text-right mono font-bold" style={{ color: 'var(--ok)' }}>
                              {s.wartosc > 0 ? `${fmtL(s.wartosc, 2)} PLN` : '—'}
                            </td>
                          </tr>
                        )),
                        <tr key={`sum-${typ}`} style={{ background: 'var(--bg-surface)' }}>
                          <td colSpan={5} className="px-3 py-1.5 text-xs font-bold text-right" style={{ color: 'var(--text-muted)' }}>{typLabels[typ] || typ} Razem</td>
                          <td className="px-3 py-1.5 text-right font-bold mono text-white">{fmtL(suma, 2)} PLN</td>
                        </tr>,
                      ];
                    });
                  })()}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg-surface)' }}>
                    <td colSpan={5} className="px-3 py-2 text-xs font-black uppercase" style={{ color: 'var(--text-muted)' }}>Suma końcowa</td>
                    <td className="px-3 py-2 text-right font-black mono text-white">{fmtL(rozliczenie.suma_skladniki, 2)} PLN</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════ TAB: ZLECENIA (istniejąca zawartość) ══════════ */}
      {pageTab === "zlecenia" && <>

      {/* Filter Bar */}
      <div className="flex gap-1 bg-[#0f172a] p-1 rounded-xl w-fit border border-[#334155]">
        {[{ id: "all", label: "Wszystkie" }, { id: "Planowane", label: "Planowane" }, { id: "W_toku", label: "W toku" }, { id: "Zrealizowane", label: "Zrealizowane" }].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${filter === f.id ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* New Order Modal / Karta Planowania */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-4xl border border-[#334155] overflow-hidden flex flex-col" style={{ height: '90vh' }}>

            <div className="flex items-center justify-between p-5 border-b border-[#334155] bg-blue-900/20 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600/20 flex items-center justify-center border border-blue-500/30">
                  <Factory className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{selectedProduct?.nazwa || "Nowe zlecenie produkcji"}</h3>
                  <p className="text-slate-500 text-xs">{selectedProduct?.kod_towaru || "Kreator zlecenia ZP"}</p>
                </div>
              </div>
              <button onClick={() => { setIsAdding(false); setSelectedProduct(null); setError(""); }} className="text-slate-500 hover:text-white p-2 rounded-lg hover:bg-[#334155] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
               {error && (
                 <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-3 rounded-xl text-sm font-semibold flex items-center gap-2">
                   <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                 </div>
               )}

               <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-4">
                     <h4 className="text-slate-400 text-xs font-bold uppercase tracking-widest">Parametry wyjściowe</h4>

                     <div className="space-y-3">
                        <div className="space-y-1.5">
                          <label className="text-slate-400 text-xs font-semibold">Wersja receptury</label>
                          <select
                            value={selectedRecId}
                            onChange={(e) => {
                              const rec = receptury.find(r => r.id === e.target.value);
                              setSelectedRecId(e.target.value);
                              if (rec) setPlanowanaIlosc(String(rec.wielkosc_produkcji ?? 1));
                            }}
                            className="w-full bg-[#334155] border border-[#475569] text-white rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 transition-colors font-semibold appearance-none"
                          >
                            {receptury
                              .filter(r => r.asortyment_docelowy.id === selectedProduct?.id_asortymentu)
                              .map(r => (
                                <option key={r.id} value={r.id}>Wersja v{r.numer_wersji} ({new Date(r.utworzono_dnia).toLocaleDateString()})</option>
                              ))
                            }
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-slate-400 text-xs font-semibold">Ilość planowana</label>
                          <div className="relative">
                            <input
                              type="text"
                              value={planowanaIlosc}
                              onChange={(e) => setPlanowanaIlosc(e.target.value)}
                              className="w-full bg-[#334155] border border-[#475569] text-white rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 transition-colors font-mono font-bold text-right pr-16"
                              placeholder="0.000"
                            />
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-xs pointer-events-none">
                              {selectedProduct?.jednostka_miary}
                            </div>
                          </div>
                        </div>
                     </div>
                  </div>

                  <div className="space-y-4">
                     <h4 className="text-slate-400 text-xs font-bold uppercase tracking-widest">Bilans materiałowy</h4>
                     {bomData ? (
                       <>
                         {bomData.anyShortage && (
                           <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--warn)' }}>
                             <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                             Niewystarczające stany magazynowe — zlecenie można zaplanować, ale rezerwacja może się nie udać.
                           </div>
                         )}
                         <div className="bg-[#0f172a] p-4 rounded-xl border border-[#334155] space-y-2">
                           <div className="flex justify-between text-xs text-slate-500 font-semibold mb-1 px-0.5">
                             <span>Składnik</span>
                             <span className="flex gap-6 text-right">
                               <span className="w-20">Potrzeba</span>
                               <span className="w-20">Dostępne</span>
                             </span>
                           </div>
                           {bomData.skladniki.map(s => {
                             const req = bomData.qtyNum * s.ilosc_wymagana * (1 + (s.procent_strat || 0) / 100);
                             const available = stockData[s.id_asortymentu_skladnika] ?? 0;
                             const shortage = req > 0 && available < req;
                             const jm = s.czy_pomocnicza ? s.asortyment_skladnika.jednostka_pomocnicza : s.asortyment_skladnika.jednostka_miary;
                             return (
                               <div key={s.asortyment_skladnika.id} className="flex justify-between items-center">
                                 <span className={`text-sm truncate pr-4 ${shortage ? 'text-red-400' : 'text-slate-400'}`}>{s.asortyment_skladnika.nazwa}</span>
                                 <span className="flex gap-6 text-right">
                                   <span className="text-blue-300 font-mono text-sm font-bold whitespace-nowrap w-20">
                                     {fmtL(req, 3)} <span className="text-slate-500 text-xs">{jm}</span>
                                   </span>
                                   <span className={`font-mono text-sm font-bold whitespace-nowrap w-20 ${shortage ? 'text-red-400' : 'text-green-400'}`}>
                                     {fmtL(available, 3)} <span className="text-slate-500 text-xs">{jm}</span>
                                   </span>
                                 </span>
                               </div>
                             );
                           })}
                         </div>
                       </>
                     ) : (
                       <div className="h-32 flex items-center justify-center bg-[#0f172a] rounded-xl border border-dashed border-[#334155]">
                         <p className="text-slate-600 text-xs">Wybierz recepturę by zobaczyć BOM</p>
                       </div>
                     )}
                  </div>
               </div>
            </div>

            <div className="p-4 border-t border-[#334155] bg-[#0f172a]/50 flex justify-between items-center shrink-0">
              <button onClick={() => { setIsAdding(false); setSelectedProduct(null); setError(""); }} className="px-5 py-2.5 text-slate-400 hover:bg-[#334155] rounded-xl font-semibold transition-colors">
                Anuluj
              </button>
              <button
                onClick={handleSubmit}
                disabled={!selectedProduct}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 min-h-[44px] transition-colors"
              >
                <Save className="w-4 h-4" /> Utwórz zlecenie
              </button>
            </div>
          </div>
        </div>
      )}

        {showSelektor && (
          <AsortymentSelektor 
            tryb="prod" 
            typy={["Polprodukt", "Wyrob_Gotowy"]}
            singleSelect={true}
            onClose={() => setShowSelektor(false)} 
            onConfirm={onSelektorConfirm} 
          />
        )}

      {/* Orders List */}
      <div className="mes-panel rounded overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            Brak zleceń produkcyjnych. Wybierz produkt i recepturę aby zaplanować partię.
          </div>
        ) : (
          <table className="mes-table">
            <thead>
              <tr>
                <th>Nr zlecenia</th>
                <th>Produkt</th>
                <th>Status</th>
                <th className="text-right">Plan</th>
                <th className="text-right">Wykonano</th>
                <th>Data</th>
                <th>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(z => (
                <tr key={z.id} className="cursor-pointer" onClick={() => { setViewZlecenie(z); setEditIlosc(z.planowana_ilosc_wyrobu.toString()); }} style={z.status === "Anulowane" ? { opacity: 0.45 } : undefined}>
                  <td className="mono font-medium" style={{ color: 'var(--text-code)' }}>
                    {z.numer_zlecenia || z.id.substring(0, 8)}
                  </td>
                  <td className="text-white font-medium">
                    {z.receptura.asortyment_docelowy.nazwa}
                    <span className="ml-1.5 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>v{z.receptura.numer_wersji}</span>
                  </td>
                  <td>
                    <span className={`badge ${getStatusStyle(z.status)}`}>
                      {z.status === "W_toku" ? "W toku" : z.status}
                    </span>
                  </td>
                  <td className="text-right mono">{z.planowana_ilosc_wyrobu} <span className="text-xs opacity-50">{z.receptura.asortyment_docelowy.jednostka_miary}</span></td>
                  <td className="text-right mono" style={{ color: z.rzeczywista_ilosc_wyrobu ? 'var(--ok)' : 'var(--text-muted)' }}>
                    {z.rzeczywista_ilosc_wyrobu ?? '—'}
                  </td>
                  <td className="mono text-xs" style={{ color: 'var(--text-secondary)' }}>{new Date(z.utworzono_dnia).toLocaleDateString("pl-PL")}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      {z.status === "Planowane" && (
                        <button onClick={() => handleStartProduction(z)} className="px-3 py-1.5 rounded text-xs font-medium btn-hover-effect text-white" style={{ background: '#d97706' }}>
                          <Clock className="w-3.5 h-3.5 inline mr-1" />Rozpocznij
                        </button>
                      )}
                      {z.status === "W_toku" && (
                        <button onClick={() => handleRealizuj(z)} className="px-3 py-1.5 rounded text-xs font-medium btn-hover-effect text-white" style={{ background: '#16a34a' }}>
                          <Play className="w-3.5 h-3.5 inline mr-1" />Realizuj
                        </button>
                      )}
                      {z.status !== "Zrealizowane" && z.status !== "Anulowane" && (
                        <button onClick={() => setConfirmDeleteId(z.id)} className="px-2 py-1.5 rounded text-xs btn-hover-effect" style={{ color: 'var(--danger)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* View Zlecenie Detail Modal / Karta ERP */}
      {viewZlecenie && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-view">
          <div className="bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-6xl border border-[#334155] overflow-hidden flex flex-col" style={{ height: '95vh' }}>

            <div className="flex items-center justify-between p-5 border-b border-[#334155] shrink-0" style={{ background: viewZlecenie.status === "W_toku" ? 'rgba(217,119,6,0.15)' : viewZlecenie.status === "Zrealizowane" ? 'rgba(16,185,129,0.1)' : 'rgba(37,99,235,0.1)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center border" style={{ background: viewZlecenie.status === "W_toku" ? 'rgba(217,119,6,0.2)' : viewZlecenie.status === "Zrealizowane" ? 'rgba(16,185,129,0.15)' : 'rgba(37,99,235,0.15)', borderColor: viewZlecenie.status === "W_toku" ? 'rgba(217,119,6,0.3)' : viewZlecenie.status === "Zrealizowane" ? 'rgba(16,185,129,0.3)' : 'rgba(37,99,235,0.3)' }}>
                  <Factory className="w-5 h-5" style={{ color: viewZlecenie.status === "W_toku" ? '#f59e0b' : viewZlecenie.status === "Zrealizowane" ? '#10b981' : '#3b82f6' }} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">{viewZlecenie.numer_zlecenia || "ZP-TEMP"}</h3>
                    <span className={`badge ${getStatusStyle(viewZlecenie.status)}`}>{viewZlecenie.status?.replace("_", " ") || "Planowane"}</span>
                  </div>
                  <p className="text-slate-400 text-xs">
                    {viewZlecenie.receptura?.asortyment_docelowy?.nazwa}
                    <span className="ml-1.5 font-mono" style={{ color: 'var(--text-muted)' }}>· v{viewZlecenie.receptura?.numer_wersji}</span>
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handlePrintZP(viewZlecenie)} className="text-slate-500 hover:text-white p-2 rounded-lg hover:bg-[#334155] transition-colors" title="Drukuj">
                  <Printer className="w-5 h-5" />
                </button>
                <button onClick={() => setViewZlecenie(null)} className="text-slate-500 hover:text-white p-2 rounded-lg hover:bg-[#334155] transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left Column */}
              <div className="lg:col-span-4 space-y-4">
                <div className="bg-[#0f172a] p-4 rounded-xl border border-[#334155]">
                  <h4 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">Parametry produkcji</h4>
                  <div className="space-y-2.5">
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-slate-500 text-xs shrink-0">Plan</span>
                      {viewZlecenie.status === "Planowane" ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0.001"
                            step="any"
                            value={editIlosc}
                            onChange={e => setEditIlosc(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") handleSaveEdit(); }}
                            className="w-24 bg-[#1e293b] border border-[#334155] focus:border-blue-500 rounded-lg px-2 py-1 text-white font-mono text-sm text-right focus:outline-none"
                          />
                          <span className="text-slate-500 text-xs">{viewZlecenie.receptura?.asortyment_docelowy?.jednostka_miary}</span>
                        </div>
                      ) : (
                        <span className="text-white font-mono font-bold">
                          {viewZlecenie.planowana_ilosc_wyrobu} <span className="text-slate-500 text-xs">{viewZlecenie.receptura?.asortyment_docelowy?.jednostka_miary}</span>
                        </span>
                      )}
                    </div>
                    {viewZlecenie.rzeczywista_ilosc_wyrobu && (
                      <div className="flex justify-between items-center">
                        <span className="text-emerald-400 text-xs">Wykonano</span>
                        <span className="text-emerald-400 font-mono font-bold">
                          {viewZlecenie.rzeczywista_ilosc_wyrobu} <span className="text-slate-500 text-xs">{viewZlecenie.receptura?.asortyment_docelowy?.jednostka_miary}</span>
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-xs">Receptura</span>
                      <span className="text-slate-300 font-mono text-xs">v{viewZlecenie.receptura?.numer_wersji}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-xs">Kod towaru</span>
                      <span className="text-slate-300 font-mono text-xs">{viewZlecenie.receptura?.asortyment_docelowy?.kod_towaru}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-xs">Data</span>
                      <span className="text-slate-300 text-xs">{new Date(viewZlecenie.utworzono_dnia).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                {viewZlecenie.opakowania && viewZlecenie.opakowania.length > 0 && (
                  <div className="bg-[#0f172a] p-4 rounded-xl border border-[#334155]">
                    <h4 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">Pakowanie</h4>
                    <div className="space-y-1.5">
                      {viewZlecenie.opakowania.map((op, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span className="text-slate-300">{op.nazwa}</span>
                          <span className="font-mono font-bold text-white">{fmtL(op.waga_kg, 3)} kg</span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center text-sm pt-1 border-t border-[#334155]">
                        <span className="text-slate-500">Razem</span>
                        <span className="font-mono font-bold" style={{ color: 'var(--ok)' }}>
                          {fmtL(viewZlecenie.opakowania.reduce((s, o) => s + o.waga_kg, 0), 3)} kg
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {viewZlecenie.status === "Planowane" && (
                    <>
                      <button onClick={handleSaveEdit}
                        className="w-full text-white px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 min-h-[44px] transition-colors"
                        style={{ background: 'var(--accent)' }}>
                        <Save className="w-4 h-4" /> Zapisz zmiany
                      </button>
                      <button onClick={() => { handleStartProduction(viewZlecenie); setViewZlecenie(null); }}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 min-h-[44px] transition-colors">
                        <Clock className="w-4 h-4" /> Rozpocznij produkcję
                      </button>
                    </>
                  )}
                  {viewZlecenie.status === "W_toku" && (
                    <button onClick={() => { handleRealizuj(viewZlecenie); setViewZlecenie(null); }}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 min-h-[44px] transition-colors">
                      <Play className="w-4 h-4" /> Realizuj / Zakończ
                    </button>
                  )}
                </div>
              </div>

              {/* Right Column: Tables */}
              <div className="lg:col-span-8 space-y-4">
                <div className="mes-panel rounded overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-[#334155] flex items-center gap-2" style={{ background: 'var(--bg-surface)' }}>
                    <Database className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                    <span className="text-white font-semibold text-sm">Zapotrzebowanie i zużycie</span>
                  </div>
                  <table className="mes-table">
                    <thead>
                      <tr>
                        <th>Surowiec</th>
                        <th>Szczegóły / Partia</th>
                        <th className="text-right">Ilość</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewZlecenie.status === "Planowane" ? (
                        viewZlecenie.receptura?.skladniki?.map(s => (
                          <tr key={s.id_asortymentu_skladnika}>
                            <td className="font-semibold text-white">{s.asortyment_skladnika?.nazwa}</td>
                            <td className="mono text-xs" style={{ color: 'var(--text-code)' }}>
                              FEFO: {s.sugerowane_partie?.[0]?.numer_partii || "—"}
                            </td>
                            <td className="text-right mono font-bold text-white">
                              {fmtL(s.ilosc_wymagana * viewZlecenie.planowana_ilosc_wyrobu * (1 + (s.procent_strat || 0) / 100), 3)}
                              <span className="text-slate-500 text-xs ml-1">{s.czy_pomocnicza ? s.asortyment_skladnika?.jednostka_pomocnicza : s.asortyment_skladnika?.jednostka_miary}</span>
                            </td>
                          </tr>
                        ))
                      ) : viewZlecenie.status === "W_toku" ? (
                        viewZlecenie.receptura?.skladniki?.map(s => {
                          const rezerwacjeSkladnika = viewZlecenie.rezerwacje?.filter((r: any) =>
                            (r.id_partii && r.partia?.id_asortymentu === s.asortyment_skladnika?.id) ||
                            (r.id_asortymentu === s.asortyment_skladnika?.id)
                          ) || [];
                          const sumRes = rezerwacjeSkladnika.reduce((sum: number, r: any) => sum + (r.ilosc_zarezerwowana || 0), 0);
                          const isQtyOnly = rezerwacjeSkladnika.some((r: any) => !r.id_partii);
                          return (
                            <tr key={s.id_asortymentu_skladnika}>
                              <td className="font-semibold text-white">{s.asortyment_skladnika?.nazwa}</td>
                              <td>
                                <span className={`badge ${isQtyOnly ? "badge-warn" : "badge-info"}`}>
                                  {isQtyOnly ? "Rezerwacja ilościowa" : `Partia: ${rezerwacjeSkladnika[0]?.partia?.numer_partii || '...'}`}
                                </span>
                              </td>
                              <td className="text-right mono font-bold text-white">
                                {fmtL(sumRes, 3)} <span className="text-slate-500 text-xs ml-1">{s.asortyment_skladnika?.jednostka_miary}</span>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        viewZlecenie.ruchy_magazynowe?.filter((r: any) => r.typ_ruchu === "Zuzycie").map((r: any) => (
                          <tr key={r.id}>
                            <td className="font-semibold text-white">{r.partia?.asortyment?.nazwa}</td>
                            <td className="mono text-xs" style={{ color: 'var(--text-code)' }}>{r.partia?.numer_partii}</td>
                            <td className="text-right mono font-bold" style={{ color: 'var(--ok)' }}>
                              {fmtL(Math.abs(r.ilosc), 3)} <span className="text-slate-500 text-xs ml-1">{r.partia?.asortyment?.jednostka_miary}</span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  {viewZlecenie.status === "W_toku" && (!viewZlecenie.rezerwacje || viewZlecenie.rezerwacje.length === 0) && (
                    <div className="py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Brak aktywnych rezerwacji</div>
                  )}
                </div>

                {viewZlecenie.ruchy_magazynowe?.length > 0 && (
                  <div className="mes-panel rounded overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-[#334155] flex items-center gap-2" style={{ background: 'var(--bg-surface)' }}>
                      <FileText className="w-4 h-4 text-slate-400" />
                      <span className="text-white font-semibold text-sm">Dokumentacja systemowa</span>
                    </div>
                    <table className="mes-table">
                      <thead>
                        <tr>
                          <th>Typ</th>
                          <th>Referencja</th>
                          <th>Operacja</th>
                          <th className="text-right">Akcja</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from(new Set((viewZlecenie.ruchy_magazynowe || []).map(r => r.referencja_dokumentu))).filter((ref): ref is string => Boolean(ref)).map(ref => {
                          const r = (viewZlecenie.ruchy_magazynowe || []).find(x => x.referencja_dokumentu === ref)!;
                          const isPW = r.typ_ruchu?.includes("Przyjecie");
                          return (
                            <tr key={ref} className="cursor-pointer" onClick={() => openDocPreview(ref)}>
                              <td><span className={`badge ${isPW ? "badge-ok" : "badge-danger"}`}>{isPW ? "PW" : "RW"}</span></td>
                              <td className="mono font-medium" style={{ color: 'var(--text-code)' }}>{ref}</td>
                              <td className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.typ_ruchu?.replace(/_/g, " ")}</td>
                              <td className="text-right">
                                <button className="p-1 text-slate-500 hover:text-white transition-colors"><Eye className="w-3.5 h-3.5" /></button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ LISTA POBRAŃ (PICK LIST) MODAL ═══════════════════════════════════ */}
      {pickListZlecenie && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-view">
          <div className="bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-2xl border border-[#334155] overflow-hidden flex flex-col" style={{ height: '90vh' }}>
            <div className="flex items-center justify-between p-5 border-b border-[#334155] bg-blue-900/20 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600/20 flex items-center justify-center border border-blue-500/30">
                  <Clipboard className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Lista pobrań</h3>
                  <p className="text-slate-500 text-xs">{pickListZlecenie.numer_zlecenia} · {pickListZlecenie.receptura.asortyment_docelowy.nazwa}</p>
                </div>
              </div>
              <button onClick={() => setPickListZlecenie(null)} className="text-slate-500 hover:text-white p-2 rounded-lg hover:bg-[#334155] transition-colors"><X className="w-5 h-5" /></button>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {pickListZlecenie.status === "Planowane" ? (
                <div className="space-y-4">
                  <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 p-3 rounded-xl text-sm font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Sugestia partii oparta na FEFO. Rezerwacja nastąpi po rozpoczęciu zlecenia.
                  </div>

                  <div className="space-y-3">
                    {pickListZlecenie.receptura.skladniki.map(s => (
                      <div key={s.asortyment_skladnika.id} className="bg-[#0f172a] p-4 rounded-xl border border-[#334155]">
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-white font-semibold text-sm">{s.asortyment_skladnika.nazwa}</span>
                          <span className="text-blue-300 font-mono font-bold">
                            {(() => {
                              const baseRequired = s.ilosc_wymagana * pickListZlecenie.planowana_ilosc_wyrobu * (1 + (s.procent_strat || 0) / 100);
                              return fmtL(baseRequired, 3);
                            })()}
                            <span className="text-slate-500 text-xs ml-1">{s.asortyment_skladnika.jednostka_miary}</span>
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {s.sugerowane_partie && s.sugerowane_partie.length > 0 ? (
                            s.sugerowane_partie.map(p => (
                              <div key={p.id} className="flex justify-between items-center bg-[#1e293b] py-2 px-3 rounded-lg border border-[#334155] text-sm">
                                <span className="mono font-semibold" style={{ color: 'var(--text-code)' }}>{p.numer_partii}</span>
                                <span className="text-slate-500 text-xs">Stan: {fmtL(p.stan, 2)}</span>
                              </div>
                            ))
                          ) : (
                            <div className="flex items-center gap-2 text-red-400 text-xs py-1"><AlertCircle className="w-3.5 h-3.5" /> Brak dostępnych partii na magazynie</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {pickListZlecenie.rezerwacje?.map((r: any) => {
                    const asortyment = r.partia?.asortyment || r.asortyment;
                    if (!asortyment) return null;
                    return (
                      <div key={r.id} className="bg-[#0f172a] p-4 rounded-xl border border-[#334155] flex justify-between items-center">
                        <div>
                          <div className="text-white font-semibold text-sm">{asortyment.nazwa}</div>
                          <div className="mt-1">
                            {r.id_partii ? (
                              <span className="mono text-xs font-semibold" style={{ color: 'var(--text-code)' }}>{r.partia?.numer_partii}</span>
                            ) : (
                              <span className="badge badge-warn">Rezerwacja ilościowa</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-white font-bold font-mono">{fmtL(r.ilosc_zarezerwowana, 3)}</div>
                          <div className="text-slate-500 text-xs mt-0.5">{asortyment.jednostka_miary}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[#334155] bg-[#0f172a]/50 flex justify-end shrink-0">
              <button
                onClick={() => window.print()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 min-h-[44px] transition-colors"
              >
                <Printer className="w-4 h-4" /> Drukuj PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PRINT AREA (HIDDEN) ══════════════════════════════════════════════ */}
      {viewZlecenie && (
        <div className="hidden print:block print-section font-sans text-slate-900 bg-white p-12">
          <div className="flex justify-between items-start border-b-8 border-indigo-600 pb-10 mb-10">
            <div>
              <div className="text-indigo-600 text-[10px] font-black uppercase tracking-[0.4em] mb-4">Karta Produkcyjna ilGelato</div>
              <h1 className="text-6xl font-black uppercase tracking-tighter leading-none">{viewZlecenie.numer_zlecenia}</h1>
              <p className="text-2xl font-bold mt-4 text-slate-500 italic">{viewZlecenie.receptura?.asortyment_docelowy?.nazwa}</p>
            </div>
            <div className="text-right">
              <div className="bg-slate-100 p-6 rounded-[2rem] border-2 border-slate-200">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Data Wydruku</p>
                <p className="text-xl font-black font-mono">{new Date().toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-10 mb-12">
            <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-200">
               <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Planowana Ilość</p>
               <p className="text-4xl font-black font-mono">{viewZlecenie.planowana_ilosc_wyrobu} <span className="text-lg font-sans text-slate-400">{viewZlecenie.receptura?.asortyment_docelowy?.jednostka_miary}</span></p>
            </div>
            <div className="col-span-2 bg-slate-50 p-8 rounded-[2.5rem] border border-slate-200 border-dashed">
               <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Uwagi i Wytyczne Operatora</p>
               <div className="h-16 border-b border-slate-300" />
            </div>
          </div>

          <h3 className="text-2xl font-black uppercase tracking-tighter border-l-8 border-indigo-600 pl-6 mb-8">Zapotrzebowanie Materiałowe (BOM)</h3>
          <table className="w-full text-left">
            <thead>
              <tr className="border-b-2 border-slate-900 text-[11px] font-black uppercase tracking-widest">
                <th className="py-4">Surowiec / Składnik</th>
                <th className="py-4">Partia / LOT</th>
                <th className="py-4 text-right">Ilość do wydania</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {viewZlecenie.status === "Planowane" ? (
                viewZlecenie.receptura.skladniki.map(s => (
                  <tr key={s.id_asortymentu_skladnika}>
                    <td className="py-6 font-bold text-xl uppercase tracking-tight">{s.asortyment_skladnika.nazwa}</td>
                    <td className="py-6 font-mono text-slate-400 italic">Sugestia: {s.sugerowane_partie?.[0]?.numer_partii || "---"}</td>
                    <td className="py-6 text-right font-black text-2xl font-mono">{fmtL(s.ilosc_wymagana * viewZlecenie.planowana_ilosc_wyrobu, 3)} <span className="text-xs font-sans text-slate-400 uppercase">{s.asortyment_skladnika.jednostka_miary}</span></td>
                  </tr>
                ))
              ) : (
                viewZlecenie.rezerwacje?.map((r: any) => (
                  <tr key={r.id}>
                    <td className="py-6 font-bold text-xl uppercase tracking-tight">{r.partia?.asortyment?.nazwa || r.asortyment?.nazwa}</td>
                    <td className="py-6 font-mono text-slate-400 italic font-bold">{r.partia?.numer_partii || "---"}</td>
                    <td className="py-6 text-right font-black text-2xl font-mono">{fmtL(r.ilosc_zarezerwowana, 3)} <span className="text-xs font-sans text-slate-400 uppercase">{r.partia?.asortyment?.jednostka_miary || r.asortyment?.jednostka_miary}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="mt-32 grid grid-cols-2 gap-32">
            <div className="border-t-4 border-slate-900 pt-8 text-center">
              <p className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-400 mb-2">Potwierdzenie Pobrania</p>
              <p className="text-sm font-bold">(Podpis Operatora)</p>
            </div>
            <div className="border-t-4 border-slate-900 pt-8 text-center">
              <p className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-400 mb-2">Zakończenie Mieszania</p>
              <p className="text-sm font-bold">(Data i Godzina)</p>
            </div>
          </div>
        </div>
      )}
      {/* ═══ REALIZACJA ZLECENIA (KARTA REALIZACJI) ══════════════════════════ */}
      {itemToRealize && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-5xl border border-[#334155] overflow-hidden flex flex-col relative" style={{ height: '95vh' }}>

            <div className="flex items-center justify-between p-5 border-b border-[#334155] bg-emerald-900/20 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-600/20 flex items-center justify-center border border-emerald-500/30">
                  <Package className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Realizacja: {itemToRealize.numer_zlecenia}</h3>
                  <p className="text-slate-500 text-xs">Zamykanie zlecenia i przyjęcie wyrobu PW</p>
                </div>
              </div>
              <button onClick={() => setItemToRealize(null)} className="text-slate-500 hover:text-white p-2 rounded-lg hover:bg-[#334155] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5 overflow-y-auto flex-1">
               {/* Left: Outputs */}
               <div className="space-y-4">
                  <div className="bg-[#0f172a] p-4 rounded-xl border border-[#334155]">
                    <h4 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">Wynik produkcji</h4>
                    <div className="grid grid-cols-2 gap-3">
                       <div className="space-y-1.5">
                          <label className="text-slate-400 text-xs font-semibold">Planowano</label>
                          <div className="bg-[#1e293b] rounded-xl px-4 py-2.5 border border-[#334155] font-mono font-bold text-slate-400">
                             {itemToRealize.planowana_ilosc_wyrobu} <span className="text-slate-500 text-xs ml-1">{itemToRealize.receptura.asortyment_docelowy.jednostka_miary}</span>
                          </div>
                       </div>
                       <div className="space-y-1.5">
                          <label className="text-emerald-400 text-xs font-semibold">Ilość rzeczywista</label>
                          <div className="relative">
                            <input
                              type="text"
                              value={rzeczywistaIlosc}
                              onChange={(e) => setRzeczywistaIlosc(e.target.value)}
                              autoFocus
                              className="w-full bg-[#334155] border border-emerald-500/40 text-emerald-300 rounded-xl px-4 py-2.5 outline-none focus:border-emerald-500 transition-colors font-mono font-bold text-right pr-14"
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs pointer-events-none">
                              {itemToRealize.receptura.asortyment_docelowy.jednostka_miary}
                            </div>
                          </div>
                       </div>
                    </div>
                  </div>

                  <div className="bg-[#0f172a] p-4 rounded-xl border border-[#334155]">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-slate-400 text-xs font-bold uppercase tracking-widest">Pakowanie</h4>
                      <button
                        onClick={() => setOpakowaniaWpisy(prev => [...prev, { id_asortymentu: "", nazwa: "", waga_kg: "" }])}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Dodaj
                      </button>
                    </div>
                    {opakowaniaWpisy.length === 0 ? (
                      <div className="text-center py-3 text-slate-600 text-xs border border-dashed border-[#334155] rounded-lg">
                        Kliknij „Dodaj" aby dodać opakowanie
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {opakowaniaWpisy.map((op, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <select
                              value={op.id_asortymentu}
                              onChange={e => {
                                const found = dostepneOpakowania.find(o => o.id === e.target.value);
                                setOpakowaniaWpisy(prev => prev.map((x, i) => i === idx ? { ...x, id_asortymentu: e.target.value, nazwa: found?.nazwa || "" } : x));
                              }}
                              className="flex-1 rounded px-2 py-1.5 text-sm outline-none focus:ring-1"
                              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                            >
                              <option value="">— opakowanie —</option>
                              {dostepneOpakowania.map(o => <option key={o.id} value={o.id}>{o.nazwa}</option>)}
                            </select>
                            <div className="relative">
                              <input
                                type="text" value={op.waga_kg} placeholder="0.00"
                                onChange={e => setOpakowaniaWpisy(prev => prev.map((x, i) => i === idx ? { ...x, waga_kg: e.target.value } : x))}
                                className="w-24 text-right rounded px-2 py-1.5 text-sm font-mono outline-none focus:ring-1 pr-7"
                                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                              />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs pointer-events-none" style={{ color: 'var(--text-muted)' }}>kg</span>
                            </div>
                            <button onClick={() => setOpakowaniaWpisy(prev => prev.filter((_, i) => i !== idx))} className="text-slate-600 hover:text-red-400 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        <div className="text-right text-xs font-mono pt-1" style={{ color: 'var(--text-muted)' }}>
                          Razem: <span className="text-white font-bold">{fmtL(opakowaniaWpisy.reduce((s, o) => s + (parseFloat(o.waga_kg.replace(",", ".")) || 0), 0), 3)}</span> kg
                        </div>
                      </div>
                    )}
                  </div>
               </div>

               {/* Right: Ingredients Allocation */}
               <div className="bg-[#0f172a] p-4 rounded-xl border border-[#334155] flex flex-col">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-slate-400 text-xs font-bold uppercase tracking-widest">Rozliczenie surowców</h4>
                    <button onClick={() => handleRealizuj(itemToRealize)} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors">
                      <RotateCcw className="w-3 h-3" /> Reset FEFO
                    </button>
                  </div>

                  <div className="space-y-3 flex-1 overflow-y-auto">
                    {itemToRealize.receptura?.skladniki?.map(s => {
                      const ingId = s.asortyment_skladnika?.id;
                      const allocated = zuzytePartie[ingId] || [];
                      const allocatedSum = allocated.reduce((sum, p) => sum + p.ilosc, 0);
                      const required = Math.round(s.ilosc_wymagana * itemToRealize.planowana_ilosc_wyrobu * (1 + (s.procent_strat || 0) / 100) * 100) / 100;
                      const isComplete = Math.abs(allocatedSum - required) < 0.001;

                      return (
                        <div key={ingId} className={`rounded-xl p-3 border transition-colors ${isComplete ? "bg-emerald-500/5 border-emerald-500/20" : "bg-[#1e293b] border-[#334155]"}`}>
                            <div className="flex justify-between items-start mb-2">
                               <div>
                                  <div className="text-white font-semibold text-sm line-clamp-1">{s.asortyment_skladnika?.nazwa}</div>
                                  <div className="text-slate-500 text-xs mt-0.5">Zapotrzebowanie: {fmtL(required, 3)} {s.asortyment_skladnika?.jednostka_miary}</div>
                               </div>
                               <button
                                 onClick={() => setActivePicker({ ingredId: ingId, skladnik: s })}
                                 className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ml-2 shrink-0 ${isComplete ? "bg-emerald-500/10 text-emerald-400" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
                               >
                                 {isComplete ? "Edytuj" : "Wybierz"}
                               </button>
                            </div>

                            <div className="space-y-1.5">
                               {allocated.map(p => {
                                  const batchInfo = s.sugerowane_partie?.find(b => b.id === p.id_partii);
                                  return (
                                    <div key={p.id_partii} className="flex justify-between items-center bg-[#0f172a] py-1.5 px-3 rounded-lg border border-[#334155]">
                                       <div>
                                          <span className="mono font-semibold text-xs" style={{ color: 'var(--text-code)' }}>{batchInfo?.numer_partii || "PARTIA"}</span>
                                          {batchInfo?.termin_waznosci && <span className="text-slate-600 text-xs ml-2">Wazn: {new Date(batchInfo.termin_waznosci).toLocaleDateString()}</span>}
                                       </div>
                                       <span className="mono font-bold text-sm text-blue-300">{fmtL(p.ilosc, 3)} <span className="text-slate-500 text-xs">{s.asortyment_skladnika?.jednostka_miary}</span></span>
                                    </div>
                                  );
                               })}
                               {!isComplete && allocatedSum > 0 && <p className="text-amber-400 text-xs mt-1 text-center">Niepełna alokacja (brakuje: {fmtL(required - allocatedSum, 3)})</p>}
                               {allocatedSum === 0 && <div className="text-center py-2 text-slate-600 text-xs border border-dashed border-[#334155] rounded-lg">Brak partii</div>}
                            </div>
                        </div>
                      );
                    })}
                  </div>
               </div>
            </div>

            <div className="p-4 border-t border-[#334155] bg-[#0f172a]/50 flex justify-between items-center shrink-0">
               <div className="flex items-center gap-3">
                 <span className="text-slate-500 text-xs">Postęp alokacji</span>
                 <div className="w-32 h-1.5 bg-[#334155] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${Math.min(100, (Object.values(zuzytePartie).flat().length / (itemToRealize.receptura?.skladniki?.length || 1)) * 100)}%` }}
                    />
                 </div>
               </div>

               <div className="flex gap-3">
                  <button onClick={() => setItemToRealize(null)} className="px-5 py-2.5 text-slate-400 hover:bg-[#334155] rounded-xl font-semibold transition-colors">
                    Anuluj
                  </button>
                  <button
                    onClick={confirmRealizuj}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 min-h-[44px] transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Zamknij zlecenie (PW)
                  </button>
               </div>
            </div>

            {/* Sub-modal: Partia Picker */}
            {activePicker && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0f172a]/90 backdrop-blur-sm animate-view p-6">
                 <div className="w-full max-w-xl flex flex-col bg-[#1e293b] rounded-2xl border border-[#334155] shadow-2xl overflow-hidden" style={{ maxHeight: '80vh' }}>
                    <div className="flex items-center justify-between p-5 border-b border-[#334155] bg-blue-900/20 shrink-0">
                       <div>
                          <h4 className="text-base font-bold text-white">{activePicker.skladnik.asortyment_skladnika.nazwa}</h4>
                          <p className="text-slate-500 text-xs mt-0.5">Wybierz partię do wydania z magazynu</p>
                       </div>
                       <button onClick={() => setActivePicker(null)} className="text-slate-500 hover:text-white p-2 rounded-lg hover:bg-[#334155] transition-colors">
                          <X className="w-5 h-5" />
                       </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 space-y-3">
                       <div className="bg-[#0f172a] border border-[#334155] rounded-xl p-3 flex justify-between items-center">
                          <span className="text-slate-400 text-sm">Wymagane do alokacji:</span>
                          <div className="flex items-center gap-3">
                             <button
                               onClick={() => {
                                 const req = Math.round(activePicker.skladnik.ilosc_wymagana * itemToRealize.planowana_ilosc_wyrobu * (1 + (activePicker.skladnik.procent_strat || 0) / 100) * 1000) / 1000;
                                 const sorted = [...(activePicker.skladnik.sugerowane_partie || [])].sort((a, b) => {
                                   if (!a.termin_waznosci) return 1;
                                   if (!b.termin_waznosci) return -1;
                                   return new Date(a.termin_waznosci).getTime() - new Date(b.termin_waznosci).getTime();
                                 });
                                 let remaining = req;
                                 const allocation: { id_partii: string; ilosc: number }[] = [];
                                 for (const p of sorted) {
                                   if (remaining <= 0) break;
                                   if (p.stan <= 0) continue;
                                   const take = Math.round(Math.min(p.stan, remaining) * 1000) / 1000;
                                   if (take > 0) { allocation.push({ id_partii: p.id, ilosc: take }); remaining = Math.round((remaining - take) * 1000) / 1000; }
                                 }
                                 setZuzytePartie(prev => ({ ...prev, [activePicker.ingredId]: allocation }));
                               }}
                               className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                             >
                               Resetuj FEFO
                             </button>
                             <span className="text-white font-mono font-bold">
                               {fmtL(activePicker.skladnik.ilosc_wymagana * itemToRealize.planowana_ilosc_wyrobu * (1 + (activePicker.skladnik.procent_strat || 0) / 100), 3)}
                               <span className="text-slate-500 text-xs ml-1">{activePicker.skladnik.asortyment_skladnika.jednostka_miary}</span>
                             </span>
                          </div>
                       </div>

                       {(() => {
                          const pickerRequired = Math.round(activePicker.skladnik.ilosc_wymagana * itemToRealize.planowana_ilosc_wyrobu * (1 + (activePicker.skladnik.procent_strat || 0) / 100) * 1000) / 1000;
                          return activePicker.skladnik.sugerowane_partie?.map(p => {
                            const currentAllocation = zuzytePartie[activePicker.ingredId]?.find(x => x.id_partii === p.id)?.ilosc || 0;
                            const sumOthers = (zuzytePartie[activePicker.ingredId] || []).filter(x => x.id_partii !== p.id).reduce((s, x) => s + x.ilosc, 0);
                            const maxForThis = Math.max(0, Math.min(p.stan, pickerRequired - sumOthers));
                            return (
                              <div key={p.id} className="bg-[#0f172a] border border-[#334155] rounded-xl p-4 flex justify-between items-center hover:border-[#475569] transition-colors">
                                 <div>
                                    <div className="mono font-semibold text-white">{p.numer_partii}</div>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                                       <span>Ważn: {p.termin_waznosci ? new Date(p.termin_waznosci).toLocaleDateString() : "—"}</span>
                                       <span>·</span>
                                       <span>SOH: <span className="text-slate-300">{fmtL(p.stan, 3)}</span></span>
                                       {maxForThis <= 0 && sumOthers >= pickerRequired && <span className="text-amber-500">· limit osiągnięty</span>}
                                    </div>
                                 </div>
                                 <input
                                   type="text"
                                   placeholder="0.000"
                                   className="w-28 bg-[#334155] border border-[#475569] text-blue-300 rounded-lg px-3 py-2 text-right font-mono font-bold outline-none focus:border-blue-500 transition-colors"
                                   value={currentAllocation || ""}
                                   onChange={(e) => {
                                     const val = parseFloat(e.target.value.replace(",", "."));
                                     const newZuzyte = { ...zuzytePartie };
                                     const list = [...(newZuzyte[activePicker.ingredId] || [])];
                                     const idx = list.findIndex(x => x.id_partii === p.id);
                                     if (isNaN(val) || val <= 0) {
                                        if (idx >= 0) list.splice(idx, 1);
                                     } else {
                                        const sumOthersCurrent = list.filter(x => x.id_partii !== p.id).reduce((s, x) => s + x.ilosc, 0);
                                        const clamped = Math.round(Math.min(val, pickerRequired - sumOthersCurrent, p.stan) * 1000) / 1000;
                                        if (clamped <= 0) {
                                          if (idx >= 0) list.splice(idx, 1);
                                        } else {
                                          if (idx >= 0) list[idx].ilosc = clamped;
                                          else list.push({ id_partii: p.id, ilosc: clamped });
                                        }
                                     }
                                     newZuzyte[activePicker.ingredId] = list;
                                     setZuzytePartie(newZuzyte);
                                   }}
                                 />
                              </div>
                            );
                          });
                       })()}
                    </div>

                    <div className="p-4 border-t border-[#334155] bg-[#0f172a]/50 shrink-0">
                       <button onClick={() => setActivePicker(null)} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-bold transition-colors min-h-[44px]">
                          Zatwierdź wybór
                       </button>
                    </div>
                 </div>
              </div>
            )}
          </div>
        </div>
      )}

      </> /* koniec pageTab === "zlecenia" */}
      </div>

      {/* ═══ PODGLĄD DOKUMENTU ════════════════════════════════════════════════ */}
      {previewDocRef && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" onClick={() => setPreviewDocRef(null)}>
          <div className="bg-[#1e293b] rounded-lg shadow-2xl w-full max-w-3xl border border-[#334155] flex flex-col" style={{ height: '100%' }} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center px-5 py-3 border-b border-[#334155] shrink-0" style={{ background: '#111827' }}>
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <h3 className="text-base font-bold text-white">{previewDocRef}</h3>
                {previewDocData && <span className="badge badge-info">{previewDocData.typ}</span>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const win = window.open("", "_blank", "width=800,height=600");
                    if (!win) return;
                    const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("pl-PL") : "—";
                    const fmtFull = (d: string) => new Date(d).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
                    const pozycjeHTML = (previewDocData as any).pozycje.map((p: any) =>
                      `<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb">${p.asortyment}</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;font-family:monospace">${p.numer_partii}</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:bold">${fmtL(p.ilosc, 3)} ${p.jednostka}</td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${fmt(p.termin_waznosci)}</td></tr>`
                    ).join("");
                    win.document.write(`<!DOCTYPE html><html><head><title>${previewDocData.referencja}</title><style>body{font-family:Inter,system-ui,sans-serif;padding:40px;color:#1e293b;max-width:800px;margin:0 auto} h1{font-size:24px;margin:0 0 4px} .meta{color:#64748b;font-size:13px;margin-bottom:24px} table{width:100%;border-collapse:collapse;margin-top:16px} th{text-align:left;padding:8px;border-bottom:2px solid #334155;font-size:12px;text-transform:uppercase;color:#64748b} .badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;margin-left:8px} @media print{body{padding:20px}}</style></head><body><h1>${previewDocData.referencja} <span class="badge" style="background:#e0e7ff;color:#4338ca">${previewDocData.typ}</span></h1><div class="meta">${fmtFull(previewDocData.data)} · Wystawił: ${previewDocData.uzytkownik}</div><table><thead><tr><th>Asortyment</th><th>Nr Partii</th><th style="text-align:right">Ilość</th><th>Ważność</th></tr></thead><tbody>${pozycjeHTML}</tbody></table></body></html>`);
                    win.document.close();
                    win.print();
                  }}
                  className="p-2.5 bg-[#334155]/50 text-slate-400 hover:text-white hover:bg-[#475569] rounded-xl transition-all min-w-[44px] min-h-[44px] flex items-center justify-center border border-[#475569]"
                  title="Drukuj"
                >
                  <Printer className="w-5 h-5" />
                </button>
                <button onClick={() => setPreviewDocRef(null)} className="text-slate-500 hover:text-white p-2 rounded-lg hover:bg-[#334155]">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            {previewDocData && (
              <div className="flex items-center gap-6 px-5 py-2.5 border-b border-[#334155] text-xs shrink-0" style={{ background: '#0f172a' }}>
                <span style={{ color: 'var(--text-muted)' }}>Data: <span className="text-white font-semibold">{new Date(previewDocData.data).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span></span>
                <span style={{ color: 'var(--text-muted)' }}>Wystawił: <span className="text-white font-semibold">{previewDocData.uzytkownik}</span></span>
                {previewDocData.numer_zlecenia && <span style={{ color: 'var(--text-muted)' }}>Zlecenie: <span className="mono font-semibold" style={{ color: 'var(--text-code)' }}>{previewDocData.numer_zlecenia}</span></span>}
              </div>
            )}
            <div className="overflow-y-auto flex-1">
              {previewDocLoading ? (
                <div className="flex justify-center p-8"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
              ) : !previewDocData ? (
                <div className="text-center p-8 text-slate-500">Brak danych o dokumencie</div>
              ) : (
                <table className="mes-table">
                  <thead>
                    <tr>
                      <th>Towar</th>
                      <th>Partia</th>
                      <th className="text-right">Ilość</th>
                      <th className="text-right">Cena</th>
                      <th className="text-right">Wartość</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(previewDocData as any).pozycje?.map((poz: any, i: number) => (
                      <tr key={i}>
                        <td>
                          <div className="font-semibold text-white">{poz.asortyment}</div>
                          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{poz.kod_towaru}</div>
                        </td>
                        <td className="mono text-xs font-semibold" style={{ color: 'var(--text-code)' }}>{poz.numer_partii}</td>
                        <td className="text-right mono font-bold text-white">
                          {fmtL(poz.ilosc, 3)} <span className="text-slate-500 text-xs">{poz.jednostka}</span>
                        </td>
                        <td className="text-right" style={{ color: 'var(--text-secondary)' }}>
                          {poz.cena_jednostkowa != null ? `${fmtL(poz.cena_jednostkowa, 2)} PLN` : "—"}
                        </td>
                        <td className="text-right font-bold" style={{ color: 'var(--ok)' }}>
                          {poz.cena_jednostkowa != null ? `${fmtL(poz.wartosc, 2)} PLN` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {previewDocData.wartosc_calkowita > 0 && (
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg-surface)' }}>
                        <td colSpan={4} className="px-3 py-2 text-right text-xs font-bold" style={{ color: 'var(--text-muted)' }}>Razem</td>
                        <td className="px-3 py-2 text-right font-bold mono text-white">{fmtL(previewDocData.wartosc_calkowita, 2)} PLN</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </div>
            <div className="p-4 border-t border-[#334155] bg-[#0f172a]/50 flex justify-end shrink-0">
               <button onClick={() => setPreviewDocRef(null)} className="px-5 py-2.5 text-slate-400 hover:bg-[#334155] rounded-xl font-semibold transition-colors">
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmDeleteId}
        title="Usuń zlecenie"
        message="Czy na pewno chcesz usunąć to zlecenie produkcyjne? Tej operacji nie można cofnąć."
        confirmText="Usuń"
        cancelText="Anuluj"
        onConfirm={() => { handleDelete(confirmDeleteId!); setConfirmDeleteId(null); }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
