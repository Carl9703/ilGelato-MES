import React, { useState, useEffect, useCallback } from "react";
import {
  FileText, Printer, Search, Tag, X, Plus, PackageOpen,
  ArrowRightCircle, AlertCircle, Save, Eye, Trash2, ChevronDown, ChevronUp, Copy,
  CheckCircle, Ban, Clock
} from "lucide-react";
import AsortymentSelektor, { WybranyTowar } from "../components/AsortymentSelektor";
import { fmtL } from "../utils/fmt";
import ConfirmModal from "../components/ConfirmModal";
import { Spinner } from "../components/Spinner";
import { EmptyState } from "../components/EmptyState";
import { useToast } from "../components/Toast";

// ─── Typy ────────────────────────────────────────────────────────────────────

type Pozycja = {
  asortyment: string; kod_towaru: string; numer_partii: string;
  ilosc: number; jednostka: string; termin_waznosci: string | null; data_produkcji: string | null;
};
type Kontrahent = { id: string; kod: string; nazwa: string };
type Dokument = {
  referencja: string; typ: string; data: string; uzytkownik: string;
  numer_zlecenia: string | null; pozycje: Pozycja[]; wartosc_calkowita: number;
  status: string; // Bufor | Zatwierdzony | Anulowany
  kontrahent: Kontrahent | null;
};
type Etykieta = {
  numer_partii: string; nazwa_produktu: string; kod_towaru: string;
  data_produkcji: string | null; termin_waznosci: string | null; jednostka: string; qr_code: string;
};
type OpakowaniePozycja = { id_asortymentu: string; nazwa: string; waga_kg: number };
type PartiaDostepna = {
  id: string; numer_partii: string;
  asortyment: { nazwa: string; jednostka_miary: string }; stan: number; termin_waznosci: string | null;
  opakowania?: OpakowaniePozycja[] | null;
};

// ─── Typy dla pozycji w formularzu ───────────────────────────────────────────

type PzRow = {
  _key: string;
  id_asortymentu: string;
  nazwa: string;
  jednostka_miary: string;
  numer_partii: string;
  ilosc: string;
  cena_jednostkowa: string;
  data_produkcji: string;
  termin_waznosci: string;
  _open: boolean;
  _autoPartia: boolean; // czy numer_partii był auto-uzupełniony (można nadpisać przy zmianie prefiksu)
};

type WzRow = {
  _key: string;
  id_asortymentu: string;
  nazwa: string;
  jednostka_miary: string;
  id_partii: string;
  ilosc: string;
  sztuki: Record<string, number>; // nazwa_opakowania -> szt
  dostepnePartie: PartiaDostepna[];
  loadingPartie: boolean;
};

const typColors: Record<string, string> = {
  PZ: "bg-emerald-500/20 text-emerald-300",
  PW: "bg-blue-500/20 text-blue-300",
  RW: "bg-red-500/20 text-red-300",
  WZ: "bg-orange-500/20 text-orange-300",
};

const statusCfg: Record<string, { bg: string; color: string; border: string; label: string; Icon: React.ElementType }> = {
  Bufor:        { bg: 'rgba(148,163,184,.1)',  color: '#94a3b8', border: 'rgba(148,163,184,.3)', label: 'BUFOR',        Icon: Clock       },
  Zatwierdzony: { bg: 'rgba(34,197,94,.12)',   color: '#22c55e', border: 'rgba(34,197,94,.3)',   label: 'ZATWIERDZONY', Icon: CheckCircle },
  Anulowany:    { bg: 'rgba(239,68,68,.12)',   color: '#ef4444', border: 'rgba(239,68,68,.3)',   label: 'ANULOWANY',    Icon: Ban         },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = statusCfg[status] || statusCfg.Bufor;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
      <cfg.Icon style={{ width: 10, height: 10 }} />
      {cfg.label}
    </span>
  );
}

let _keyCounter = 0;
const genKey = () => String(++_keyCounter);

// ─────────────────────────────────────────────────────────────────────────────

