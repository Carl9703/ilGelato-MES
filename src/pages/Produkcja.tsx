import React, { useState, useEffect } from "react";
import { Plus, Save, X, Factory, AlertCircle, Play, Trash2, CheckCircle2, AlertTriangle, Database, Clock, Clipboard, MapPin, FileText, ChevronDown, ChevronUp, Package, Trash, Eye, Printer, Check, RotateCcw, Zap, Calendar, BarChart2, Calculator, Layers } from "lucide-react";
import AsortymentSelektor, { WybranyTowar } from "../components/AsortymentSelektor";
import { fmtL } from "../utils/fmt";
import ConfirmModal from "../components/ConfirmModal";
import { useToast } from "../components/Toast";
import { Spinner } from "../components/Spinner";
import { EmptyState } from "../components/EmptyState";

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
  id_sesji?: string | null;
  etap?: number | null;
  sesja?: { id: string; numer_sesji: string } | null;
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

type WizPartia = { id: string; numer_partii: string; termin_waznosci: string | null; stan: number };
type WizSurowiecBaza = { id_asortymentu: string; nazwa: string; jednostka: string; jednostka_glowna: string; czy_pomocnicza: boolean; przelicznik: number; ilosc_wymagana: number; ilosc_jm: number; zuzyte_partie: { _uid: string, id_partii: string, ilosc: number }[]; partie: WizPartia[] };
type WizWyrob = { _key: string; id_receptury: string; liczba_porcji: string };
type WizSurowiecWyrob = { id_asortymentu: string; nazwa: string; jednostka: string; jednostka_glowna: string; czy_pomocnicza: boolean; przelicznik: number; ilosc_wymagana: number; ilosc_jm: number; zuzyte_partie: { _uid: string, id_partii: string, ilosc: number }[]; partie: WizPartia[] };

export default function Produkcja() {
  const { showToast } = useToast();
  const [zlecenia, setZlecenia] = useState<Zlecenie[]>([]);
  const [receptury, setReceptury] = useState<Receptura[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [itemToRealize, setItemToRealize] = useState<Zlecenie | null>(null);
  const [rzeczywistaIlosc, setRzeczywistaIlosc] = useState<string>("");
  const [zuzytePartie, setZuzytePartie] = useState<{ [ingredId: string]: Array<{ id_partii: string, ilosc: number }> }>({});
  const [activePicker, setActivePicker] = useState<{ ingredId: string, skladnik: SkladnikReceptury } | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");

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

  // ── Wizard sesji produkcyjnej ────────────────────────────────────────────────
  const [showWizard, setShowWizard] = useState(false);
  const [wizStep, setWizStep] = useState<1|2|3>(1);
  const [wizLoading, setWizLoading] = useState(false);
  const [wizBazaRecId, setWizBazaRecId] = useState("");
  const [wizBazaIlosc, setWizBazaIlosc] = useState("");
  const [wizBazaRzeczywistaIlosc, setWizBazaRzeczywistaIlosc] = useState("");
  const [wizBazaSurowce, setWizBazaSurowce] = useState<WizSurowiecBaza[]>([]);
  const [wizWyroby, setWizWyroby] = useState<WizWyrob[]>([]);
  const [wizAddRecId, setWizAddRecId] = useState("");
  const [wizWyrobySurowceMap, setWizWyrobySurowceMap] = useState<Record<string, WizSurowiecWyrob[]>>({});
  type WizRealizacjaItem = { rzeczywista_ilosc: string; opakowania: Array<{ id_asortymentu: string; nazwa: string; waga_kg: string }> };
  const [wizRealizacja, setWizRealizacja] = useState<Record<string, WizRealizacjaItem>>({});
  const [wizDraftInfo, setWizDraftInfo] = useState<{ savedAt: string } | null>(null);
  const [hasDraft, setHasDraft] = useState(false);

  // ── Draft w bazie danych ──────────────────────────────────────────────────
  const dbSaveDraft = async (krok: number, data: object, zdarzenie = "auto") => {
    try {
      await fetch("/api/produkcja/sesja-robocza", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ krok, dane_json: JSON.stringify(data), zdarzenie }),
      });
    } catch { /* ignoruj błędy zapisu draftu */ }
  };

  const dbClearDraft = async () => {
    try { await fetch("/api/produkcja/sesja-robocza", { method: "DELETE" }); } catch { /* ignoruj */ }
  };

  const saveDraft = () => {
    const draft = {
      wizStep, wizBazaRecId, wizBazaIlosc, wizBazaRzeczywistaIlosc,
      wizBazaSurowce, wizWyroby, wizWyrobySurowceMap, wizRealizacja,
      savedAt: new Date().toISOString(),
    };
    dbSaveDraft(wizStep, draft, "zapisano_szkic");
    setShowWizard(false);
  };

  const openWizardWithDraftCheck = async () => {
    try {
      const res = await fetch("/api/produkcja/sesja-robocza");
      if (res.ok) {
        const row = await res.json();
        if (row?.dane_json) {
          const draft = JSON.parse(row.dane_json);
          setWizDraftInfo({ savedAt: draft.savedAt ?? row.zaktualizowano_dnia });
          return;
        }
      }
    } catch { /* brak draftu */ }
    wizReset(); fetchData(); setShowWizard(true);
  };

  const restoreDraft = async () => {
    try {
      const res = await fetch("/api/produkcja/sesja-robocza");
      if (!res.ok) return;
      const row = await res.json();
      if (!row?.dane_json) return;
      const draft = JSON.parse(row.dane_json);
      setWizStep(draft.wizStep);
      setWizBazaRecId(draft.wizBazaRecId);
      setWizBazaIlosc(draft.wizBazaIlosc);
      setWizBazaRzeczywistaIlosc(draft.wizBazaRzeczywistaIlosc ?? draft.wizBazaIlosc ?? "");
      setWizBazaSurowce(draft.wizBazaSurowce);
      setWizWyroby(draft.wizWyroby);
      setWizWyrobySurowceMap(draft.wizWyrobySurowceMap);
      setWizRealizacja(draft.wizRealizacja);
      setWizDraftInfo(null);
      fetchData();
      setShowWizard(true);
      if (draft.wizStep >= 3 && dostepneOpakowania.length === 0) {
        fetch("/api/asortyment").then(r => r.json())
          .then((items: any[]) => setDostepneOpakowania(items.filter((a: any) => a.typ_asortymentu === "Opakowanie" && a.czy_aktywne)))
          .catch(() => {});
      }
    } catch { /* ignoruj */ }
  };

  // Alias dla starego clearDraft
  const clearDraft = dbClearDraft;

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

  useEffect(() => {
    fetchData();
    fetch("/api/produkcja/sesja-robocza").then(r => r.json()).then(row => setHasDraft(!!row?.dane_json)).catch(() => {});
  }, []);

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
      if (showWizard) { setShowWizard(false); return; }
      if (itemToRealize) { setItemToRealize(null); return; }
      if (pickListZlecenie) { setPickListZlecenie(null); return; }
      if (viewZlecenie) { setViewZlecenie(null); return; }
      if (isAdding) { setIsAdding(false); return; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [previewDocRef, activePicker, showSelektor, showWizard, itemToRealize, pickListZlecenie, viewZlecenie, isAdding]);

  const fetchData = async () => {
    try {
      const [zlecRes, recRes, asortRes] = await Promise.all([fetch("/api/produkcja"), fetch("/api/receptury"), fetch("/api/asortyment")]);
      if (zlecRes.ok) {
        const data: Zlecenie[] = await zlecRes.json();
        setZlecenia(data);
        // Sync open detail view
        setViewZlecenie(prev => prev ? data.find(z => z.id === prev.id) || null : null);
      }
      if (recRes.ok) { const rec = await recRes.json(); setReceptury(rec); setRecepturyAll(rec); }
      if (asortRes.ok) {
        const asortData = await asortRes.json();
        setDostepneOpakowania(asortData.filter((a: any) => a.typ_asortymentu === "Opakowanie" && a.czy_aktywne));
      }
    } catch {}
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !selectedRecId) { showToast("Wybierz produkt i recepturę.", "error"); return; }
    
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
      showToast("Zlecenie zostało utworzone!", "ok");
      fetchData();
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  const onSelektorConfirm = (items: WybranyTowar[]) => {
    if (items.length === 0) return;
    const product = items[0];
    const availableRecs = receptury.filter(r => r.asortyment_docelowy.id === product.id_asortymentu);
    
    if (availableRecs.length === 0) {
       showToast(`Produkt ${product.nazwa} nie posiada aktywnej receptury.`, "error");
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
    try {
      const res = await fetch(`/api/produkcja/${z.id}/rozpocznij`, { method: "POST" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      showToast("Zlecenie rozpoczęte! Surowce zarezerwowane.", "ok"); fetchData();
    } catch (err: any) { showToast(err.message, "error"); }
  };

  const handleSaveEdit = async () => {
    if (!viewZlecenie) return;
    try {
      const qty = parseFloat(editIlosc.replace(",", "."));
      if (isNaN(qty) || qty <= 0) { showToast("Podaj prawidłową ilość.", "error"); return; }
      const res = await fetch(`/api/produkcja/${viewZlecenie.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planowana_ilosc_wyrobu: qty }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      showToast("Zlecenie zaktualizowane.", "ok"); fetchData();
    } catch (err: any) { showToast(err.message, "error"); }
  };

  const handleRealizuj = async (z: Zlecenie) => {
    setItemToRealize(z); setRzeczywistaIlosc(z.planowana_ilosc_wyrobu.toString());
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
    if (isNaN(qtyNum) || qtyNum <= 0) { showToast("Ilość musi być > 0", "error"); return; }
    const payload = (Object.values(zuzytePartie) as Array<Array<{ id_partii: string; ilosc: number }>>).flatMap(arr => arr).filter(p => p.id_partii && p.ilosc > 0);
    try {
      const opakowaniaDo = opakowaniaWpisy
        .filter(o => o.id_asortymentu && parseFloat(o.waga_kg.replace(",", ".")) > 0)
        .map(o => ({ id_asortymentu: o.id_asortymentu, nazwa: o.nazwa, waga_kg: parseFloat(o.waga_kg.replace(",", ".")) }));
      const res = await fetch(`/api/produkcja/${itemToRealize.id}/realizuj`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rzeczywista_ilosc: qtyNum, zuzyte_partie: payload, opakowania: opakowaniaDo }) });
      if (!res.ok) { const d = await res.json(); showToast(d.error, "error"); return; }
      setItemToRealize(null); showToast("Zlecenie zrealizowane!", "ok"); fetchData();
    } catch { showToast("Błąd realizacji", "error"); }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/produkcja/${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); showToast(d.error || "Błąd usuwania zlecenia", "error"); return; }
      fetchData();
    } catch { showToast("Błąd połączenia", "error"); }
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

  // ── Wizard helpers ───────────────────────────────────────────────────────────
  const loadPartieForAsortyment = async (id_asortymentu: string): Promise<WizPartia[]> => {
    try { const r = await fetch(`/api/partie/${id_asortymentu}`); return r.ok ? r.json() : []; }
    catch { return []; }
  };

  React.useEffect(() => {
    if (!wizBazaRecId || !showWizard) { setWizBazaSurowce([]); return; }
    const rec = receptury.find(r => r.id === wizBazaRecId);
    if (!rec) return;
    const iloscNum = parseFloat(wizBazaIlosc.replace(",", ".")) || 0;
    if (iloscNum <= 0) { setWizBazaSurowce([]); return; }
    const surowce: WizSurowiecBaza[] = rec.skladniki.map(s => {
      const ilosc_wymagana = Math.round(s.ilosc_wymagana * iloscNum * 1000) / 1000;
      const przelicznik = s.asortyment_skladnika.przelicznik_jednostki ?? 1;
      const ilosc_jm = s.czy_pomocnicza && przelicznik > 0
        ? Math.round(ilosc_wymagana / przelicznik * 1000) / 1000
        : ilosc_wymagana;
      return {
        id_asortymentu: s.id_asortymentu_skladnika,
        nazwa: s.asortyment_skladnika.nazwa,
        jednostka: s.czy_pomocnicza && s.asortyment_skladnika.jednostka_pomocnicza
          ? s.asortyment_skladnika.jednostka_pomocnicza
          : s.asortyment_skladnika.jednostka_miary,
        jednostka_glowna: s.asortyment_skladnika.jednostka_miary,
        czy_pomocnicza: s.czy_pomocnicza,
        przelicznik,
        ilosc_wymagana,
        ilosc_jm,
        zuzyte_partie: [{ _uid: Math.random().toString(36), id_partii: "", ilosc: ilosc_jm }],
        partie: [],
      };
    });
    setWizBazaSurowce(surowce);
    surowce.forEach(s => {
      loadPartieForAsortyment(s.id_asortymentu).then(partie => {
        setWizBazaSurowce(prev => prev.map(x => {
          if (x.id_asortymentu !== s.id_asortymentu || partie.length === 0) return x;
          const zp: typeof x.zuzyte_partie = [];
          let remaining = x.ilosc_jm;
          for (const p of partie) {
            if (remaining <= 0) break;
            if (p.stan > 0) {
              const take = Math.round(Math.min(p.stan, remaining) * 1000) / 1000;
              zp.push({ _uid: Math.random().toString(36), id_partii: p.id, ilosc: take });
              remaining -= take;
            }
          }
          if (zp.length === 0 || remaining > 0.001) zp.push({ _uid: Math.random().toString(36), id_partii: "", ilosc: remaining > 0 ? remaining : x.ilosc_jm });
          return { ...x, partie, zuzyte_partie: zp };
        }));
      });
    });
  }, [wizBazaRecId, wizBazaIlosc, showWizard]);

  // Auto-przelicz surowce wyrobów gdy lista wyrobów się zmienia (step 2)
  React.useEffect(() => {
    if (wizStep === 1 || wizWyroby.length === 0) { setWizWyrobySurowceMap({}); return; }
    if (wizStep === 2) computeWyrobySurowce();
    // wizStep === 3: mapa zachowana bez zmian (dane surowców przekazywane do submitu)
  }, [wizWyroby, wizStep]);

  // Auto-zapis kroku 3 po każdej zmianie wizRealizacja
  React.useEffect(() => {
    if (wizStep !== 3 || Object.keys(wizRealizacja).length === 0) return;
    const state = { wizStep: 3, wizBazaRecId, wizBazaIlosc, wizBazaRzeczywistaIlosc, wizBazaSurowce, wizWyroby, wizWyrobySurowceMap, wizRealizacja, savedAt: new Date().toISOString() };
    dbSaveDraft(3, state, "zmiana_realizacji");
  }, [wizRealizacja]);

  const wizReset = () => {
    setWizStep(1);
    setWizBazaRecId(""); setWizBazaIlosc(""); setWizBazaRzeczywistaIlosc("");
    setWizBazaSurowce([]);
    setWizWyroby([]); setWizAddRecId("");
    setWizWyrobySurowceMap({});
    setWizRealizacja({});
  };

  const wizPolproduktAsortId = receptury.find(r => r.id === wizBazaRecId)?.asortyment_docelowy.id;

  const getBazaUsageForWyrob = (recId: string, ilosc: number): number => {
    const rec = receptury.find(r => r.id === recId);
    if (!rec || !wizPolproduktAsortId) return 0;
    const bazaSkladnik = rec.skladniki.find(s => s.id_asortymentu_skladnika === wizPolproduktAsortId);
    if (!bazaSkladnik) return 0;
    return Math.round(bazaSkladnik.ilosc_wymagana * ilosc * 1000) / 1000;
  };

  const getIloscWyrobu = (w: WizWyrob) => {
    const rec = receptury.find(r => r.id === w.id_receptury);
    const porcje = parseFloat(w.liczba_porcji.replace(",", ".")) || 0;
    return Math.round(porcje * (rec?.wielkosc_produkcji ?? 1) * 1000) / 1000;
  };

  const wizTotalBazaUsed = wizWyroby.reduce((sum, w) => {
    return sum + getBazaUsageForWyrob(w.id_receptury, getIloscWyrobu(w));
  }, 0);
  const wizBazaAvail = parseFloat((wizBazaRzeczywistaIlosc || wizBazaIlosc).replace(",", ".")) || 0;
  const wizBazaOk = !wizBazaAvail || wizTotalBazaUsed <= wizBazaAvail + 0.001;

  const computeRunRef = React.useRef(0);

  const computeWyrobySurowce = async () => {
    const runId = ++computeRunRef.current;
    const iloscBazyNum = parseFloat(wizBazaIlosc.replace(",", ".")) || 0;
    const newMap: Record<string, WizSurowiecWyrob[]> = {};
    for (const wyrob of wizWyroby) {
      const rec = receptury.find(r => r.id === wyrob.id_receptury);
      if (!rec) continue;
      const ilosc = getIloscWyrobu(wyrob);
      if (ilosc <= 0) continue;
      newMap[wyrob._key] = rec.skladniki.map(s => {
        const ilosc_wymagana = Math.round(s.ilosc_wymagana * ilosc * 1000) / 1000;
        const przelicznik = s.asortyment_skladnika.przelicznik_jednostki ?? 1;
        const ilosc_jm = s.czy_pomocnicza && przelicznik > 0
          ? Math.round(ilosc_wymagana / przelicznik * 1000) / 1000
          : ilosc_wymagana;
        return {
          id_asortymentu: s.id_asortymentu_skladnika,
          nazwa: s.asortyment_skladnika.nazwa,
          jednostka: s.czy_pomocnicza && s.asortyment_skladnika.jednostka_pomocnicza ? s.asortyment_skladnika.jednostka_pomocnicza : s.asortyment_skladnika.jednostka_miary,
          jednostka_glowna: s.asortyment_skladnika.jednostka_miary,
          czy_pomocnicza: s.czy_pomocnicza,
          przelicznik,
          ilosc_wymagana,
          ilosc_jm,
          id_partii: "",
          zuzyte_partie: [{ _uid: Math.random().toString(36), id_partii: s.id_asortymentu_skladnika === wizPolproduktAsortId ? "__etap1__" : "", ilosc: ilosc_jm }],
          partie: s.id_asortymentu_skladnika === wizPolproduktAsortId
            ? [{ id: "__etap1__", numer_partii: "Etap 1 (auto)", termin_waznosci: null, stan: iloscBazyNum }]
            : [],
        };
      });
    }
    if (runId !== computeRunRef.current) return; // stale run — inny efekt uruchomił nową wersję
    setWizWyrobySurowceMap(newMap);
    // Mapa zużycia z etapu 1 per partia (w JM głównej) — do korekty stanu w etapie 2
    const consumedInStep1: Record<string, number> = {};
    for (const s of wizBazaSurowce) {
      for (const zp of s.zuzyte_partie) {
        if (zp.id_partii && zp.id_partii !== "__etap1__") {
          consumedInStep1[zp.id_partii] = (consumedInStep1[zp.id_partii] || 0) + zp.ilosc;
        }
      }
    }
    // Załaduj partie dla surowców (nie dla bazy)
    for (const wyrob of wizWyroby) {
      const surowce = newMap[wyrob._key] || [];
      for (const s of surowce) {
        if (s.id_asortymentu === wizPolproduktAsortId) continue;
        const partie = await loadPartieForAsortyment(s.id_asortymentu);
        if (runId !== computeRunRef.current) return; // przerwij stale run przed zapisem stanu
        // Odejmij zużycie etapu 1 od stanu partii
        const partieAdjusted = partie.map(p => ({
          ...p,
          stan: Math.max(0, Math.round((p.stan - (consumedInStep1[p.id] || 0)) * 1000) / 1000),
        }));
        setWizWyrobySurowceMap(prev => ({
          ...prev,
          [wyrob._key]: (prev[wyrob._key] || []).map(x => {
            if (x.id_asortymentu !== s.id_asortymentu) return x;
            const zp: typeof x.zuzyte_partie = [];
            let remaining = x.ilosc_jm;
            for (const p of partieAdjusted) {
              if (remaining <= 0) break;
              if (p.stan > 0) {
                const take = Math.round(Math.min(p.stan, remaining) * 1000) / 1000;
                zp.push({ _uid: Math.random().toString(36), id_partii: p.id, ilosc: take });
                remaining -= take;
              }
            }
            if (zp.length === 0 || remaining > 0.001) zp.push({ _uid: Math.random().toString(36), id_partii: "", ilosc: remaining > 0 ? remaining : x.ilosc_jm });
            return { ...x, partie: partieAdjusted, zuzyte_partie: zp };
          })
        }));
      }
    }
  };

  const handleWizNext = () => {
    if (wizStep === 1) {
      if (!wizBazaRecId) { showToast("Wybierz recepturę półproduktu (bazy)", "error"); return; }
      const iloscNum = parseFloat(wizBazaIlosc.replace(",", "."));
      if (isNaN(iloscNum) || iloscNum <= 0) { showToast("Podaj ilość bazy > 0", "error"); return; }
      for (const s of wizBazaSurowce) {
        let total = 0;
        const sums: Record<string, number> = {};
        for (const zp of s.zuzyte_partie) {
           if (!zp.id_partii && zp.ilosc > 0) { showToast(`Wybierz partię dla: ${s.nazwa} (ilość ${zp.ilosc})`, "error"); return; }
           if (zp.id_partii) {
             sums[zp.id_partii] = (sums[zp.id_partii] || 0) + zp.ilosc;
           }
           total += zp.ilosc;
        }
        if (Math.abs(total - s.ilosc_jm) > 0.002) {
           showToast(`Suma ilości partii dla ${s.nazwa} nie zgadza się z wymaganą ilością ${s.ilosc_jm}`, "error"); return;
        }
        for (const [id_partii, amt] of Object.entries(sums)) {
           const partia = s.partie.find(p => p.id === id_partii);
           if (!partia || partia.stan < amt - 0.001) {
             showToast(`Niewystarczający stan: ${s.nazwa} (partia ${partia?.numer_partii}) — przypisane ${amt.toFixed(3)}, dostępne ${(partia?.stan ?? 0).toFixed(3)}`, "error");
             return;
           }
        }
      }
      const stateStep2 = { wizStep: 2, wizBazaRecId, wizBazaIlosc, wizBazaRzeczywistaIlosc, wizBazaSurowce, wizWyroby, wizWyrobySurowceMap, wizRealizacja, savedAt: new Date().toISOString() };
      dbSaveDraft(2, stateStep2, "przejscie_kroku");
      setHasDraft(true);
      setWizStep(2);
    } else if (wizStep === 2) {
      if (wizWyroby.length === 0) { showToast("Dodaj co najmniej jeden wyrób gotowy", "error"); return; }
      for (const w of wizWyroby) {
        const porcje = parseFloat(w.liczba_porcji.replace(",", "."));
        if (isNaN(porcje) || porcje <= 0) { showToast("Wszystkie wyroby muszą mieć liczbę porcji > 0", "error"); return; }
      }
      if (!wizBazaOk) { showToast(`Zużycie bazy (${wizTotalBazaUsed.toFixed(3)}) przekracza dostępną ilość (${wizBazaIlosc})`, "error"); return; }
      // Inicjalizuj krok 3
      const init: Record<string, WizRealizacjaItem> = {};
      const pozzetti = dostepneOpakowania.find(o => o.nazwa.toLowerCase().includes("pozzetti") || o.nazwa.toLowerCase().includes("pozetti")) || dostepneOpakowania[0];
      for (const w of wizWyroby) {
        init[w._key] = {
           rzeczywista_ilosc: "",
           opakowania: pozzetti ? [{ id_asortymentu: pozzetti.id, nazwa: pozzetti.nazwa, waga_kg: "" }] : []
        };
      }
      setWizRealizacja(init);
      const stateStep3 = { wizStep: 3, wizBazaRecId, wizBazaIlosc, wizBazaRzeczywistaIlosc, wizBazaSurowce, wizWyroby, wizWyrobySurowceMap, wizRealizacja: init, savedAt: new Date().toISOString() };
      dbSaveDraft(3, stateStep3, "przejscie_kroku");
      setHasDraft(true);
      setWizStep(3);
    }
  };

  const handleAddWyrob = () => {
    if (!wizAddRecId) return;
    if (wizWyroby.find(w => w.id_receptury === wizAddRecId)) return;
    const rec = receptury.find(r => r.id === wizAddRecId);
    setWizWyroby(prev => [...prev, { _key: wizAddRecId + Date.now(), id_receptury: wizAddRecId, liczba_porcji: "1" }]);
    setWizAddRecId("");
  };

  const handleSubmitWizard = async () => {
    // Czytaj dane kroku 3 z DB aby uniknąć problemów z React state
    let realizacjaDB: Record<string, WizRealizacjaItem> = wizRealizacja;
    try {
      const dbRes = await fetch("/api/produkcja/sesja-robocza");
      if (dbRes.ok) {
        const row = await dbRes.json();
        if (row?.dane_json) {
          const draft = JSON.parse(row.dane_json);
          if (draft.wizRealizacja) realizacjaDB = draft.wizRealizacja;
        }
      }
    } catch { /* fallback do React state */ }

    for (const w of wizWyroby) {
      const real = realizacjaDB[w._key];
      const totalOp = (real?.opakowania || []).reduce((s, o) => s + (parseFloat(o.waga_kg.replace(",", ".")) || 0), 0);
      const rzeczywista = totalOp;
      if (rzeczywista <= 0) { showToast("Suma wag opakowań musi być > 0 dla każdego wyrobu", "error"); return; }
      const rec = receptury.find(r => r.id === w.id_receptury);
      if (totalOp <= 0) { showToast(`Dodaj opakowania dla: ${rec?.asortyment_docelowy.nazwa}`, "error"); return; }
    }
    setWizLoading(true);
    try {
      const payload = {
        id_receptury_bazy: wizBazaRecId,
        ilosc_bazy: parseFloat(wizBazaIlosc.replace(",", ".")),
        rzeczywista_ilosc_bazy: parseFloat((wizBazaRzeczywistaIlosc || wizBazaIlosc).replace(",", ".")),
        surowce_bazy: wizBazaSurowce
          .flatMap(s => s.zuzyte_partie.map(zp => ({ id_partii: zp.id_partii, ilosc: zp.ilosc })))
          .filter(x => x.id_partii && x.id_partii !== "__etap1__" && x.ilosc > 0),
        wyroby: wizWyroby
          .filter(w => getIloscWyrobu(w) > 0)
          .map(w => {
            const ilosc = getIloscWyrobu(w);
            const real = realizacjaDB[w._key];
            const totalOp = (real?.opakowania || []).reduce((s, o) => s + (parseFloat(o.waga_kg.replace(",", ".")) || 0), 0);
            const rzeczywista_ilosc = totalOp || ilosc;
            const surowce = (wizWyrobySurowceMap[w._key] || [])
              .flatMap(s => s.zuzyte_partie.map(zp => ({ id_partii: zp.id_partii, ilosc: zp.ilosc, isAuto: zp.id_partii === "__etap1__" })))
              .filter(x => x.id_partii && !x.isAuto && x.ilosc > 0)
              .map(x => ({ id_partii: x.id_partii, ilosc: x.ilosc }));
            const opakowania = (real?.opakowania || [])
              .filter(o => o.id_asortymentu && parseFloat(o.waga_kg.replace(",", ".")) > 0)
              .map(o => ({ id_asortymentu: o.id_asortymentu, nazwa: o.nazwa, waga_kg: parseFloat(o.waga_kg.replace(",", ".")) }));
            return { id_receptury: w.id_receptury, ilosc, rzeczywista_ilosc, surowce, opakowania };
          }),
      };
      const res = await fetch("/api/produkcja/sesja", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json();
      clearDraft();
      setShowWizard(false); wizReset();
      fetchData();
      showToast(`Sesja ${data.sesja.numer_sesji} zarejestrowana — ${data.wyroby.length + 1} ZP zrealizowane.`, "ok");
    } catch (e: any) { showToast(e.message, "error"); }
    finally { setWizLoading(false); }
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

      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-lg font-bold text-white tracking-wide">Produkcja</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Zlecenia i realizacja produkcji</p>
        </div>
        {pageTab === "zlecenia" && !isAdding && (
          <div className="flex gap-2">
            <button onClick={openWizardWithDraftCheck} className="flex items-center gap-2 px-4 py-2 rounded text-sm font-semibold text-white btn-hover-effect" style={{ background: 'var(--accent)' }}>
              <Zap className="w-4 h-4" /> Nowa sesja
              {hasDraft && <span className="w-2 h-2 rounded-full bg-amber-400 ml-0.5" title="Zapisany szkic" />}
            </button>
            <button onClick={() => setShowSelektor(true)} data-testid="btn-nowe-zlecenie" className="flex items-center gap-2 px-4 py-2 rounded text-sm font-semibold text-white btn-hover-effect" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <Plus className="w-4 h-4" /> Nowe ZP
            </button>
          </div>
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
              <button onClick={() => { setIsAdding(false); setSelectedProduct(null); }} className="text-slate-500 hover:text-white p-2 rounded-lg hover:bg-[#334155] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
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
              <button onClick={() => { setIsAdding(false); setSelectedProduct(null); }} className="px-5 py-2.5 text-slate-400 hover:bg-[#334155] rounded-xl font-semibold transition-colors">
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
                <th>Sesja</th>
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
                  <td>
                    {(z as any).sesja ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="mono text-xs font-semibold" style={{ color: 'var(--accent)' }}>{(z as any).sesja.numer_sesji}</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Etap {(z as any).etap === 1 ? "1 — Baza" : "2 — Wyrób"}</span>
                      </div>
                    ) : <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>}
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
                      {(Object.values(viewZlecenie.opakowania.reduce((acc: any, op: any) => {
                        const k = `${op.id_asortymentu}_${op.waga_kg}`;
                        if (!acc[k]) acc[k] = { ...op, count: 0 };
                        acc[k].count++;
                        return acc;
                      }, {})) as any[]).sort((a, b) => a.nazwa.localeCompare(b.nazwa) || b.waga_kg - a.waga_kg).map((op: any, i: number) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span className="text-slate-300">
                            {op.count > 1 ? <><span className="text-slate-500 font-bold">{op.count} x</span> </> : ""}
                            {op.nazwa}
                            <span className="text-xs text-slate-500 ml-1">({fmtL(op.waga_kg, 3)} kg)</span>
                          </span>
                          <span className="font-mono font-bold text-white">{fmtL(op.waga_kg * op.count, 3)} kg</span>
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

                {/* Panel sesji produkcyjnej */}
                {viewZlecenie.id_sesji && (() => {
                  const sesjaZlecenia = zlecenia
                    .filter(z => z.id_sesji === viewZlecenie.id_sesji)
                    .sort((a, b) => (a.etap || 0) - (b.etap || 0));
                  if (sesjaZlecenia.length <= 1) return null;
                  return (
                    <div className="mes-panel rounded overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-[#334155] flex items-center gap-2" style={{ background: 'var(--bg-surface)' }}>
                        <Layers className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                        <span className="text-white font-semibold text-sm">Sesja produkcyjna</span>
                        <span className="ml-auto font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{viewZlecenie.sesja?.numer_sesji}</span>
                      </div>
                      <div className="divide-y divide-[#334155]">
                        {sesjaZlecenia.map(z => {
                          const zuzyte = (z.ruchy_magazynowe || []).filter((r: RuchMagazynowy) => r.typ_ruchu === "Zuzycie");
                          const wytworzone = (z.ruchy_magazynowe || []).find((r: RuchMagazynowy) => r.typ_ruchu === "Przyjecie_Z_Produkcji");
                          const isCurrent = z.id === viewZlecenie.id;
                          return (
                            <div key={z.id} className="p-3" style={isCurrent ? { background: 'rgba(37,99,235,0.07)' } : {}}>
                              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                <span className={`badge ${z.etap === 1 ? 'badge-info' : 'badge-ok'} shrink-0`}>
                                  {z.etap === 1 ? 'Etap 1 · Półprodukt' : 'Etap 2 · Wyrób'}
                                </span>
                                <span className="font-semibold text-white text-sm flex-1 truncate">{z.receptura?.asortyment_docelowy?.nazwa}</span>
                                {isCurrent && <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>← to zlecenie</span>}
                              </div>
                              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs mb-1.5">
                                <span style={{ color: 'var(--text-muted)' }}>Plan: <span className="font-mono text-white">{fmtL(z.planowana_ilosc_wyrobu, 3)} {z.receptura?.asortyment_docelowy?.jednostka_miary}</span></span>
                                {z.rzeczywista_ilosc_wyrobu != null && (
                                  <span style={{ color: 'var(--text-muted)' }}>Wykonano: <span className="font-mono" style={{ color: 'var(--ok)' }}>{fmtL(z.rzeczywista_ilosc_wyrobu, 3)} {z.receptura?.asortyment_docelowy?.jednostka_miary}</span></span>
                                )}
                                {wytworzone && (
                                  <span style={{ color: 'var(--text-muted)' }}>Partia: <span className="font-mono" style={{ color: 'var(--text-code)' }}>{wytworzone.partia?.numer_partii || '—'}</span></span>
                                )}
                              </div>
                              {zuzyte.length > 0 && (
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                  {zuzyte.map((r: RuchMagazynowy) => (
                                    <span key={r.id} className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                      {r.partia?.asortyment?.nazwa}: <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{fmtL(Math.abs(r.ilosc), 3)} {r.partia?.asortyment?.jednostka_miary}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

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
      {/* Modal: przywróć zapisany szkic sesji */}
      {wizDraftInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-sm border border-[#334155] p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)' }}>
                <Save className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-white font-bold text-sm">Niezakończona sesja</h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Zapisano: {new Date(wizDraftInfo.savedAt).toLocaleString("pl-PL")}
                </p>
              </div>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Znaleziono zapisany szkic sesji produkcyjnej. Chcesz kontynuować od miejsca, w którym skończyłeś?
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { clearDraft(); setWizDraftInfo(null); wizReset(); fetchData(); setShowWizard(true); }}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                Zacznij od nowa
              </button>
              <button onClick={restoreDraft}
                className="px-4 py-2 rounded-lg text-sm font-bold text-white transition-colors"
                style={{ background: 'var(--accent)' }}>
                Kontynuuj sesję
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ WIZARD SESJI PRODUKCYJNEJ ═══════════════════════════════════════ */}
      {showWizard && (() => {
        const inp2 = { background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' } as const;
        const bazaRec = receptury.find(r => r.id === wizBazaRecId);

        const renderSurowceTable = (
          rows: WizSurowiecBaza[] | WizSurowiecWyrob[],
          setter: (fn: (prev: any[]) => any[]) => void
        ) => (
          <table className="mes-table">
            <thead>
              <tr>
                <th>Składnik</th>
                <th className="text-right">Wymagane łącznie</th>
                <th>Partie / Ilość (w JM gł.)</th>
                <th className="text-right">Dostępne w partii</th>
                <th className="text-center w-12">Akcja</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s: any) => {
                const brak = s.partie.length === 0;
                let usedTotal = 0; s.zuzyte_partie.forEach((zp: any) => usedTotal += zp.ilosc);
                const isAuto = s.zuzyte_partie[0]?.id_partii === "__etap1__";

                return (
                  <tr key={s.id_asortymentu}>
                    <td className="font-medium text-white align-top pt-3">{s.nazwa}</td>
                    <td className="text-right mono font-bold text-white align-top pt-3">
                      <div>{fmtL(s.ilosc_wymagana, 3)} <span className="text-xs opacity-50">{s.jednostka}</span></div>
                      {!isAuto && Math.abs(usedTotal - s.ilosc_jm) > 0.002 && (
                        <div className="text-xs mt-1 text-amber-400 font-bold">
                          Różnica: {fmtL(s.ilosc_jm - usedTotal, 3)}
                        </div>
                      )}
                    </td>
                    <td className="align-top">
                      {isAuto ? (
                         <span className="text-xs text-indigo-400 flex items-center gap-1 mt-3"><Check className="w-3 h-3" />Etap 1 — automatycznie z bazy</span>
                      ) : brak ? (
                         <span className="text-xs text-red-400 flex items-center gap-1 mt-3"><AlertCircle className="w-3 h-3" />Brak partii w magazynie</span>
                      ) : (
                         <div className="flex flex-col gap-2 pt-1 pb-1">
                           {s.zuzyte_partie.map((zp: any, idx: number) => {
                              const wybranaPartia = s.partie.find((p: WizPartia) => p.id === zp.id_partii);
                              return (
                                <div key={zp._uid} className="flex gap-2 items-center">
                                  <select value={zp.id_partii}
                                    onChange={e => setter((prev: any[]) => prev.map((x: any) => x.id_asortymentu === s.id_asortymentu ? { ...x, zuzyte_partie: x.zuzyte_partie.map((z: any) => z._uid === zp._uid ? { ...z, id_partii: e.target.value } : z) } : x))}
                                    className="rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[var(--accent)] w-[180px]" style={inp2}>
                                    <option value="">— wybierz partię —</option>
                                    {s.partie.filter((p: WizPartia) => p.id === zp.id_partii || !s.zuzyte_partie.some((z: any) => z.id_partii === p.id)).map((p: WizPartia) => (
                                      <option key={p.id} value={p.id}>
                                        {p.numer_partii}{p.termin_waznosci ? ` · ${new Date(p.termin_waznosci).toLocaleDateString("pl-PL")}` : ""}
                                      </option>
                                    ))}
                                  </select>
                                  <input type="number" step="0.001" value={zp.ilosc}
                                    onChange={e => {
                                       let val = parseFloat(e.target.value);
                                       if(isNaN(val)) val = 0;
                                       setter((prev: any[]) => prev.map((x: any) => {
                                          if (x.id_asortymentu !== s.id_asortymentu) return x;
                                          const diff = val - zp.ilosc;
                                          let newZp = x.zuzyte_partie.map((z: any) => z._uid === zp._uid ? { ...z, ilosc: val } : { ...z });
                                          if (diff !== 0 && newZp.length > 1) {
                                            let amountToTransfer = Math.abs(diff);
                                            for (let i = 0; i < newZp.length; i++) {
                                               if (newZp[i]._uid !== zp._uid) {
                                                  if (diff > 0 && newZp[i].ilosc > 0) {
                                                     const reduceBy = Math.min(newZp[i].ilosc, amountToTransfer);
                                                     newZp[i].ilosc = Math.round((newZp[i].ilosc - reduceBy) * 1000) / 1000;
                                                     amountToTransfer = Math.round((amountToTransfer - reduceBy) * 1000) / 1000;
                                                  } else if (diff < 0) {
                                                     newZp[i].ilosc = Math.round((newZp[i].ilosc + amountToTransfer) * 1000) / 1000;
                                                     amountToTransfer = 0;
                                                  }
                                                  if (amountToTransfer <= 0) break;
                                               }
                                            }
                                          }
                                          return { ...x, zuzyte_partie: newZp };
                                       }));
                                    }}
                                    className="rounded px-2 py-1 text-xs w-20 text-right mono outline-none focus:ring-1 focus:ring-[var(--accent)]" style={inp2} />
                                  <span className="text-xs opacity-60 w-6">{s.jednostka_glowna}</span>
                                  {s.zuzyte_partie.length > 1 && (
                                     <button onClick={() => setter((prev: any[]) => prev.map((x: any) => x.id_asortymentu === s.id_asortymentu ? { ...x, zuzyte_partie: x.zuzyte_partie.filter((z: any) => z._uid !== zp._uid) } : x))}
                                       className="p-1 rounded text-slate-500 hover:text-red-400 transition-colors ml-1"><X className="w-3.5 h-3.5" /></button>
                                  )}
                                </div>
                              );
                           })}
                         </div>
                      )}
                    </td>
                    <td className="text-right align-top pt-3">
                      {!isAuto && !brak && (
                         <div className="flex flex-col gap-2 pt-1 pb-1">
                           {s.zuzyte_partie.map((zp: any) => {
                              const wybranaPartia = s.partie.find((p: WizPartia) => p.id === zp.id_partii);
                              const dostepne = wybranaPartia?.stan ?? null;
                              const ok = dostepne !== null && dostepne >= zp.ilosc - 0.001;
                              return (
                                <div key={zp._uid} className="h-6 flex items-center justify-end">
                                  {dostepne !== null ? (
                                    <span className={`mono text-sm font-bold ${ok ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {fmtL(dostepne, 3)}
                                    </span>
                                  ) : <span className="text-slate-600 text-xs">—</span>}
                                </div>
                              );
                           })}
                         </div>
                      )}
                    </td>
                    <td className="text-center align-top pt-3">
                       {!isAuto && !brak && (
                           <button onClick={() => setter((prev: any[]) => prev.map((x: any) => x.id_asortymentu === s.id_asortymentu ? { ...x, zuzyte_partie: [...x.zuzyte_partie, { _uid: Math.random().toString(36), id_partii: "", ilosc: Math.max(0, Math.round((x.ilosc_jm - usedTotal) * 1000) / 1000) }] } : x))}
                             className="text-white hover:text-emerald-400 p-1 flex mt-0.5 mx-auto" title="Dodaj kolejną partię">
                             <Plus className="w-4 h-4" />
                           </button>
                       )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        );

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-4xl border border-[#334155] overflow-hidden flex flex-col" style={{ maxHeight: '92vh' }}>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#334155] shrink-0" style={{ background: 'rgba(99,102,241,0.1)' }}>
                <div className="flex items-center gap-3">
                  <Zap className="w-5 h-5 text-indigo-400" />
                  <div>
                    <h3 className="text-base font-bold text-white">Sesja produkcyjna</h3>
                    <p className="text-slate-500 text-xs">{wizStep === 1 ? "Krok 1/3 — Półprodukt (Baza)" : wizStep === 2 ? "Krok 2/3 — Wyroby gotowe i surowce" : "Krok 3/3 — Ilości rzeczywiste i pakowanie"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    {[1,2,3].map(n => (
                      <div key={n} className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ background: n <= wizStep ? 'var(--accent)' : 'var(--bg-surface)', color: n <= wizStep ? '#fff' : 'var(--text-muted)', border: '1px solid var(--border)' }}>
                        {n < wizStep ? <Check className="w-3 h-3" /> : n}
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setShowWizard(false)} className="text-slate-500 hover:text-white p-1.5 rounded-lg hover:bg-[#334155]"><X className="w-5 h-5" /></button>
                </div>
              </div>


              <div className="flex-1 overflow-y-auto">

                {/* ─── KROK 1: Baza ─────────────────────────────────────────────── */}
                {wizStep === 1 && (
                  <div>
                    {/* Selektor receptury + ilość */}
                    <div className="px-5 py-4 border-b border-[#334155] flex items-end gap-4" style={{ background: 'var(--bg-surface)' }}>
                      <div className="flex-1 space-y-1">
                        <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Receptura półproduktu</label>
                        <select value={wizBazaRecId} onChange={e => { setWizBazaRecId(e.target.value); const rec = receptury.find(r => r.id === e.target.value); if (rec) { setWizBazaIlosc(String(rec.wielkosc_produkcji)); setWizBazaRzeczywistaIlosc(String(rec.wielkosc_produkcji)); } }}
                          className="w-full rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]" style={inp2}>
                          <option value="">— wybierz recepturę —</option>
                          {receptury.filter(r => r.asortyment_docelowy.typ_asortymentu === "Polprodukt").map(r => (
                            <option key={r.id} value={r.id}>{r.asortyment_docelowy.nazwa} v{r.numer_wersji}</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-32 space-y-1">
                        <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Ilość (plan)</label>
                        <div className="relative">
                          <input type="text" value={wizBazaIlosc} onChange={e => setWizBazaIlosc(e.target.value)} placeholder="0"
                            className="w-full rounded px-3 py-2 pr-10 text-sm font-mono text-right outline-none focus:ring-1 focus:ring-[var(--accent)]" style={inp2} />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none" style={{ color: 'var(--text-muted)' }}>{bazaRec?.asortyment_docelowy.jednostka_miary}</span>
                        </div>
                      </div>
                      <div className="w-32 space-y-1">
                        <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Ilość (rzeczyw.)</label>
                        <div className="relative">
                          <input type="text" value={wizBazaRzeczywistaIlosc} onChange={e => setWizBazaRzeczywistaIlosc(e.target.value)} placeholder={wizBazaIlosc || "0"}
                            className="w-full rounded px-3 py-2 pr-10 text-sm font-mono text-right outline-none focus:ring-1 focus:ring-[var(--accent)]" style={inp2} />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none" style={{ color: 'var(--text-muted)' }}>{bazaRec?.asortyment_docelowy.jednostka_miary}</span>
                        </div>
                      </div>
                    </div>

                    {/* Tabela surowców bazy */}
                    {wizBazaSurowce.length > 0 ? (
                      <div className="mes-panel">
                        <div className="px-4 py-2 border-b text-xs font-bold uppercase tracking-widest" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>
                          Surowce bazy — pobranie FEFO
                        </div>
                        {renderSurowceTable(wizBazaSurowce, setWizBazaSurowce)}
                      </div>
                    ) : wizBazaRecId ? (
                      <div className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Podaj ilość aby zobaczyć BOM</div>
                    ) : (
                      <div className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Wybierz recepturę półproduktu</div>
                    )}
                  </div>
                )}

                {/* ─── KROK 2: Wyroby + Surowce wyrobów ────────────────────────── */}
                {wizStep === 2 && (
                  <div>
                    {/* Bilans bazy */}
                    <div className="px-5 py-3 border-b border-[#334155] flex items-center gap-6" style={{ background: wizBazaOk ? 'rgba(16,185,129,0.07)' : 'rgba(239,68,68,0.07)' }}>
                      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Bilans bazy</span>
                      <span className="text-sm"><span style={{ color: 'var(--text-muted)' }}>Dostępne </span><strong className="text-white font-mono">{fmtL(wizBazaAvail, 3)} {bazaRec?.asortyment_docelowy.jednostka_miary}</strong></span>
                      <span className="text-sm"><span style={{ color: 'var(--text-muted)' }}>Użyte </span><strong className="font-mono" style={{ color: wizBazaOk ? 'var(--ok)' : 'var(--danger)' }}>{fmtL(wizTotalBazaUsed, 3)}</strong></span>
                      <span className="text-sm"><span style={{ color: 'var(--text-muted)' }}>Pozostaje </span><strong className="font-mono text-white">{fmtL(Math.max(0, wizBazaAvail - wizTotalBazaUsed), 3)}</strong></span>
                      {!wizBazaOk && <AlertTriangle className="w-4 h-4 text-red-400 ml-auto" />}
                    </div>

                    {/* Dodaj wyrób */}
                    <div className="px-5 py-3 border-b border-[#334155] flex gap-2" style={{ background: 'var(--bg-surface)' }}>
                      <select value={wizAddRecId} onChange={e => setWizAddRecId(e.target.value)}
                        className="flex-1 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]" style={inp2}>
                        <option value="">— wybierz recepturę wyrobu gotowego —</option>
                        {receptury.filter(r => r.asortyment_docelowy.typ_asortymentu === "Wyrob_Gotowy" && !wizWyroby.find(w => w.id_receptury === r.id)).map(r => (
                          <option key={r.id} value={r.id}>{r.asortyment_docelowy.nazwa} v{r.numer_wersji}</option>
                        ))}
                      </select>
                      <button onClick={handleAddWyrob} disabled={!wizAddRecId}
                        className="px-4 py-2 rounded text-sm font-semibold text-white disabled:opacity-40 flex items-center gap-1.5"
                        style={{ background: 'var(--accent)' }}>
                        <Plus className="w-4 h-4" />Dodaj
                      </button>
                    </div>

                    {/* Lista wyrobów z ilościami i bilansem bazy */}
                    {wizWyroby.length === 0 ? (
                      <div className="p-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Dodaj wyroby gotowe, które powstaną z bazy</div>
                    ) : (
                      <>
                        <table className="mes-table">
                          <thead>
                            <tr>
                              <th>Wyrób gotowy</th>
                              <th className="text-right">Porcje</th>
                              <th className="text-right">Łączna ilość</th>
                              <th className="text-right">Zużycie bazy</th>
                              <th className="w-8"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {wizWyroby.map(w => {
                              const rec = receptury.find(r => r.id === w.id_receptury);
                              const ilosc = getIloscWyrobu(w);
                              const bazaUse = getBazaUsageForWyrob(w.id_receptury, ilosc);
                              const bazaPerPorcja = getBazaUsageForWyrob(w.id_receptury, rec?.wielkosc_produkcji ?? 1);
                              const maxPorcje = bazaPerPorcja > 0 ? Math.max(0, Math.floor((wizBazaAvail - wizTotalBazaUsed + bazaUse) / bazaPerPorcja)) : 0;
                              const surowceWyrobu = wizWyrobySurowceMap[w._key] || [];
                              return (
                                <React.Fragment key={w._key}>
                                  <tr>
                                    <td className="font-medium text-white">
                                      {rec?.asortyment_docelowy.nazwa}
                                      <span className="ml-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                                        (wsad: {rec?.wielkosc_produkcji} {rec?.asortyment_docelowy.jednostka_miary})
                                      </span>
                                    </td>
                                    <td className="text-right">
                                      <div className="flex items-center justify-end gap-1.5">
                                        {maxPorcje > 0 && (
                                          <button onClick={() => setWizWyroby(prev => prev.map(x => x._key === w._key ? { ...x, liczba_porcji: String(maxPorcje) } : x))}
                                            className="px-1.5 py-0.5 rounded text-xs font-mono font-bold transition-colors"
                                            style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
                                            title={`Maksymalna ilość przy dostępnej bazie: ${maxPorcje} szt.`}>
                                            max
                                          </button>
                                        )}
                                        <input type="text" value={w.liczba_porcji}
                                          onChange={e => setWizWyroby(prev => prev.map(x => x._key === w._key ? { ...x, liczba_porcji: e.target.value } : x))}
                                          className="w-20 rounded px-2 py-1 text-sm font-mono text-right outline-none focus:ring-1 focus:ring-[var(--accent)]" style={inp2} />
                                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>szt.</span>
                                      </div>
                                    </td>
                                    <td className="text-right mono font-bold text-white">
                                      {fmtL(ilosc, 3)} <span className="text-xs opacity-50">{rec?.asortyment_docelowy.jednostka_miary}</span>
                                    </td>
                                    <td className="text-right mono text-sm" style={{ color: bazaUse > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
                                      {bazaUse > 0 ? `${fmtL(bazaUse, 3)} ${bazaRec?.asortyment_docelowy.jednostka_miary}` : '—'}
                                    </td>
                                    <td>
                                      <button onClick={() => setWizWyroby(prev => prev.filter(x => x._key !== w._key))}
                                        className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                  </tr>
                                  {surowceWyrobu.length > 0 && (
                                    <tr>
                                      <td colSpan={5} style={{ padding: 0, background: 'rgba(15,23,42,0.6)' }}>
                                        <div className="px-4 pt-1 pb-3">
                                          <div className="text-xs font-semibold uppercase tracking-wider mb-1 mt-2" style={{ color: 'var(--text-muted)' }}>
                                            Surowce — {rec?.asortyment_docelowy.nazwa}
                                          </div>
                                          {renderSurowceTable(
                                            surowceWyrobu,
                                            fn => setWizWyrobySurowceMap(prev => ({ ...prev, [w._key]: fn(prev[w._key] || []) }))
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </>
                    )}
                  </div>
                )}

                {/* Krok 3 — Ilości rzeczywiste i pakowanie */}
                {wizStep === 3 && (
                  <div className="overflow-y-auto">
                    {wizWyroby.map(w => {
                      const rec = receptury.find(r => r.id === w.id_receptury);
                      const planowana = getIloscWyrobu(w);
                      const real = wizRealizacja[w._key] || { rzeczywista_ilosc: "", opakowania: [] };
                      const setReal = (fn: (prev: WizRealizacjaItem) => WizRealizacjaItem) =>
                        setWizRealizacja(prev => ({ ...prev, [w._key]: fn(prev[w._key] || { rzeczywista_ilosc: "", opakowania: [] }) }));
                      return (
                        <div key={w._key} className="border-b border-[#334155]">
                          <div className="px-5 py-3 flex items-center gap-4" style={{ background: 'var(--bg-surface)' }}>
                            <Package className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
                            <span className="font-semibold text-white text-sm flex-1">{rec?.asortyment_docelowy.nazwa}</span>
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              Planowane: <span className="text-white font-mono">{fmtL(planowana, 3)} {rec?.asortyment_docelowy.jednostka_miary}</span>
                            </span>
                          </div>
                          <div className="px-5 py-4 grid grid-cols-2 gap-6">
                            {/* Ilość rzeczywista */}
                            <div>
                              <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-muted)' }}>
                                Ilość rzeczywista
                              </label>
                              <div className="relative">
                                <input
                                  type="text"
                                  value={fmtL(real.opakowania.reduce((s, o) => s + (parseFloat(o.waga_kg.replace(",", ".")) || 0), 0), 3)}
                                  readOnly
                                  className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none opacity-80 cursor-default pr-12"
                                  style={{ background: 'rgba(0,0,0,0.2)', border: '1px dashed var(--border)', color: 'var(--text-primary)' }}
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none" style={{ color: 'var(--text-muted)' }}>
                                  {rec?.asortyment_docelowy.jednostka_miary}
                                </span>
                              </div>
                              {(() => {
                                const rv = real.opakowania.reduce((s, o) => s + (parseFloat(o.waga_kg.replace(",", ".")) || 0), 0);
                                if (!isNaN(rv) && planowana > 0 && rv > 0.001) {
                                  const diff = rv - planowana;
                                  const pct = (diff / planowana * 100).toFixed(1);
                                  return (
                                    <div className={`text-xs mt-1.5 font-mono ${diff >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                      {diff >= 0 ? '+' : ''}{fmtL(diff, 3)} {rec?.asortyment_docelowy.jednostka_miary} ({pct}%)
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                            {/* Pakowanie */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Pakowanie</label>
                                <button
                                  onClick={() => {
                                    const pozzetti = dostepneOpakowania.find(o => o.nazwa.toLowerCase().includes("pozzetti") || o.nazwa.toLowerCase().includes("pozetti")) || dostepneOpakowania[0];
                                    setReal(prev => ({ ...prev, opakowania: [...prev.opakowania, pozzetti ? { id_asortymentu: pozzetti.id, nazwa: pozzetti.nazwa, waga_kg: "" } : { id_asortymentu: "", nazwa: "", waga_kg: "" }] }));
                                  }}
                                  className="flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors"
                                  style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                                  <Plus className="w-3 h-3" />Dodaj
                                </button>
                              </div>
                              {real.opakowania.length === 0 ? (
                                <div className="text-xs py-2 text-center rounded border border-dashed" style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
                                  Brak opakowań
                                </div>
                              ) : (
                                <div className="space-y-1.5">
                                  {real.opakowania.map((op, idx) => (
                                    <div key={idx} className="flex items-center gap-1.5">
                                      <select
                                        value={op.id_asortymentu}
                                        onChange={e => {
                                          const found = dostepneOpakowania.find(o => o.id === e.target.value);
                                          setReal(prev => ({ ...prev, opakowania: prev.opakowania.map((x, i) => i === idx ? { ...x, id_asortymentu: e.target.value, nazwa: found?.nazwa || "" } : x) }));
                                        }}
                                        className="flex-1 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[var(--accent)]"
                                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                                        {dostepneOpakowania.map(o => <option key={o.id} value={o.id}>{o.nazwa}</option>)}
                                      </select>
                                      <div className="relative">
                                        <input type="text" value={op.waga_kg} placeholder="0.00"
                                          onChange={e => setReal(prev => ({ ...prev, opakowania: prev.opakowania.map((x, i) => i === idx ? { ...x, waga_kg: e.target.value } : x) }))}
                                          className="w-20 text-right rounded px-2 py-1 text-xs font-mono outline-none focus:ring-1 focus:ring-[var(--accent)] pr-6"
                                          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs pointer-events-none" style={{ color: 'var(--text-muted)' }}>kg</span>
                                      </div>
                                      <button onClick={() => setReal(prev => ({ ...prev, opakowania: prev.opakowania.filter((_, i) => i !== idx) }))}
                                        className="text-slate-600 hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                  ))}
                                  {(() => {
                                    const totalOp = real.opakowania.reduce((s, o) => s + (parseFloat(o.waga_kg.replace(",", ".")) || 0), 0);
                                    return (
                                      <div className="text-xs font-mono pt-0.5 space-y-0.5">
                                        <div className="text-right" style={{ color: 'var(--text-muted)' }}>
                                          Razem: <span className="text-white font-bold">{fmtL(totalOp, 3)}</span> kg
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-[#334155] bg-[#0f172a]/50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <button onClick={() => wizStep === 1 ? setShowWizard(false) : setWizStep(prev => (prev - 1) as 1|2|3)}
                    className="px-4 py-2 text-slate-400 hover:bg-[#334155] rounded-lg font-semibold transition-colors text-sm">
                    {wizStep === 1 ? "Anuluj" : "← Wstecz"}
                  </button>
                  <button onClick={saveDraft}
                    className="px-3 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5"
                    style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}
                    title="Zapisz postęp i wyjdź — możesz wrócić później">
                    <Save className="w-3.5 h-3.5" /> Zapisz i wyjdź
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  {wizStep === 3 && (
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {1 + wizWyroby.length} ZP · jedna transakcja
                    </span>
                  )}
                  {wizStep < 3 ? (
                    <button onClick={handleWizNext}
                      className="px-5 py-2 rounded-lg font-bold text-white text-sm flex items-center gap-2 transition-colors"
                      style={{ background: 'var(--accent)' }}>
                      {wizStep === 1 ? "Dalej — Wyroby →" : "Dalej — Realizacja →"}
                    </button>
                  ) : (
                    <button onClick={handleSubmitWizard} disabled={wizLoading}
                      className="px-5 py-2 rounded-lg font-bold text-white text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
                      style={{ background: '#16a34a' }}>
                      {wizLoading ? <><RotateCcw className="w-4 h-4 animate-spin" />Tworzę…</> : <><CheckCircle2 className="w-4 h-4" />Utwórz sesję</>}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
                <div className="flex justify-center p-8"><Spinner /></div>
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