export default function Dokumenty() {
  const [dokumenty, setDokumenty] = useState<Dokument[]>([]);
  const [filter, setFilter] = useState("PZ");
  const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  // Etykiety
  const [etykieta, setEtykieta] = useState<Etykieta | null>(null);
  const [etykietaInput, setEtykietaInput] = useState("");
  const [etykietaError, setEtykietaError] = useState("");
  const [showEtykiety, setShowEtykiety] = useState(false);

  // Modals
  const [showPz, setShowPz] = useState(false);
  const [showWz, setShowWz] = useState(false);
  const [showSelektor, setShowSelektor] = useState(false);
  const [selektorTryb, setSelektorTryb] = useState<"pz" | "wz">("pz");

  // Formularz PZ
  const [pzRows, setPzRows] = useState<PzRow[]>([]);
  const [pzReferencja, setPzReferencja] = useState("");
  const [nextPzNumber, setNextPzNumber] = useState("");

  // Formularz WZ
  const [wzRows, setWzRows] = useState<WzRow[]>([]);
  const [wzReferencja, setWzReferencja] = useState("");
  const [wzKontrahentId, setWzKontrahentId] = useState("");
  const [kontrahenci, setKontrahenci] = useState<Kontrahent[]>([]);

  // Podgląd dokumentu
  const [previewDocRef, setPreviewDocRef] = useState<string | null>(null);
  const [previewDocData, setPreviewDocData] = useState<any>(null);
  const [previewDocLoading, setPreviewDocLoading] = useState(false);

  // Akcje na dokumentach
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: 'anuluj' | 'usun'; ref: string } | null>(null);

  const openDocPreview = async (ref: string) => {
    setPreviewDocRef(ref);
    setPreviewDocData(null);
    setPreviewDocLoading(true);
    try {
      const res = await fetch(`/api/dokumenty/podglad/${encodeURIComponent(ref)}`);
      if (res.ok) setPreviewDocData(await res.json());
    } catch (e) { console.error(e); } finally { setPreviewDocLoading(false); }
  };

  const handleZatwierdz = async (ref: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActionLoading(ref);
    try {
      const res = await fetch(`/api/dokumenty/${encodeURIComponent(ref)}/zatwierdz`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast(`Dokument ${ref} zatwierdzony.`, "ok");
      fetchDokumenty();
      if (previewDocRef === ref) openDocPreview(ref);
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleAnuluj = async (ref: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setConfirmAction({ type: 'anuluj', ref });
  };

  const doAnuluj = async (ref: string) => {
    setActionLoading(ref);
    try {
      const res = await fetch(`/api/dokumenty/${encodeURIComponent(ref)}/anuluj`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast(`Dokument ${ref} anulowany.`, "ok");
      fetchDokumenty();
      if (previewDocRef === ref) openDocPreview(ref);
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleUsun = async (ref: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setConfirmAction({ type: 'usun', ref });
  };

  const doUsun = async (ref: string) => {
    setActionLoading(ref);
    try {
      const res = await fetch(`/api/dokumenty/${encodeURIComponent(ref)}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast(`Dokument ${ref} usunięty.`, "ok");
      if (previewDocRef === ref) setPreviewDocRef(null);
      fetchDokumenty();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => { fetchDokumenty(); }, [filter]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (previewDocRef) { setPreviewDocRef(null); return; }
      if (showSelektor) { setShowSelektor(false); return; }
      if (showPz) { setShowPz(false);  return; }
      if (showWz) { setShowWz(false);  return; }
      if (showEtykiety) { setShowEtykiety(false); return; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [previewDocRef, showSelektor, showPz, showWz, showEtykiety]);

  // Gdy zmienia się referencja lub nextPzNumber, odśwież auto-uzupełnione numery partii
  useEffect(() => {
    if (!showPz) return;
    const prefix = pzReferencja.trim() || nextPzNumber;
    if (!prefix) return;
    setPzRows(prev => {
      // Przenumeruj tylko te wiersze które były auto-uzupełnione
      let pos = 0;
      return prev.map(r => {
        pos++;
        if (r._autoPartia) return { ...r, numer_partii: `${prefix}-${pos}` };
        return r;
      });
    });
  }, [pzReferencja, nextPzNumber, showPz]);

  const fetchDokumenty = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dokumenty?typ=${filter}`);
      if (res.ok) setDokumenty(await res.json());
    } catch {} finally { setLoading(false); }
  };

  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("pl-PL") : "—";
  const fmtFull = (d: string) =>
    new Date(d).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  // ─── Otwieranie PZ ─────────────────────────────────────────────────────────

  const openPzModal = async () => {
    setPzRows([]);
    setPzReferencja("");
    setNextPzNumber("");
    
    setShowPz(true);
    try {
      const res = await fetch("/api/next-doc-number/PZ");
      if (res.ok) {
        const data = await res.json();
        setNextPzNumber(data.number);
      }
    } catch {}
  };

  const openPzSelektor = () => {
    setSelektorTryb("pz");
    setShowSelektor(true);
  };

  const onSelektorPzConfirm = (wybrane: WybranyTowar[]) => {
    setShowSelektor(false);
    setPzRows(prev => {
      const prefix = pzReferencja.trim() || nextPzNumber;
      const startIdx = prev.length + 1;
      const newRows: PzRow[] = wybrane.map((w, i) => ({
        _key: genKey(),
        id_asortymentu: w.id_asortymentu,
        nazwa: w.nazwa,
        jednostka_miary: w.jednostka_miary,
        numer_partii: prefix ? `${prefix}-${startIdx + i}` : "",
        ilosc: w.ilosc || "",
        cena_jednostkowa: "",
        data_produkcji: "",
        termin_waznosci: "",
        _open: true,
        _autoPartia: !!prefix,
      }));
      return [...prev, ...newRows];
    });
  };

  const updatePzRow = (key: string, field: keyof PzRow, value: any) => {
    setPzRows(prev => prev.map(r => {
      if (r._key !== key) return r;
      if (field === "numer_partii") return { ...r, numer_partii: value, _autoPartia: false };
      return { ...r, [field]: value };
    }));
  };

  const removePzRow = (key: string) => {
    setPzRows(prev => {
      const filtered = prev.filter(r => r._key !== key);
      const prefix = pzReferencja.trim() || nextPzNumber;
      if (!prefix) return filtered;
      let pos = 0;
      return filtered.map(r => {
        pos++;
        if (r._autoPartia) return { ...r, numer_partii: `${prefix}-${pos}` };
        return r;
      });
    });
  };

  const handleCreatePz = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (pzRows.length === 0) { showToast("Dodaj co najmniej jedną pozycję do dokumentu.", "error"); return; }
    const missing = pzRows.find(r => !r.numer_partii.trim() || !r.ilosc);
    if (missing) { showToast(`Pozycja "${missing.nazwa}" wymaga numeru partii i ilości.`, "error"); return; }
    try {
      const pozycje = pzRows.map(r => ({
        id_asortymentu: r.id_asortymentu,
        numer_partii: r.numer_partii.trim(),
        ilosc: parseFloat(r.ilosc),
        cena_jednostkowa: r.cena_jednostkowa ? parseFloat(r.cena_jednostkowa) : null,
        data_produkcji: r.data_produkcji || null,
        termin_waznosci: r.termin_waznosci || null,
      }));
      const res = await fetch("/api/magazyn/pz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pozycje, referencja_zewnetrzna: pzReferencja || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setShowPz(false);
      showToast("Dokument PZ zapisany w buforze. Zatwierdź go aby zaktualizować stany magazynowe.", "ok");
      fetchDokumenty();
      
    } catch (err: any) { showToast(err.message, "error"); }
  };

  // ─── Otwieranie WZ ─────────────────────────────────────────────────────────

  const openWzModal = async () => {
    setWzRows([]);
    setWzReferencja("");
    setWzKontrahentId("");
    
    setShowWz(true);
    try {
      const res = await fetch("/api/kontrahenci");
      if (res.ok) setKontrahenci(await res.json());
    } catch {}
  };

  const openWzSelektor = () => {
    setSelektorTryb("wz");
    setShowSelektor(true);
  };

  const onSelektorWzConfirm = useCallback(async (wybrane: WybranyTowar[]) => {
    setShowSelektor(false);
    const newRows: WzRow[] = wybrane.map(w => ({
      _key: genKey(),
      id_asortymentu: w.id_asortymentu,
      nazwa: w.nazwa,
      jednostka_miary: w.jednostka_miary,
      id_partii: "",
      ilosc: w.ilosc || "",
      sztuki: {},
      dostepnePartie: [],
      loadingPartie: true,
    }));
    setWzRows(prev => [...prev, ...newRows]);

    // Pobierz dostępne partie dla każdego asortymentu
    for (const row of newRows) {
      try {
        const res = await fetch(`/api/asortyment/${row.id_asortymentu}`);
        if (res.ok) {
          const detail = await res.json();
          const partie: PartiaDostepna[] = (detail.zasoby || [])
            .filter((z: any) => z.dostepne > 0)
            .map((z: any) => ({
              id: z.id_partii,
              numer_partii: z.numer_partii,
              asortyment: { nazwa: row.nazwa, jednostka_miary: row.jednostka_miary },
              stan: z.dostepne,
              termin_waznosci: z.termin_waznosci,
              opakowania: z.opakowania || null,
            }));
          setWzRows(prev => prev.map(r =>
            r._key === row._key ? { ...r, dostepnePartie: partie, loadingPartie: false } : r
          ));
        }
      } catch {
        setWzRows(prev => prev.map(r => r._key === row._key ? { ...r, loadingPartie: false } : r));
      }
    }
  }, []);

  const updateWzRow = (key: string, field: keyof WzRow, value: any) => {
    setWzRows(prev => prev.map(r => r._key === key ? { ...r, [field]: value } : r));
  };

  const updateWzSztuki = (key: string, opKey: string, szt: number, allOp: OpakowaniePozycja[]) => {
    setWzRows(prev => prev.map(r => {
      if (r._key !== key) return r;
      const newSztuki = { ...r.sztuki, [opKey]: szt };
      const unikalne = Object.values(allOp.reduce((acc: Record<string, OpakowaniePozycja>, op) => { 
        const k = `${op.id_asortymentu}_${op.waga_kg}`;
        if (!acc[k]) acc[k] = op; 
        return acc; 
      }, {}));
      const totalKg = unikalne.reduce((sum, op) => sum + (newSztuki[`${op.id_asortymentu}_${op.waga_kg}`] || 0) * op.waga_kg, 0);
      return { ...r, sztuki: newSztuki, ilosc: Math.round(totalKg * 1000) / 1000 + "" };
    }));
  };

  const removeWzRow = (key: string) => {
    setWzRows(prev => prev.filter(r => r._key !== key));
  };

  const handleCreateWz = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (wzRows.length === 0) { showToast("Dodaj co najmniej jedną pozycję.", "error"); return; }
    const missing = wzRows.find(r => !r.id_partii || !r.ilosc);
    if (missing) { showToast(`Pozycja "${missing.nazwa}" wymaga wybrania partii i podania ilości.`, "error"); return; }
    if (!wzKontrahentId) { showToast("Wybierz kontrahenta (odbiorcę).", "error"); return; }
    try {
      const items = wzRows.map(r => {
        const partia = r.dostepnePartie.find(p => p.id === r.id_partii);
        const typy: OpakowaniePozycja[] = partia?.opakowania
          ? Object.values(partia.opakowania.reduce((acc: Record<string, OpakowaniePozycja>, op) => {
              const k = `${op.id_asortymentu}_${op.waga_kg}`;
              if (!acc[k]) acc[k] = op; return acc;
            }, {}))
          : [];
        const sztukiLabels: Record<string, number> = {};
        typy.forEach(op => {
          const szt = r.sztuki[`${op.id_asortymentu}_${op.waga_kg}`] || 0;
          if (szt > 0) sztukiLabels[`${op.nazwa} (${op.waga_kg} kg)`] = szt;
        });
        return { id_partii: r.id_partii, ilosc: parseFloat(r.ilosc), sztuki: sztukiLabels };
      });
      const res = await fetch("/api/magazyn/wz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, referencja_zewnetrzna: wzReferencja || undefined, id_kontrahenta: wzKontrahentId }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setShowWz(false);
      showToast("Dokument WZ zapisany w buforze. Zatwierdź go aby zaktualizować stany magazynowe.", "ok");
      fetchDokumenty();
      
    } catch (err: any) { showToast(err.message, "error"); }
  };

  // ─── Etykiety ──────────────────────────────────────────────────────────────

  const handleFetchEtykieta = async () => {
    if (!etykietaInput.trim()) { setEtykietaError("Podaj numer partii"); return; }
    setEtykietaError("");
    try {
      const res = await fetch(`/api/etykieta/${encodeURIComponent(etykietaInput.trim())}`);
      if (!res.ok) throw new Error((await res.json()).error);
      setEtykieta(await res.json());
    } catch (err: any) { setEtykietaError(err.message); setEtykieta(null); }
  };

  const handlePrintEtykieta = () => {
    if (!etykieta) return;
    const win = window.open("", "_blank", "width=400,height=500");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Etykieta ${etykieta.numer_partii}</title><style>body{font-family:Inter,system-ui,sans-serif;margin:0;padding:0;display:flex;justify-content:center;align-items:flex-start} .label{width:80mm;padding:5mm;border:2px solid #000;box-sizing:border-box} .label h2{margin:0 0 2mm;font-size:16px;text-align:center;border-bottom:2px solid #000;padding-bottom:3mm} .label .row{display:flex;justify-content:space-between;font-size:11px;margin:2mm 0} .label .row .key{color:#666;font-weight:600} .label .row .val{font-weight:700} .label .qr{text-align:center;margin:4mm 0 2mm} .label .qr img{width:35mm;height:35mm} .label .batch{text-align:center;font-family:monospace;font-size:14px;font-weight:900;margin-top:2mm;letter-spacing:1px} @media print{body{margin:0}@page{size:80mm auto;margin:0}}</style></head><body><div class="label"><h2>${etykieta.nazwa_produktu}</h2><div class="row"><span class="key">Kod:</span><span class="val">${etykieta.kod_towaru}</span></div><div class="row"><span class="key">Data produkcji:</span><span class="val">${fmt(etykieta.data_produkcji)}</span></div><div class="row"><span class="key">Ważne do:</span><span class="val" style="color:${etykieta.termin_waznosci ? '#dc2626' : '#000'}">${fmt(etykieta.termin_waznosci)}</span></div><div class="qr"><img src="${etykieta.qr_code}" alt="QR" /></div><div class="batch">${etykieta.numer_partii}</div></div></body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  const handleCopyDoc = (doc: any) => {
    if (doc.typ !== "PZ") return; // Na razie tylko PZ
    
    // Zamknij podgląd
    setPreviewDocRef(null);
    
    // Przygotuj wiersze PZ
    const newRows: PzRow[] = doc.pozycje.map((p: any) => ({
      _key: genKey(),
      id_asortymentu: p.id_asortymentu || "",
      nazwa: p.asortyment,
      jednostka_miary: p.jednostka,
      numer_partii: p.numer_partii,
      ilosc: String(p.ilosc),
      cena_jednostkowa: p.cena_jednostkowa != null ? String(p.cena_jednostkowa) : "",
      data_produkcji: p.data_produkcji ? p.data_produkcji.split("T")[0] : "",
      termin_waznosci: p.termin_waznosci ? p.termin_waznosci.split("T")[0] : "",
      _open: false,
      _autoPartia: false,
    }));
    
    setPzRows(newRows);
    setPzReferencja("");
    setShowPz(true);
  };

  const handlePrintDoc = (doc: Dokument) => {
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return;
    const pozycjeHTML = doc.pozycje.map(p =>
      `<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb">${p.asortyment}</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;font-family:monospace">${p.numer_partii}</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:bold">${fmtL(p.ilosc, 3)} ${p.jednostka}</td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${fmt(p.termin_waznosci)}</td></tr>`
    ).join("");
    win.document.write(`<!DOCTYPE html><html><head><title>${doc.referencja}</title><style>body{font-family:Inter,system-ui,sans-serif;padding:40px;color:#1e293b;max-width:800px;margin:0 auto} h1{font-size:24px;margin:0 0 4px} .meta{color:#64748b;font-size:13px;margin-bottom:24px} table{width:100%;border-collapse:collapse;margin-top:16px} th{text-align:left;padding:8px;border-bottom:2px solid #334155;font-size:12px;text-transform:uppercase;color:#64748b} .badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;margin-left:8px} @media print{body{padding:20px}}</style></head><body><h1>${doc.referencja} <span class="badge" style="background:#e0e7ff;color:#4338ca">${doc.typ}</span></h1><div class="meta">${fmtFull(doc.data)} · Wystawił: ${doc.uzytkownik}</div><table><thead><tr><th>Asortyment</th><th>Nr Partii</th><th style="text-align:right">Ilość</th><th>Ważność</th></tr></thead><tbody>${pozycjeHTML}</tbody></table></body></html>`);
    win.document.close();
    win.print();
  };

  const handlePrintAllLabels = async (referencja: string) => {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(`<html><head><title>Etykiety – ${referencja}</title><style>
      body{margin:0;padding:10px;font-family:Inter,system-ui,sans-serif;background:#f8fafc}
      .grid{display:flex;flex-wrap:wrap;gap:8px;padding:8px}
      .label{width:80mm;border:1.5px solid #1e293b;border-radius:4px;padding:5mm;box-sizing:border-box;background:#fff;page-break-inside:avoid}
      .label-header{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;border-bottom:1px solid #e2e8f0;padding-bottom:2mm;margin-bottom:2mm}
      .label-name{font-size:13px;font-weight:800;color:#0f172a;line-height:1.3;margin-bottom:1.5mm}
      .label-code{font-family:monospace;font-size:10px;color:#3b82f6;margin-bottom:2mm}
      .label-row{display:flex;justify-content:space-between;font-size:10px;margin:1mm 0}
      .label-row .k{color:#64748b;font-weight:600}
      .label-row .v{font-weight:700;color:#0f172a;font-family:monospace}
      .label-row .v.warn{color:#dc2626}
      .label-qr{text-align:center;margin:2mm 0}
      .label-qr img{width:30mm;height:30mm}
      .label-batch{text-align:center;font-family:monospace;font-size:11px;font-weight:900;letter-spacing:.5px;margin-top:1mm;color:#1e293b}
      @media print{body{background:#fff;padding:0}.grid{gap:4px;padding:4px}@page{size:A4;margin:8mm}}
    </style></head><body><div class="grid"><div style="width:100%;font-size:11px;color:#64748b;padding:4px 0 8px;font-weight:600">
      Etykiety dla dokumentu: <strong style="color:#0f172a">${referencja}</strong> — ładowanie…
    </div></div></body></html>`);
    win.document.close();

    const res = await fetch(`/api/etykiety-dokumentu/${encodeURIComponent(referencja)}`);
    if (!res.ok) { win.close(); alert("Błąd pobierania etykiet"); return; }
    const etykiety: any[] = await res.json();

    const labelsHTML = etykiety.map(e => `
      <div class="label">
        <div class="label-header">Poz. ${e.lp} · ${referencja}</div>
        <div class="label-name">${e.nazwa}</div>
        <div class="label-code">${e.kod_towaru}</div>
        <div class="label-row"><span class="k">Partia</span><span class="v">${e.numer_partii}</span></div>
        <div class="label-row"><span class="k">Ilość</span><span class="v">${fmtL(e.ilosc, 3)} ${e.jednostka}</span></div>
        ${e.data_produkcji ? `<div class="label-row"><span class="k">Data produkcji</span><span class="v">${new Date(e.data_produkcji).toLocaleDateString('pl-PL')}</span></div>` : ''}
        ${e.termin_waznosci ? `<div class="label-row"><span class="k">Ważne do</span><span class="v warn">${new Date(e.termin_waznosci).toLocaleDateString('pl-PL')}</span></div>` : ''}
        <div class="label-batch">${e.numer_partii}</div>
      </div>
    `).join('');

    win.document.body.innerHTML = `<div class="grid">
      <div style="width:100%;font-size:11px;color:#64748b;padding:4px 0 8px;font-weight:600">
        Etykiety · <strong style="color:#0f172a">${referencja}</strong> · ${etykiety.length} szt.
        <button onclick="window.print()" style="margin-left:12px;padding:4px 12px;background:#1e293b;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px">🖨 Drukuj</button>
      </div>
      ${labelsHTML}
    </div>`;
  };

  const filteredDocs = dokumenty.filter(d => {
    const docDate = new Date(d.data);
    const matchesMonth = !selectedMonth || (docDate.getMonth() + 1).toString() === selectedMonth;
    const matchesYear = !selectedYear || docDate.getFullYear().toString() === selectedYear;
    
    const matchesSearch = !search ||
      d.referencja.toLowerCase().includes(search.toLowerCase()) ||
      d.pozycje.some(p => p.asortyment.toLowerCase().includes(search.toLowerCase()) || p.numer_partii.toLowerCase().includes(search.toLowerCase()));
      
    return matchesMonth && matchesYear && matchesSearch;
  });

  const months = [
    { v: "1", l: "Styczeń" }, { v: "2", l: "Luty" }, { v: "3", l: "Marzec" },
    { v: "4", l: "Kwiecień" }, { v: "5", l: "Maj" }, { v: "6", l: "Czerwiec" },
    { v: "7", l: "Lipiec" }, { v: "8", l: "Sierpień" }, { v: "9", l: "Wrzesień" },
    { v: "10", l: "Październik" }, { v: "11", l: "Listopad" }, { v: "12", l: "Grudzień" }
  ];
  const years = Array.from(new Set(dokumenty.map(d => new Date(d.data).getFullYear().toString()))).sort((a, b) => b > a ? 1 : -1);

  // ─── RENDER ──────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col gap-3">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-white tracking-wide">Dokumenty</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Rejestr i wystawianie dokumentów magazynowych</p>
        </div>
        <div className="flex gap-2 items-center">
<button onClick={openWzModal}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold text-sm transition-colors btn-hover-effect"
            style={{ background: '#c2410c', color: '#fff' }}>
            <ArrowRightCircle className="w-4 h-4" /> Nowy WZ
          </button>
          <button onClick={openPzModal}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold text-sm transition-colors btn-hover-effect"
            style={{ background: '#16a34a', color: '#fff' }}>
            <PackageOpen className="w-4 h-4" /> Nowy PZ
          </button>
        </div>
      </div>

      {/* Etykiety panel */}
      {showEtykiety && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5 space-y-4 shrink-0">
          <h3 className="text-amber-300 font-bold text-sm uppercase flex items-center gap-2">
            <Tag className="w-4 h-4" />Drukuj Etykietę
          </h3>
          <div className="flex gap-2">
            <input
              type="text" value={etykietaInput} onChange={e => setEtykietaInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleFetchEtykieta()}
              placeholder="Skanuj lub wpisz numer partii..." autoFocus
              className="flex-1 bg-[#334155] border border-[#475569] text-white rounded-xl px-4 py-3 outline-none focus:border-amber-500 font-mono"
            />
            <button onClick={handleFetchEtykieta} className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-3 rounded-xl font-bold min-h-[48px]">Generuj</button>
          </div>
          {etykietaError && <div className="text-red-400 text-sm">{etykietaError}</div>}
          {etykieta && (
            <div className="bg-white rounded-2xl p-6 max-w-sm mx-auto text-center mt-4">
              <h3 className="text-black font-bold text-lg border-b-2 border-black pb-2 mb-3">{etykieta.nazwa_produktu}</h3>
              <div className="text-left space-y-1 text-sm text-gray-700">
                <div className="flex justify-between"><span className="font-semibold text-gray-500">Kod:</span><span className="font-bold">{etykieta.kod_towaru}</span></div>
                <div className="flex justify-between"><span className="font-semibold text-gray-500">Produkcja:</span><span className="font-bold">{fmt(etykieta.data_produkcji)}</span></div>
                <div className="flex justify-between"><span className="font-semibold text-gray-500">Ważne do:</span><span className="font-bold text-red-600">{fmt(etykieta.termin_waznosci)}</span></div>
              </div>
              <img src={etykieta.qr_code} alt="QR" className="w-32 h-32 mx-auto my-3" />
              <div className="font-mono font-black text-lg tracking-wider text-black">{etykieta.numer_partii}</div>
              <button onClick={handlePrintEtykieta} className="mt-4 bg-gray-900 hover:bg-gray-800 text-white px-6 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 w-full">
                <Printer className="w-4 h-4" /> Drukuj
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══ MODAL PZ ══════════════════════════════════════════════════════════ */}
      {showPz && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm pl-16 lg:pl-60 pr-4">
          <div className="bg-[#1e293b] shadow-2xl border border-[#334155] flex flex-col overflow-hidden" style={{ height: '80vh', marginTop: '10vh' }}>

            {/* Nagłówek */}
            <div className="flex justify-between items-center p-5 border-b border-[#334155] bg-emerald-900/20 shrink-0">
              <h3 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
                <PackageOpen className="w-5 h-5" /> Nowy dokument PZ — Przyjęcie zewnętrzne
              </h3>
              <button onClick={() => { setShowPz(false);  }} className="text-slate-500 hover:text-white p-2 rounded-lg hover:bg-[#334155]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePz} className="flex flex-col flex-1 overflow-hidden">
              <div className="overflow-y-auto flex-1 p-5 space-y-5">
                {/* Referencja zewnętrzna */}
                <div className="bg-[#0f172a] p-4 rounded-xl border border-[#334155]">
                  <label className="block text-slate-400 text-xs font-bold uppercase mb-2">Numer zewnętrzny (f-ra / WZ dostawcy) — opcjonalnie</label>
                  <input
                    type="text" value={pzReferencja} onChange={e => setPzReferencja(e.target.value)}
                    placeholder="np. FV/2026/03/001 lub WZ-DOST-123"
                    className="w-full md:w-1/2 bg-[#334155] border border-[#475569] text-white rounded-xl px-4 py-3 outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                {/* Pozycje */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-white font-bold text-sm uppercase tracking-wide">
                      Pozycje dokumentu
                      {pzRows.length > 0 && <span className="ml-2 px-2 py-0.5 bg-emerald-600/20 text-emerald-400 rounded-full text-xs">{pzRows.length}</span>}
                    </h4>
                    <button
                      type="button"
                      onClick={openPzSelektor}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors min-h-[44px]"
                    >
                      <Plus className="w-4 h-4" /> Dodaj pozycję
                    </button>
                  </div>

                  {pzRows.length === 0 ? (
                    <div
                      onClick={openPzSelektor}
                      className="border-2 border-dashed border-[#334155] hover:border-emerald-500/50 rounded-xl p-8 text-center cursor-pointer transition-colors group"
                    >
                      <PackageOpen className="w-8 h-8 text-slate-600 group-hover:text-emerald-500/50 mx-auto mb-2 transition-colors" />
                      <p className="text-slate-500 group-hover:text-slate-400 font-semibold text-sm">Kliknij aby wybrać towary z asortymentu</p>
                    </div>
                  ) : (
                    <div className="rounded-xl overflow-hidden border border-[#334155]">
                      {/* Nagłówek tabeli */}
                      <div className="grid bg-[#0f172a] border-b border-[#334155] text-[10px] font-bold uppercase tracking-widest text-slate-500"
                        style={{ gridTemplateColumns: '28px 1fr 200px 100px 110px 120px 32px', padding: '6px 8px', gap: 6 }}>
                        <div>#</div>
                        <div>Towar</div>
                        <div>Nr partii *</div>
                        <div className="text-right">Ilość *</div>
                        <div>Termin ważności</div>
                        <div />
                      </div>

                      {/* Wiersze */}
                      {pzRows.map((row, idx) => (
                        <div key={row._key}
                          className="grid items-center border-b border-[#1e293b] last:border-b-0 hover:bg-[#1e293b]/40 transition-colors"
                          style={{ gridTemplateColumns: '28px 1fr 200px 100px 120px 32px', padding: '4px 8px', gap: 6 }}>

                          {/* # */}
                          <div className="text-[11px] font-mono font-bold text-slate-500 text-center">{idx + 1}</div>

                          {/* Nazwa */}
                          <div className="min-w-0">
                            <div className="text-white text-[12px] font-semibold truncate">{row.nazwa}</div>
                            <div className="text-slate-500 text-[10px] font-mono">{row.jednostka_miary}</div>
                          </div>

                          {/* Nr partii */}
                          <input
                            type="text"
                            value={row.numer_partii}
                            onChange={e => updatePzRow(row._key, "numer_partii", e.target.value)}
                            placeholder="auto"
                            className="w-full text-[11px] font-mono outline-none rounded px-2 py-1.5 transition-colors"
                            style={{
                              background: 'var(--bg-input)',
                              border: `1px solid ${row._autoPartia ? 'rgba(34,197,94,.4)' : 'var(--border)'}`,
                              color: row._autoPartia ? '#86efac' : 'var(--text-primary)',
                            }}
                          />

                          {/* Ilość */}
                          <input
                            type="number" step="0.001" min="0"
                            value={row.ilosc}
                            onChange={e => updatePzRow(row._key, "ilosc", e.target.value)}
                            placeholder="0"
                            className="w-full text-[12px] font-mono font-bold text-right outline-none rounded px-2 py-1.5"
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#4ade80' }}
                          />

                          {/* Termin ważności */}
                          <input
                            type="date"
                            value={row.termin_waznosci}
                            onChange={e => updatePzRow(row._key, "termin_waznosci", e.target.value)}
                            className="w-full text-[11px] outline-none rounded px-2 py-1.5"
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', colorScheme: 'dark' }}
                          />

                          {/* Usuń */}
                          <button
                            type="button"
                            onClick={() => removePzRow(row._key)}
                            className="flex items-center justify-center w-6 h-6 rounded text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer formularza */}
              {(() => {
                const iloscTotal = pzRows.reduce((sum, r) => sum + (parseFloat(r.ilosc) || 0), 0);
                return (
              <div className="flex justify-between items-center gap-3 p-4 border-t border-[#334155] bg-[#0f172a]/50 shrink-0">
                <div className="flex items-center gap-4 text-xs font-mono">
                  {pzRows.length > 0 && (
                    <>
                      <span style={{ color: 'var(--text-muted)' }}>
                        <span className="font-bold text-white">{pzRows.length}</span> poz.
                      </span>
                      {iloscTotal > 0 && (
                        <span style={{ color: 'var(--text-muted)' }}>
                          łącznie <span className="font-bold text-white">{fmtL(iloscTotal, 3)}</span> jedn.
                        </span>
                      )}
                    </>
                  )}
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => { setShowPz(false);  }} className="px-5 py-2.5 text-slate-400 hover:bg-[#334155] rounded-xl font-semibold transition-colors">
                    Anuluj
                  </button>
                  <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors min-h-[44px]">
                    <Save className="w-5 h-5" /> Zarejestruj PZ
                  </button>
                </div>
              </div>
                );
              })()}
            </form>
          </div>
        </div>
      )}

      {/* ═══ MODAL WZ ══════════════════════════════════════════════════════════ */}
      {showWz && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm pl-16 lg:pl-60 pr-4">
          <div className="bg-[#1e293b] shadow-2xl border border-[#334155] flex flex-col overflow-hidden" style={{ height: '80vh', marginTop: '10vh' }}>

            <div className="flex justify-between items-center p-5 border-b border-[#334155] bg-orange-900/20 shrink-0">
              <h3 className="text-lg font-bold text-orange-400 flex items-center gap-2">
                <ArrowRightCircle className="w-5 h-5" /> Nowy dokument WZ — Wydanie zewnętrzne
              </h3>
              <button onClick={() => { setShowWz(false);  }} className="text-slate-500 hover:text-white p-2 rounded-lg hover:bg-[#334155]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateWz} className="flex flex-col flex-1 overflow-hidden">
              <div className="overflow-y-auto flex-1 p-5 space-y-5">
                <div className="bg-[#0f172a] p-4 rounded-xl border border-[#334155] grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-400 text-xs font-bold uppercase mb-2">
                      Kontrahent (odbiorca) <span className="text-red-400">*</span>
                    </label>
                    <select
                      required
                      value={wzKontrahentId}
                      onChange={e => setWzKontrahentId(e.target.value)}
                      className="w-full bg-[#334155] border border-[#475569] text-white rounded-xl px-4 py-3 outline-none focus:border-orange-500 text-sm"
                    >
                      <option value="">-- wybierz kontrahenta --</option>
                      {kontrahenci.map(k => (
                        <option key={k.id} value={k.id}>{k.kod} — {k.nazwa}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 text-xs font-bold uppercase mb-2">Numer zewnętrzny — opcjonalnie</label>
                    <input
                      type="text" value={wzReferencja} onChange={e => setWzReferencja(e.target.value)}
                      placeholder="np. ZAM-2026/03/001"
                      className="w-full bg-[#334155] border border-[#475569] text-white rounded-xl px-4 py-3 outline-none focus:border-orange-500 font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-white font-bold text-sm uppercase">
                      Pozycje do wydania
                      {wzRows.length > 0 && <span className="ml-2 px-2 py-0.5 bg-orange-600/20 text-orange-400 rounded-full text-xs">{wzRows.length}</span>}
                    </h4>
                    <button
                      type="button"
                      onClick={openWzSelektor}
                      className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors min-h-[44px]"
                    >
                      <Plus className="w-4 h-4" /> Dodaj pozycję
                    </button>
                  </div>

                  {wzRows.length === 0 ? (
                    <div
                      onClick={openWzSelektor}
                      className="border-2 border-dashed border-[#334155] hover:border-orange-500/50 rounded-2xl p-10 text-center cursor-pointer transition-colors group"
                    >
                      <ArrowRightCircle className="w-10 h-10 text-slate-600 group-hover:text-orange-500/50 mx-auto mb-3 transition-colors" />
                      <p className="text-slate-500 group-hover:text-slate-400 font-semibold">Kliknij aby wybrać towary do wydania</p>
                      <p className="text-slate-600 text-sm mt-1">Tylko towary z dostępnym stanem na magazynie</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {wzRows.map(row => {
                        const selectedPartia = row.dostepnePartie.find(p => p.id === row.id_partii);
                        const groupedOpakowania = (selectedPartia?.opakowania || []).reduce((acc: any, op) => {
                          const k = `${op.id_asortymentu}_${op.waga_kg}`;
                          if (!acc[k]) acc[k] = { ...op, count: 0 };
                          acc[k].count++;
                          return acc;
                        }, {});
                        const typy_opakowan: any[] = Object.values(groupedOpakowania).sort((a: any, b: any) => a.nazwa.localeCompare(b.nazwa) || b.waga_kg - a.waga_kg);
                        return (
                          <div key={row._key} className="bg-[#0f172a] border border-[#334155] rounded-xl p-4">
                            <div className="flex items-start gap-3">
                              <div className="w-7 h-7 bg-orange-600/20 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                                <ArrowRightCircle className="w-4 h-4 text-orange-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-white font-semibold text-sm mb-3">{row.nazwa}</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {/* Wybór partii */}
                                  <div>
                                    <label className="block text-slate-400 text-[10px] font-bold uppercase mb-1">
                                      Partia do wydania <span className="text-red-400">*</span>
                                    </label>
                                    {row.loadingPartie ? (
                                      <div className="flex items-center gap-2 text-slate-500 py-2">
                                        <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                                        <span className="text-xs">Ładowanie partii...</span>
                                      </div>
                                    ) : row.dostepnePartie.length === 0 ? (
                                      <div className="text-red-400 text-xs py-2">Brak dostępnych partii na magazynie</div>
                                    ) : (
                                      <select
                                        required
                                        value={row.id_partii}
                                        onChange={e => updateWzRow(row._key, "id_partii", e.target.value)}
                                        className="w-full bg-[#1e293b] border border-[#475569] text-white rounded-xl px-4 py-2.5 outline-none focus:border-orange-500 text-sm font-mono"
                                      >
                                        <option value="">-- wybierz partię --</option>
                                        {row.dostepnePartie.map(p => (
                                          <option key={p.id} value={p.id}>
                                            {p.numer_partii} · dostępne: {fmtL(p.stan, 2)} {row.jednostka_miary}
                                            {p.termin_waznosci ? ` · ww: ${fmt(p.termin_waznosci)}` : ""}
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                  </div>
                                  {/* Opakowania */}
                                  <div>
                                    {selectedPartia?.opakowania?.length ? (
                                      <>
                                        <label className="block text-slate-400 text-[10px] font-bold uppercase mb-1">Opakowania</label>
                                        <div className="space-y-1.5">
                                          {typy_opakowan.map((op, i) => {
                                            const dostepneSzt = op.count;
                                            const opKey = `${op.id_asortymentu}_${op.waga_kg}`;
                                            return (
                                              <div key={i} className="flex items-center gap-3 bg-[#1e293b] rounded-lg px-3 py-1.5">
                                                <div className="flex-1 min-w-0">
                                                  <span className="text-sm text-white font-medium">{op.nazwa}</span>
                                                  <span className="font-mono text-xs ml-2" style={{ color: 'var(--text-muted)' }}>{op.waga_kg} kg/szt.</span>
                                                  <div className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>dost. {dostepneSzt} szt.</div>
                                                </div>
                                                <input
                                                  type="number" min="0" max={dostepneSzt} step="1"
                                                  value={row.sztuki[opKey] ?? ""}
                                                  placeholder="0"
                                                  className="w-16 bg-[#0f172a] border border-[#475569] text-white rounded-lg px-2 py-1.5 font-mono font-bold text-sm outline-none focus:border-orange-500 text-right shrink-0"
                                                  onChange={e => updateWzSztuki(row._key, opKey, parseFloat(e.target.value) || 0, selectedPartia!.opakowania!)}
                                                />
                                                <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>szt.</span>
                                              </div>
                                            );
                                          })}
                                          <div className="text-xs pt-1 flex justify-between px-1" style={{ color: 'var(--text-muted)' }}>
                                            <span>Łącznie: <span className="text-white font-mono font-bold">{fmtL(parseFloat(row.ilosc) || 0, 3)} {row.jednostka_miary}</span></span>
                                            <span>stan: <span className="text-emerald-400 font-mono font-bold">{fmtL(selectedPartia.stan, 3)}</span></span>
                                          </div>
                                        </div>
                                      </>
                                    ) : selectedPartia ? (
                                      <div className="text-slate-500 text-xs pt-5">Brak zdefiniowanych opakowań</div>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeWzRow(row._key)}
                                className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 p-5 border-t border-[#334155] bg-[#0f172a]/50 shrink-0">
                <button type="button" onClick={() => { setShowWz(false);  }} className="px-5 py-2.5 text-slate-400 hover:bg-[#334155] rounded-xl font-semibold transition-colors">
                  Anuluj
                </button>
                <button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 min-h-[44px]">
                  <Save className="w-5 h-5" /> Zarejestruj WZ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ SELEKTOR ASORTYMENTU ══════════════════════════════════════════════ */}
      {showSelektor && (
        <AsortymentSelektor
          tryb={selektorTryb}
          typy={selektorTryb === "wz" ? ["Wyrob_Gotowy"] : undefined}
          hideIlosc={selektorTryb === "wz"}
          onClose={() => setShowSelektor(false)}
          onConfirm={selektorTryb === "pz" ? onSelektorPzConfirm : onSelektorWzConfirm}
        />
      )}

      {/* ═══ PODGLĄD DOKUMENTU ════════════════════════════════════════════════ */}
      {previewDocRef && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm pl-16 lg:pl-60 pr-4" onClick={() => setPreviewDocRef(null)}>
          <div
            className="flex flex-col shadow-2xl border border-[#334155]"
            style={{ background: 'var(--bg-panel)', height: '80vh', marginTop: '10vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Nagłówek */}
            <div className="flex justify-between items-center px-5 py-3 border-b border-[#334155] shrink-0" style={{ background: 'var(--bg-surface)' }}>
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <span className="font-bold text-white">{previewDocRef}</span>
                {previewDocData && (
                  <span className={`badge ${
                    previewDocData.typ === 'PZ' ? 'badge-ok' :
                    previewDocData.typ === 'PW' ? 'badge-info' :
                    previewDocData.typ === 'RW' ? 'badge-danger' : 'badge-warn'
                  }`}>{previewDocData.typ}</span>
                )}
                {previewDocData?.status && <StatusBadge status={previewDocData.status} />}
              </div>
              <div className="flex items-center gap-2">
                {previewDocData && (previewDocData.typ === "PZ" || previewDocData.typ === "WZ") && previewDocData.status === "Bufor" && (
                  <button onClick={() => handleZatwierdz(previewDocRef!)}
                    disabled={actionLoading === previewDocRef}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-bold btn-hover-effect"
                    style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.4)' }}>
                    <CheckCircle className="w-3.5 h-3.5" /> Zatwierdź
                  </button>
                )}
                {previewDocData && (previewDocData.typ === "PZ" || previewDocData.typ === "WZ") && previewDocData.status === "Bufor" && (
                  <button onClick={() => handleUsun(previewDocRef!)}
                    disabled={actionLoading === previewDocRef}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-bold btn-hover-effect"
                    style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                    <Trash2 className="w-3.5 h-3.5" /> Usuń
                  </button>
                )}
                {previewDocData && (previewDocData.typ === "PZ" || previewDocData.typ === "WZ") && previewDocData.status === "Zatwierdzony" && (
                  <button onClick={() => handleAnuluj(previewDocRef!)}
                    disabled={actionLoading === previewDocRef}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-bold btn-hover-effect"
                    style={{ background: 'rgba(249,115,22,0.12)', color: '#f97316', border: '1px solid rgba(249,115,22,0.3)' }}>
                    <Ban className="w-3.5 h-3.5" /> Anuluj
                  </button>
                )}
                {previewDocData && previewDocData.typ !== 'WZ' && previewDocData.typ !== 'RW' && (
                  <button onClick={() => handlePrintAllLabels(previewDocRef!)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium btn-hover-effect"
                    style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)' }}>
                    <Tag className="w-3.5 h-3.5" /> Etykiety
                  </button>
                )}
                <button onClick={() => setPreviewDocRef(null)} className="p-1.5 rounded hover:bg-[#334155]" style={{ color: 'var(--text-muted)' }}>
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Meta */}
            {previewDocData && (
              <div className="flex flex-wrap items-center gap-4 px-5 py-2.5 border-b border-[#334155] text-xs shrink-0" style={{ background: 'var(--bg-app)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Wystawiono: <span className="text-white font-medium">{fmtFull(previewDocData.data)}</span></span>
                <span style={{ color: 'var(--text-muted)' }}>Operator: <span className="text-white font-medium">{previewDocData.uzytkownik}</span></span>
                {previewDocData.data_zatwierdzenia && (
                  <span style={{ color: 'var(--text-muted)' }}>Zatwierdził: <span className="font-medium" style={{ color: '#22c55e' }}>{previewDocData.uzytkownik_zatwierdzenia}</span> · {fmtFull(previewDocData.data_zatwierdzenia)}</span>
                )}
                {previewDocData.data_anulowania && (
                  <span style={{ color: 'var(--text-muted)' }}>Anulował: <span className="font-medium" style={{ color: '#ef4444' }}>{previewDocData.uzytkownik_anulowania}</span> · {fmtFull(previewDocData.data_anulowania)}</span>
                )}
                {previewDocData.numer_zlecenia && (
                  <span style={{ color: 'var(--text-muted)' }}>ZP: <span className="font-mono font-medium" style={{ color: 'var(--text-code)' }}>{previewDocData.numer_zlecenia}</span></span>
                )}
                {previewDocData.kontrahent && (
                  <span style={{ color: 'var(--text-muted)' }}>Kontrahent: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{previewDocData.kontrahent.kod} — {previewDocData.kontrahent.nazwa}</span></span>
                )}
              </div>
            )}

            {/* Treść */}
            <div className="overflow-y-auto flex-1">
              {previewDocLoading ? (
                <div className="flex justify-center p-12"><Spinner /></div>
              ) : !previewDocData ? (
                <div className="text-center p-12 text-sm" style={{ color: 'var(--text-muted)' }}>Brak danych o dokumencie</div>
              ) : (
                <div className="flex flex-col pb-4">
                  <table className="mes-table">
                  <thead>
                    <tr>
                      <th className="text-center w-8">Lp.</th>
                      <th>Towar</th>
                      <th>Partia</th>
                      <th className="text-right">Ilość</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewDocData.pozycje?.map((poz: any, i: number) => (
                      <tr key={i}>
                        <td className="text-center mono text-xs" style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                        <td>
                          <div className="font-medium text-white">{poz.asortyment}</div>
                          {poz.wyrob && <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{poz.wyrob}</div>}
                          {!poz.wyrob && <div className="text-xs mono" style={{ color: 'var(--text-muted)' }}>{poz.kod_towaru}</div>}
                        </td>
                        <td className="mono" style={{ color: 'var(--text-code)' }}>{poz.numer_partii}</td>
                        <td className="text-right">
                          <div className="font-mono font-bold text-white">{fmtL(poz.ilosc, poz.jednostka === 'szt.' ? 0 : 3)} <span className="text-xs opacity-50">{poz.jednostka}</span></div>
                          {poz.ilosc_kg != null && <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{fmtL(poz.ilosc_kg, 3)} kg</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {/* DODANE: Podsumowanie wagi dla PW i WZ */}
                {previewDocData && (previewDocData.typ === "PW" || previewDocData.typ === "WZ") && (() => {
                  const podsumowanie: Record<string, number> = {};
                  let pokazPodsumowanie = false;
                  (previewDocData.pozycje || []).forEach((p: any) => {
                    const nazwa = p.wyrob || p.asortyment;
                    const isSzt = p.jednostka === 'szt.';
                    const waga = p.ilosc_kg != null ? parseFloat(p.ilosc_kg) : (isSzt ? 0 : parseFloat(p.ilosc));
                    if (waga > 0) {
                      podsumowanie[nazwa] = (podsumowanie[nazwa] || 0) + waga;
                      pokazPodsumowanie = true;
                    }
                  });

                  if (!pokazPodsumowanie) return null;
                  const entries = Object.entries(podsumowanie).sort((a,b) => b[1] - a[1]);
                  const sumaCalkowita = entries.reduce((acc, curr) => acc + curr[1], 0);

                  return (
                    <div className="mt-6 mx-4 mb-2 border rounded shadow-sm overflow-hidden shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--bg-app)' }}>
                      <div className="px-4 py-2.5 text-xs font-bold uppercase tracking-widest border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>
                        Podsumowanie wagi dokumentu
                      </div>
                      <div className="p-2 space-y-0.5">
                        {entries.map(([nazwa, waga]) => (
                          <div key={nazwa} className="flex justify-between items-center px-3 py-2 hover:bg-[#1e293b] rounded transition-colors">
                            <span className="text-sm font-medium text-white">{nazwa}</span>
                            <span className="text-sm font-mono font-bold" style={{ color: '#38bdf8' }}>{fmtL(waga, 3)} kg</span>
                          </div>
                        ))}
                        <div className="flex justify-between items-center px-3 py-3 mt-2 border-t" style={{ borderColor: 'var(--border-dim)' }}>
                          <span className="text-xs font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Masa całkowita dokumentu</span>
                          <span className="text-base font-mono font-black" style={{ color: '#22c55e' }}>{fmtL(sumaCalkowita, 3)} kg</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ PASEK FILTRÓW (jedna linia) ═══════════════════════════════════════ */}
      <div className="flex items-center gap-2 shrink-0" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }}>
        {/* Typ */}
        <div className="flex" style={{ background: 'var(--bg-app)', borderRadius: 6, padding: 2 }}>
          {["PZ","PW","RW","WZ"].map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className="px-3 py-1 text-[11px] font-black uppercase tracking-widest transition-all"
              style={{ borderRadius: 4, background: filter === t ? 'var(--accent)' : 'transparent', color: filter === t ? '#fff' : 'var(--text-muted)' }}>
              {t}
            </button>
          ))}
        </div>
        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
        {/* Rok */}
        <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
          className="text-xs font-medium outline-none cursor-pointer"
          style={{ background: 'var(--bg-app)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 6, padding: '4px 8px' }}>
          <option value="">Wszystkie lata</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {/* Miesiąc */}
        <select value={selectedMonth} disabled={!selectedYear} onChange={e => setSelectedMonth(e.target.value)}
          className="text-xs font-medium outline-none cursor-pointer disabled:opacity-30"
          style={{ background: 'var(--bg-app)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 6, padding: '4px 8px' }}>
          <option value="">Wszystkie miesiące</option>
          {months.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
        </select>
        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
        {/* Szukaj */}
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: 'var(--text-muted)' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Nr faktury, partia, towar…"
            className="w-full text-xs outline-none"
            style={{ background: 'transparent', color: 'var(--text-primary)', paddingLeft: 22, paddingRight: 8, paddingTop: 4, paddingBottom: 4 }} />
        </div>
        {search && (
          <button onClick={() => setSearch("")} style={{ color: 'var(--text-muted)' }}><X className="w-3.5 h-3.5" /></button>
        )}
        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
        <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{filteredDocs.length} dok.</span>
      </div>

      {/* ═══ TABELA DOKUMENTÓW ══════════════════════════════════════════════════ */}
      <div className="mes-panel rounded overflow-hidden flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <Spinner.Page />
        ) : filteredDocs.length === 0 ? (
          <EmptyState message="Brak dokumentów." />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                {["Typ","Status","Nr dokumentu","Data · Operator","Kontrahent","ZP","Akcje"].map((h, i) => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: i >= 5 ? 'right' : 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredDocs.map(doc => {
                const typColor: Record<string,string> = { PZ:'#22c55e', PW:'#38bdf8', RW:'#ef4444', WZ:'#f97316' };
                const typBg: Record<string,string>    = { PZ:'rgba(34,197,94,.12)', PW:'rgba(56,189,248,.12)', RW:'rgba(239,68,68,.12)', WZ:'rgba(249,115,22,.12)' };
                const color = typColor[doc.typ] || 'var(--text-muted)';
                const bg    = typBg[doc.typ]    || 'transparent';
                const isLoading = actionLoading === doc.referencja;
                const canApprove = (doc.typ === "PZ" || doc.typ === "WZ") && doc.status === "Bufor";
                const canDelete  = (doc.typ === "PZ" || doc.typ === "WZ") && doc.status === "Bufor";
                const canCancel  = (doc.typ === "PZ" || doc.typ === "WZ") && doc.status === "Zatwierdzony";
                return (
                  <tr key={doc.referencja} onClick={() => openDocPreview(doc.referencja)}
                    style={{ borderBottom: '1px solid var(--border-dim)', cursor: 'pointer', transition: 'background .1s', opacity: doc.status === 'Anulowany' ? 0.55 : 1 }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                    {/* Typ */}
                    <td style={{ padding: '5px 10px', whiteSpace: 'nowrap' }}>
                      <span style={{ display:'inline-block', padding:'1px 7px', borderRadius:3, fontSize:10, fontWeight:800, letterSpacing:'0.06em', background: bg, color, border:`1px solid ${color}40` }}>
                        {doc.typ}
                      </span>
                    </td>

                    {/* Status */}
                    <td style={{ padding: '5px 10px', whiteSpace: 'nowrap' }}>
                      <StatusBadge status={doc.status || 'Zatwierdzony'} />
                    </td>

                    {/* Nr dokumentu */}
                    <td style={{ padding: '5px 10px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:12, fontWeight:700, color:'var(--text-primary)', borderLeft:`2px solid ${color}`, paddingLeft:6 }}>
                        {doc.referencja}
                      </span>
                    </td>

                    {/* Data · Operator */}
                    <td style={{ padding: '5px 10px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:11, color:'var(--text-secondary)' }}>
                        {fmtFull(doc.data)}
                      </span>
                      <span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:6 }}>· {doc.uzytkownik}</span>
                    </td>

                    {/* Kontrahent */}
                    <td style={{ padding: '5px 10px', whiteSpace: 'nowrap' }}>
                      {doc.kontrahent
                        ? <span style={{ fontSize: 11 }}><span style={{ fontFamily: 'JetBrains Mono,monospace', color: 'var(--accent)', fontWeight: 700 }}>{doc.kontrahent.kod}</span> <span style={{ color: 'var(--text-secondary)' }}>{doc.kontrahent.nazwa}</span></span>
                        : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>}
                    </td>

                    {/* ZP */}
                    <td style={{ padding: '5px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {doc.numer_zlecenia
                        ? <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:11, color:'var(--text-code)' }}>{doc.numer_zlecenia}</span>
                        : <span style={{ color:'var(--text-muted)', fontSize:11 }}>—</span>}
                    </td>

                    {/* Akcje */}
                    <td style={{ padding: '5px 10px' }}>
                      <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                        {canApprove && (
                          <button onClick={e => handleZatwierdz(doc.referencja, e)} title="Zatwierdź"
                            disabled={isLoading}
                            className="p-1 rounded btn-hover-effect"
                            style={{ color:'#22c55e', background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.3)' }}>
                            {isLoading ? <div className="w-3.5 h-3.5 border border-green-500 border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={e => handleUsun(doc.referencja, e)} title="Usuń dokument (bufor)"
                            disabled={isLoading}
                            className="p-1 rounded btn-hover-effect"
                            style={{ color:'#ef4444', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)' }}>
                            {isLoading ? <div className="w-3.5 h-3.5 border border-red-500 border-t-transparent rounded-full animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        {canCancel && (
                          <button onClick={e => handleAnuluj(doc.referencja, e)} title="Anuluj dokument"
                            disabled={isLoading}
                            className="p-1 rounded btn-hover-effect"
                            style={{ color:'#f97316', background:'rgba(249,115,22,0.08)', border:'1px solid rgba(249,115,22,0.2)' }}>
                            {isLoading ? <div className="w-3.5 h-3.5 border border-orange-500 border-t-transparent rounded-full animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        {doc.typ === "PZ" && doc.status !== "Anulowany" && (
                          <button onClick={e => { e.stopPropagation(); handleCopyDoc(doc); }} title="Kopiuj do PZ"
                            className="p-1 rounded btn-hover-effect"
                            style={{ color:'var(--warn)', background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)' }}>
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={e => { e.stopPropagation(); openDocPreview(doc.referencja); }} title="Podgląd"
                          className="p-1 rounded btn-hover-effect"
                          style={{ color:'var(--accent)', background:'rgba(59,130,246,0.08)', border:'1px solid rgba(59,130,246,0.2)' }}>
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); handlePrintDoc(doc); }} title="Drukuj"
                          className="p-1 rounded btn-hover-effect"
                          style={{ color:'var(--text-secondary)', background:'var(--bg-hover)', border:'1px solid var(--border)' }}>
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <ConfirmModal
        isOpen={!!confirmAction}
        title={confirmAction?.type === 'anuluj' ? 'Anuluj dokument' : 'Usuń dokument'}
        message={
          confirmAction?.type === 'anuluj'
            ? `Czy na pewno chcesz anulować dokument ${confirmAction?.ref}? Cofnie to wszystkie ruchy magazynowe powiązane z tym dokumentem.`
            : `Czy na pewno chcesz usunąć dokument ${confirmAction?.ref}? Tej operacji nie można cofnąć.`
        }
        confirmText={confirmAction?.type === 'anuluj' ? 'Anuluj dokument' : 'Usuń'}
        cancelText="Wróć"
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.type === 'anuluj') doAnuluj(confirmAction.ref);
          else doUsun(confirmAction.ref);
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
