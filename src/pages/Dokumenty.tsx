import React, { useState, useEffect, useCallback } from "react";
import {
  FileText, Printer, Search, Tag, X, Plus, PackageOpen,
  ArrowRightCircle, AlertCircle, Save, Eye, Trash2, ChevronDown, ChevronUp, Copy,
  CheckCircle, Ban, Clock, MinusCircle, Pencil
} from "lucide-react";
import AsortymentSelektor, { WybranyTowar } from "../components/AsortymentSelektor";
import DocumentPreviewModal from "../components/DocumentPreviewModal";
import { SortableTh } from "../components/SortableTh";
import { sortBy, makeSortHandler, type SortDir } from "../utils/sortBy";
import { fmtL, fmtDate, fmtFull } from "../utils/fmt";
import { printDocument } from "../utils/printDoc";
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
  numer_zewnetrzny: string | null;
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
  typ_asortymentu: string;
  id_partii: string;
  ilosc: string;
  cena_netto: string;
  stawka_vat: string;
  sztuki: Record<string, number>; // nazwa_opakowania -> szt
  dostepnePartie: PartiaDostepna[];
  loadingPartie: boolean;
};

type RwRow = {
  _key: string;
  id_asortymentu: string;
  nazwa: string;
  jednostka_miary: string;
  id_partii: string;
  ilosc: string;
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
  const [selectedMonth, setSelectedMonth] = useState<string>("");
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
  const [pzSaving, setPzSaving] = useState(false);
  const [showWz, setShowWz] = useState(false);
  const [wzSaving, setWzSaving] = useState(false);
  const [showRw, setShowRw] = useState(false);
  const [rwSaving, setRwSaving] = useState(false);
  const [showSelektor, setShowSelektor] = useState(false);
  const [selektorTryb, setSelektorTryb] = useState<"pz" | "wz" | "rw">("pz");

  // Formularz PZ
  const [pzRows, setPzRows] = useState<PzRow[]>([]);
  const [pzReferencja, setPzReferencja] = useState("");
  const [nextPzNumber, setNextPzNumber] = useState("");

  // Formularz WZ
  const [wzRows, setWzRows] = useState<WzRow[]>([]);
  const [wzReferencja, setWzReferencja] = useState("");
  const [wzKontrahentId, setWzKontrahentId] = useState("");
  const [wzDataDostawy, setWzDataDostawy] = useState(new Date().toISOString().slice(0, 10));
  const [kontrahenci, setKontrahenci] = useState<Kontrahent[]>([]);

  // Formularz RW
  const [rwRows, setRwRows] = useState<RwRow[]>([]);

  const [sortKey, setSortKey] = useState("data");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const handleSort = makeSortHandler(sortKey, setSortKey, setSortDir);

  // Podgląd dokumentu
  const [previewDocRef, setPreviewDocRef] = useState<string | null>(null);
  const [previewDocData, setPreviewDocData] = useState<any>(null);
  const [previewDocLoading, setPreviewDocLoading] = useState(false);

  // Akcje na dokumentach
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: 'anuluj' | 'usun'; ref: string } | null>(null);

  // Tryb edycji
  const [editDocRef, setEditDocRef] = useState<string | null>(null);

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
      if (!res.ok) throw new Error((await res.json()).error || "Błąd serwera");
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
      if (!res.ok) throw new Error((await res.json()).error || "Błąd serwera");
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
      if (!res.ok) throw new Error((await res.json()).error || "Błąd serwera");
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
      if (showPz) { setShowPz(false); setEditDocRef(null); return; }
      if (showWz) { setShowWz(false); setEditDocRef(null); return; }
      if (showRw) { setShowRw(false); setEditDocRef(null); return; }
      if (showEtykiety) { setShowEtykiety(false); return; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [previewDocRef, showSelektor, showPz, showWz, showRw, showEtykiety]);

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

  const fmt = fmtDate;

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
        cena_jednostkowa: w.cena_zakupu != null ? String(w.cena_zakupu) : "",
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

  const handleCreatePz = async (autoZatwierdz: boolean) => {
    if (pzRows.length === 0) { showToast("Dodaj co najmniej jedną pozycję do dokumentu.", "error"); return; }
    const missing = pzRows.find(r => !r.numer_partii.trim() || !r.ilosc);
    if (missing) { showToast(`Pozycja "${missing.nazwa}" wymaga numeru partii i ilości.`, "error"); return; }
    setPzSaving(true);
    try {
      const pozycje = pzRows.map(r => ({
        id_asortymentu: r.id_asortymentu,
        numer_partii: r.numer_partii.trim(),
        ilosc: parseFloat(r.ilosc),
        cena_jednostkowa: r.cena_jednostkowa ? parseFloat(r.cena_jednostkowa) : null,
        data_produkcji: r.data_produkcji || null,
        termin_waznosci: r.termin_waznosci || null,
      }));

      if (editDocRef) {
        const res = await fetch(`/api/dokumenty/${encodeURIComponent(editDocRef)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pozycje, referencja_zewnetrzna: pzReferencja || undefined }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Błąd serwera");
        if (autoZatwierdz) {
          const res2 = await fetch(`/api/dokumenty/${encodeURIComponent(editDocRef)}/zatwierdz`, { method: "POST" });
          if (!res2.ok) throw new Error((await res2.json()).error || "Błąd zatwierdzenia");
          showToast(`Dokument ${editDocRef} zaktualizowany i zatwierdzony.`, "ok");
        } else {
          showToast(`Dokument ${editDocRef} zaktualizowany.`, "ok");
        }
        setShowPz(false);
        setEditDocRef(null);
        fetchDokumenty();
        return;
      }

      const res = await fetch("/api/magazyn/pz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pozycje, referencja_zewnetrzna: pzReferencja || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Błąd serwera");
      const data = await res.json();
      if (autoZatwierdz) {
        const res2 = await fetch(`/api/dokumenty/${encodeURIComponent(data.referencja)}/zatwierdz`, { method: "POST" });
        if (!res2.ok) throw new Error((await res2.json()).error || "Błąd zatwierdzenia");
        showToast("Dokument PZ zatwierdzony. Stany magazynowe zaktualizowane.", "ok");
      } else {
        showToast("Dokument PZ zapisany w buforze. Zatwierdź go aby zaktualizować stany magazynowe.", "ok");
      }
      setShowPz(false);
      fetchDokumenty();
    } catch (err: any) { showToast(err.message, "error"); }
    finally { setPzSaving(false); }
  };

  // ─── Otwieranie WZ ─────────────────────────────────────────────────────────

  const openWzModal = async () => {
    setWzRows([]);
    setWzReferencja("");
    setWzKontrahentId("");
    setWzDataDostawy(new Date().toISOString().slice(0, 10));
    
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
      typ_asortymentu: "",
      id_partii: "",
      ilosc: w.ilosc || "",
      cena_netto: "",
      stawka_vat: "",
      sztuki: {},
      dostepnePartie: [],
      loadingPartie: true,
    }));
    setWzRows(prev => [...prev, ...newRows]);

    // Pobierz dostępne partie + dane cenowe dla każdego asortymentu
    for (const row of newRows) {
      try {
        const res = await fetch(`/api/asortyment/${row.id_asortymentu}`);
        if (res.ok) {
          const detail = await res.json();
          const og = detail.ogolne || {};
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
            r._key === row._key ? {
              ...r,
              typ_asortymentu: og.typ_asortymentu || "",
              cena_netto: og.cena_sprzedazy != null ? parseFloat(og.cena_sprzedazy).toFixed(2) : "",
              stawka_vat: og.stawka_vat != null ? String(og.stawka_vat) : "",
              dostepnePartie: partie,
              loadingPartie: false,
            } : r
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

  const handleCreateWz = async (autoZatwierdz: boolean) => {
    if (wzRows.length === 0) { showToast("Dodaj co najmniej jedną pozycję.", "error"); return; }
    if (!wzKontrahentId) { showToast("Wybierz kontrahenta (odbiorcę).", "error"); return; }
    const missing = wzRows.find(r => !r.id_partii || !r.ilosc);
    if (missing) { showToast(`Pozycja „${missing.nazwa}" wymaga wybrania partii i podania ilości.`, "error"); return; }
    const missingCena = wzRows.find(r => !r.cena_netto || parseFloat(r.cena_netto) <= 0);
    if (missingCena) { showToast(`Pozycja „${missingCena.nazwa}" wymaga podania ceny netto.`, "error"); return; }
    const missingVat = wzRows.find(r => r.stawka_vat === "");
    if (missingVat) { showToast(`Pozycja „${missingVat.nazwa}" wymaga podania stawki VAT (wpisz 0 jeśli zwolniona).`, "error"); return; }
    setWzSaving(true);
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
        const netto = parseFloat(r.cena_netto) || null;
        const vat = r.stawka_vat !== "" ? parseFloat(r.stawka_vat) : null;
        const brutto = netto != null && vat != null ? netto * (1 + vat / 100) : netto;
        return {
          id_partii: r.id_partii,
          ilosc: parseFloat(r.ilosc),
          sztuki: sztukiLabels,
          cena_netto: netto,
          stawka_vat: vat,
          cena_brutto: brutto != null ? Math.round(brutto * 10000) / 10000 : null,
        };
      });

      if (editDocRef) {
        const res = await fetch(`/api/dokumenty/${encodeURIComponent(editDocRef)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pozycje: items, referencja_zewnetrzna: wzReferencja || undefined, id_kontrahenta: wzKontrahentId, data_dostawy: wzDataDostawy || undefined }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Błąd serwera");
        if (autoZatwierdz) {
          const res2 = await fetch(`/api/dokumenty/${encodeURIComponent(editDocRef)}/zatwierdz`, { method: "POST" });
          if (!res2.ok) throw new Error((await res2.json()).error || "Błąd zatwierdzenia");
          showToast(`Dokument ${editDocRef} zaktualizowany i zatwierdzony.`, "ok");
        } else {
          showToast(`Dokument ${editDocRef} zaktualizowany.`, "ok");
        }
        setShowWz(false);
        setEditDocRef(null);
        fetchDokumenty();
        return;
      }

      const res = await fetch("/api/magazyn/wz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, referencja_zewnetrzna: wzReferencja || undefined, id_kontrahenta: wzKontrahentId, data_dostawy: wzDataDostawy || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Błąd serwera");
      const data = await res.json();
      if (autoZatwierdz) {
        const res2 = await fetch(`/api/dokumenty/${encodeURIComponent(data.referencja)}/zatwierdz`, { method: "POST" });
        if (!res2.ok) throw new Error((await res2.json()).error || "Błąd zatwierdzenia");
        showToast("Dokument WZ zatwierdzony. Stany magazynowe zaktualizowane.", "ok");
      } else {
        showToast("Dokument WZ zapisany w buforze. Zatwierdź go aby zaktualizować stany magazynowe.", "ok");
      }
      setShowWz(false);
      fetchDokumenty();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setWzSaving(false);
    }
  };

  // ─── Otwieranie RW ─────────────────────────────────────────────────────────

  const openRwModal = () => {
    setRwRows([]);
    setShowRw(true);
  };

  const openRwSelektor = () => {
    setSelektorTryb("rw");
    setShowSelektor(true);
  };

  const onSelektorRwConfirm = useCallback(async (wybrane: WybranyTowar[]) => {
    setShowSelektor(false);
    const newRows: RwRow[] = wybrane.map(w => ({
      _key: genKey(),
      id_asortymentu: w.id_asortymentu,
      nazwa: w.nazwa,
      jednostka_miary: w.jednostka_miary,
      id_partii: "",
      ilosc: "",
      dostepnePartie: [],
      loadingPartie: true,
    }));
    setRwRows(prev => [...prev, ...newRows]);

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
              opakowania: null,
            }));
          setRwRows(prev => prev.map(r =>
            r._key === row._key ? { ...r, dostepnePartie: partie, loadingPartie: false } : r
          ));
        }
      } catch {
        setRwRows(prev => prev.map(r => r._key === row._key ? { ...r, loadingPartie: false } : r));
      }
    }
  }, []);

  const updateRwRow = (key: string, field: keyof RwRow, value: any) => {
    setRwRows(prev => prev.map(r => r._key === key ? { ...r, [field]: value } : r));
  };

  const removeRwRow = (key: string) => {
    setRwRows(prev => prev.filter(r => r._key !== key));
  };

  const handleCreateRw = async (autoZatwierdz: boolean) => {
    if (rwRows.length === 0) { showToast("Dodaj co najmniej jedną pozycję.", "error"); return; }
    const missing = rwRows.find(r => !r.id_partii || !r.ilosc);
    if (missing) { showToast(`Pozycja "${missing.nazwa}" wymaga wybrania partii i podania ilości.`, "error"); return; }
    setRwSaving(true);
    try {
      const items = rwRows.map(r => ({ id_partii: r.id_partii, ilosc: parseFloat(r.ilosc) }));

      if (editDocRef) {
        const res = await fetch(`/api/dokumenty/${encodeURIComponent(editDocRef)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pozycje: items }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Błąd serwera");
        if (autoZatwierdz) {
          const res2 = await fetch(`/api/dokumenty/${encodeURIComponent(editDocRef)}/zatwierdz`, { method: "POST" });
          if (!res2.ok) throw new Error((await res2.json()).error || "Błąd zatwierdzenia");
          showToast(`Dokument ${editDocRef} zaktualizowany i zatwierdzony.`, "ok");
        } else {
          showToast(`Dokument ${editDocRef} zaktualizowany.`, "ok");
        }
        setShowRw(false);
        setEditDocRef(null);
        fetchDokumenty();
        return;
      }

      const res = await fetch("/api/magazyn/rw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Błąd serwera");
      const data = await res.json();
      if (autoZatwierdz) {
        const res2 = await fetch(`/api/dokumenty/${encodeURIComponent(data.referencja)}/zatwierdz`, { method: "POST" });
        if (!res2.ok) throw new Error((await res2.json()).error || "Błąd zatwierdzenia");
        showToast("Dokument RW zatwierdzony. Stany magazynowe zaktualizowane.", "ok");
      } else {
        showToast("Dokument RW zapisany w buforze. Zatwierdź go aby zaktualizować stany magazynowe.", "ok");
      }
      setShowRw(false);
      fetchDokumenty();
    } catch (err: any) { showToast(err.message, "error"); }
    finally { setRwSaving(false); }
  };

  // ─── Etykiety ──────────────────────────────────────────────────────────────

  const handleFetchEtykieta = async () => {
    if (!etykietaInput.trim()) { setEtykietaError("Podaj numer partii"); return; }
    setEtykietaError("");
    try {
      const res = await fetch(`/api/etykieta/${encodeURIComponent(etykietaInput.trim())}`);
      if (!res.ok) throw new Error((await res.json()).error || "Błąd serwera");
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

  const openEditModal = async (doc: Dokument) => {
    setPreviewDocRef(null);
    setEditDocRef(doc.referencja);

    // Pobierz surowe dane dokumentu do edycji (nie przetworzone jak w podglądzie)
    const res = await fetch(`/api/dokumenty/edit/${encodeURIComponent(doc.referencja)}`);
    if (!res.ok) { showToast("Nie udało się załadować dokumentu", "error"); setEditDocRef(null); return; }
    const data = await res.json();

    if (doc.typ === "PZ") {
      const rows: PzRow[] = (data.pozycje || []).map((p: any) => ({
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
      setPzRows(rows);
      setPzReferencja(data.numer_zewnetrzny || "");
      setNextPzNumber(""); // nie generuj nowego numeru
      setShowPz(true);
    } else if (doc.typ === "WZ") {
      // Załaduj kontrahentów jeśli nie ma
      if (kontrahenci.length === 0) {
        const kr = await fetch("/api/kontrahenci");
        if (kr.ok) setKontrahenci(await kr.json());
      }
      setWzKontrahentId(data.kontrahent?.id || "");
      setWzDataDostawy(data.data_dostawy ? data.data_dostawy.split("T")[0] : new Date().toISOString().slice(0, 10));
      setWzReferencja(data.numer_zewnetrzny || "");

      // Buduj wiersze WZ — dla każdej pozycji załaduj dostępne partie
      // p.sztuki to obiekt { "Nazwa (X kg)": count } z pozycje_json — konwertujemy po załadowaniu partii
      const rows: WzRow[] = (data.pozycje || []).map((p: any) => ({
        _key: genKey(),
        id_asortymentu: p.id_asortymentu || "",
        nazwa: p.asortyment,
        jednostka_miary: p.jednostka,
        typ_asortymentu: p.typ_asortymentu || "",
        id_partii: p.id_partii || "",
        ilosc: String(p.ilosc),
        cena_netto: p.cena_netto != null ? String(p.cena_netto) : "",
        stawka_vat: p.stawka_vat != null ? String(p.stawka_vat) : "",
        sztuki: {},          // wypełniane po załadowaniu partii (konwersja kluczy label→id_op_waga)
        _sztukiRaw: p.sztuki || {},  // tymczasowe: { "Nazwa (X kg)": count }
        dostepnePartie: [],
        loadingPartie: true,
      } as any));
      setWzRows(rows);
      setShowWz(true);

      // Załaduj partie dla każdej pozycji (tryb edycji — uwzględnij też aktualnie przypisaną partię)
      for (const row of rows) {
        if (!row.id_asortymentu) continue;
        try {
          const ar = await fetch(`/api/asortyment/${row.id_asortymentu}`);
          if (ar.ok) {
            const detail = await ar.json();
            // W trybie edycji: pokaż partie z dostepne > 0 PLUS aktualnie przypisaną partię
            // (może mieć dostepne = 0 bo ruchy są nieaktywne w buforze)
            const currentIdPartii = row.id_partii;
            const allZasoby: any[] = detail.zasoby || [];
            const partie: PartiaDostepna[] = allZasoby
              .filter((z: any) => z.dostepne > 0 || z.id_partii === currentIdPartii)
              .map((z: any) => ({
                id: z.id_partii,
                numer_partii: z.numer_partii,
                asortyment: { nazwa: row.nazwa, jednostka_miary: row.jednostka_miary },
                stan: z.dostepne,
                termin_waznosci: z.termin_waznosci,
                opakowania: z.opakowania || null,
              }));

            // Konwertuj _sztukiRaw { "Nazwa (X kg)": count } → { "id_asortymentu_waga_kg": count }
            // używając danych opakowania z wybranej partii
            const selectedPartia = partie.find(p => p.id === currentIdPartii);
            const sztukiRaw: Record<string, number> = (row as any)._sztukiRaw || {};
            let sztuki: Record<string, number> = {};
            if (selectedPartia?.opakowania && Object.keys(sztukiRaw).length > 0) {
              // Zbuduj mapę "Nazwa (X kg)" → "id_asortymentu_waga_kg"
              const labelToKey: Record<string, string> = {};
              for (const op of selectedPartia.opakowania) {
                const label = `${op.nazwa} (${op.waga_kg} kg)`;
                const key = `${op.id_asortymentu}_${op.waga_kg}`;
                if (!labelToKey[label]) labelToKey[label] = key;
              }
              for (const [label, count] of Object.entries(sztukiRaw)) {
                const key = labelToKey[label];
                if (key) sztuki[key] = (sztuki[key] || 0) + count;
              }
            }

            setWzRows(prev => prev.map(r => r._key === row._key ? { ...r, dostepnePartie: partie, sztuki, loadingPartie: false } : r));
          }
        } catch {
          setWzRows(prev => prev.map(r => r._key === row._key ? { ...r, loadingPartie: false } : r));
        }
      }
    } else if (doc.typ === "RW") {
      const rows: RwRow[] = (data.pozycje || []).map((p: any) => ({
        _key: genKey(),
        id_asortymentu: p.id_asortymentu || "",
        nazwa: p.asortyment,
        jednostka_miary: p.jednostka,
        id_partii: p.id_partii || "",
        ilosc: String(p.ilosc),
        dostepnePartie: [],
        loadingPartie: true,
      }));
      setRwRows(rows);
      setShowRw(true);

      for (const row of rows) {
        if (!row.id_asortymentu) continue;
        try {
          const ar = await fetch(`/api/asortyment/${row.id_asortymentu}`);
          if (ar.ok) {
            const detail = await ar.json();
            const currentIdPartii = row.id_partii;
            const allZasoby: any[] = detail.zasoby || [];
            const partie: PartiaDostepna[] = allZasoby
              .filter((z: any) => z.dostepne > 0 || z.id_partii === currentIdPartii)
              .map((z: any) => ({
                id: z.id_partii,
                numer_partii: z.numer_partii,
                asortyment: { nazwa: row.nazwa, jednostka_miary: row.jednostka_miary },
                stan: z.dostepne,
                termin_waznosci: z.termin_waznosci,
                opakowania: null,
              }));
            setRwRows(prev => prev.map(r => r._key === row._key ? { ...r, dostepnePartie: partie, loadingPartie: false } : r));
          }
        } catch {
          setRwRows(prev => prev.map(r => r._key === row._key ? { ...r, loadingPartie: false } : r));
        }
      }
    }
  };

  const handlePrintDoc = async (doc: Dokument) => {    try {
      const res = await fetch(`/api/dokumenty/podglad/${encodeURIComponent(doc.referencja)}`);
      if (res.ok) {
        printDocument(await res.json());
        return;
      }
    } catch { /* fallback */ }
    // fallback: dane bez szczegółów opakowania
    printDocument(doc);
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

  const filteredDocs = sortBy<Dokument>(
    dokumenty.filter(d => {
      const docDate = new Date(d.data);
      const matchesMonth = !selectedMonth || (docDate.getMonth() + 1).toString() === selectedMonth;
      const matchesYear = !selectedYear || docDate.getFullYear().toString() === selectedYear;
      const matchesSearch = !search ||
        d.referencja.toLowerCase().includes(search.toLowerCase()) ||
        d.pozycje.some(p => p.asortyment.toLowerCase().includes(search.toLowerCase()) || p.numer_partii.toLowerCase().includes(search.toLowerCase()));
      return matchesMonth && matchesYear && matchesSearch;
    }),
    d => {
      switch (sortKey) {
        case 'typ':        return d.typ;
        case 'status':     return d.status;
        case 'referencja': return d.referencja;
        case 'kontrahent': return d.kontrahent?.nazwa ?? '';
        default:           return d.data;
      }
    },
    sortDir
  );

  const months = [
    { v: "1", l: "Styczeń" }, { v: "2", l: "Luty" }, { v: "3", l: "Marzec" },
    { v: "4", l: "Kwiecień" }, { v: "5", l: "Maj" }, { v: "6", l: "Czerwiec" },
    { v: "7", l: "Lipiec" }, { v: "8", l: "Sierpień" }, { v: "9", l: "Wrzesień" },
    { v: "10", l: "Październik" }, { v: "11", l: "Listopad" }, { v: "12", l: "Grudzień" }
  ];
  const years = Array.from(new Set(dokumenty.map(d => new Date(d.data).getFullYear().toString()))).sort((a, b) => b > a ? 1 : -1);

  const typCfg: Record<string, { color: string; bg: string; border: string; label: string }> = {
    PZ: { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.35)',  label: 'Przyjęcia zewn.' },
    PW: { color: '#38bdf8', bg: 'rgba(56,189,248,0.12)', border: 'rgba(56,189,248,0.35)', label: 'Przyjęcia wew.'  },
    RW: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.35)',  label: 'Rozchody'        },
    WZ: { color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.35)', label: 'Wydania zewn.'   },
  };
  const typCounts = dokumenty.reduce<Record<string, number>>((acc, d) => {
    acc[d.typ] = (acc[d.typ] || 0) + 1;
    return acc;
  }, {});

  // ─── RENDER ──────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col gap-3 animate-view">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-black text-white tracking-tight">Dokumenty</h2>
            <span className="text-[9px] font-bold uppercase tracking-[0.15em] px-2 py-0.5 rounded"
                  style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--border-accent)' }}>
              Magazyn
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            {["PZ","WZ","RW","PW"].map(t => {
              const c = typCfg[t];
              const n = typCounts[t] || 0;
              if (!n) return null;
              return (
                <span key={t} className="flex items-center gap-1 text-[10px] font-semibold"
                      style={{ color: 'var(--text-muted)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: 2, background: c.color, display: 'inline-block', opacity: 0.8 }} />
                  <span style={{ color: c.color, fontWeight: 800 }}>{n}</span> {t}
                </span>
              );
            })}
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={openRwModal}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold text-sm transition-all btn-hover-effect"
            style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
            <MinusCircle className="w-4 h-4" /> Nowy RW
          </button>
          <button onClick={openWzModal}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold text-sm transition-all btn-hover-effect"
            style={{ background: 'rgba(249,115,22,0.15)', color: '#fb923c', border: '1px solid rgba(249,115,22,0.3)' }}>
            <ArrowRightCircle className="w-4 h-4" /> Nowy WZ
          </button>
          <button onClick={openPzModal}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold text-sm transition-all btn-hover-effect"
            style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }}>
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
              className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] text-white rounded-xl px-4 py-3 outline-none focus:border-amber-500 font-mono"
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm pl-16 lg:pl-60 pt-2.5 pb-2.5 pr-2.5">
          <div className="flex h-full border-l border-r border-b rounded-b-xl overflow-hidden shadow-2xl"
               style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)' }}>

            {/* ── PRAWY PANEL META ── */}
            <div className="w-72 shrink-0 flex flex-col border-l"
                 style={{ order: 2, borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>

              {/* Nagłówek */}
              <div className="px-5 pt-5 pb-4 border-b shrink-0"
                   style={{ borderColor: 'var(--border)', background: 'linear-gradient(to bottom, rgba(22,163,74,0.12) 0%, transparent 100%)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                         style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}>
                      <PackageOpen className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: 'rgba(74,222,128,0.6)' }}>{editDocRef ? 'Edycja dokumentu' : 'Nowy dokument'}</div>
                      <div className="text-2xl font-bold leading-none" style={{ color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>{editDocRef || 'PZ'}</div>
                    </div>
                  </div>
                  <button type="button" onClick={() => { setShowPz(false); setEditDocRef(null); }}
                    className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-hover)] mt-0.5 shrink-0"
                    style={{ color: 'var(--text-muted)' }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[11px] font-mono mt-3" style={{ color: 'var(--text-muted)' }}>
                  Przyjęcie Zewnętrzne · {new Date().toLocaleDateString('pl-PL')}
                </p>
              </div>

              {/* Pola */}
              <div className="p-4 space-y-4 flex-1 overflow-y-auto">
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
                    Nr zewnętrzny — opcjonalnie
                  </label>
                  <input type="text" value={pzReferencja} onChange={e => setPzReferencja(e.target.value)}
                    placeholder="np. FV/2026/03/001"
                    className="mes-input text-sm font-mono" />
                  <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>Nr faktury lub WZ dostawcy</p>
                </div>
                {nextPzNumber && (
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>Kolejny nr dokumentu</div>
                    <div className="font-mono text-sm font-bold" style={{ color: '#4ade80' }}>{nextPzNumber}</div>
                  </div>
                )}
              </div>

              {/* Stopka */}
              {(() => {
                const iloscTotal = pzRows.reduce((s, r) => s + (parseFloat(r.ilosc) || 0), 0);
                const wartoscTotal = pzRows.reduce((s, r) => s + (parseFloat(r.ilosc) || 0) * (parseFloat(r.cena_jednostkowa) || 0), 0);
                return (
                  <div className="p-4 border-t space-y-2 shrink-0" style={{ borderColor: 'var(--border)' }}>
                    {pzRows.length > 0 && (
                      <div className="text-xs font-mono mb-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span style={{ color: 'var(--text-muted)' }}>
                            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{pzRows.length}</span> poz.
                          </span>
                          {iloscTotal > 0 && (
                            <span style={{ color: 'var(--text-muted)' }}>
                              <span className="font-bold" style={{ color: '#4ade80' }}>{fmtL(iloscTotal, 3)}</span> jedn.
                            </span>
                          )}
                        </div>
                        {wartoscTotal > 0 && (
                          <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Wartość netto</span>
                            <span className="font-bold" style={{ color: 'var(--accent)' }}>{fmtL(wartoscTotal, 2)} zł</span>
                          </div>
                        )}
                      </div>
                    )}
                    <button type="button" onClick={() => handleCreatePz(true)} disabled={pzSaving}
                      className="btn w-full justify-center font-bold text-sm"
                      style={{ background: '#16a34a', borderColor: '#16a34a', color: 'white' }}>
                      {pzSaving ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      Zatwierdź
                    </button>
                    <button type="button" onClick={() => handleCreatePz(false)} disabled={pzSaving}
                      className="btn btn-ghost w-full justify-center"
                      style={{ border: '1px solid var(--border)' }}>
                      {pzSaving ? <div className="w-4 h-4 border-2 border-current/40 border-t-current rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                      Bufor
                    </button>
                    <button type="button" onClick={() => { setShowPz(false); setEditDocRef(null); }} disabled={pzSaving}
                      className="btn btn-ghost w-full justify-center">
                      Anuluj
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* ── PRAWY PANEL (pozycje) ── */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="px-5 py-3 border-b shrink-0 flex items-center justify-between"
                   style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                  <PackageOpen className="w-3.5 h-3.5 text-emerald-400" />
                  Pozycje dokumentu
                  {pzRows.length > 0 && (
                    <span className="ml-1 px-2 py-0.5 rounded font-mono font-bold text-[10px]"
                          style={{ background: 'rgba(22,163,74,0.08)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' }}>
                      {pzRows.length}
                    </span>
                  )}
                </div>
                <button type="button" onClick={openPzSelektor}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm text-white"
                  style={{ background: '#16a34a' }}>
                  <Plus className="w-4 h-4" /> Dodaj pozycję
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {pzRows.length === 0 ? (
                  <div onClick={openPzSelektor}
                    className="h-full flex flex-col items-center justify-center gap-4 cursor-pointer group"
                    style={{ color: 'var(--text-muted)' }}>
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                         style={{ background: 'rgba(22,163,74,0.06)', border: '2px dashed rgba(34,197,94,0.2)' }}>
                      <PackageOpen className="w-7 h-7 group-hover:text-emerald-400 transition-colors" style={{ color: 'rgba(34,197,94,0.4)' }} />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Brak pozycji do przyjęcia</p>
                      <p className="text-xs mt-1">Kliknij aby wybrać towary z asortymentu</p>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 space-y-2">
                    {pzRows.map(row => (
                      <div key={row._key} className="bg-[var(--bg-app)] border border-[var(--border)] rounded-xl overflow-hidden">
                        {/* Nagłówek karty */}
                        <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
                          <PackageOpen className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="text-sm font-semibold text-white flex-1 truncate">{row.nazwa}</span>
                          <span className="text-[10px] font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>{row.jednostka_miary}</span>
                          <button type="button" onClick={() => removePzRow(row._key)} className="p-1 text-slate-500 hover:text-red-400 rounded transition-colors shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Pola */}
                        <div className="p-3">
                          <div className="grid gap-1.5" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr' }}>

                            {/* Nr partii */}
                            <div>
                              <label className="block text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
                                Nr partii <span className="text-red-400">*</span>
                              </label>
                              <input type="text" value={row.numer_partii}
                                onChange={e => updatePzRow(row._key, "numer_partii", e.target.value)}
                                placeholder="auto"
                                className="w-full rounded px-2 py-1 text-[11px] font-mono outline-none"
                                style={{ background: 'var(--bg-input)', border: `1px solid ${row._autoPartia ? 'rgba(34,197,94,.4)' : 'var(--border)'}`, color: row._autoPartia ? '#86efac' : 'var(--text-primary)' }}
                              />
                            </div>

                            {/* Ilość */}
                            <div>
                              <label className="block text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
                                Ilość <span className="text-red-400">*</span>
                              </label>
                              <div className="flex items-center rounded overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-input)' }}>
                                <input type="number" step="0.001" min="0" value={row.ilosc}
                                  onChange={e => updatePzRow(row._key, "ilosc", e.target.value)}
                                  placeholder="0"
                                  className="flex-1 min-w-0 px-2 py-1 text-[11px] font-mono font-bold bg-transparent outline-none text-right"
                                  style={{ color: '#4ade80' }}
                                />
                                <span className="px-1 text-[9px] font-semibold border-l shrink-0" style={{ color: 'var(--text-muted)', borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>{row.jednostka_miary}</span>
                              </div>
                            </div>

                            {/* Cena jedn. */}
                            <div>
                              <label className="block text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Cena jedn.</label>
                              <div className="flex items-center rounded overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-input)' }}>
                                <input type="number" step="0.01" min="0" value={row.cena_jednostkowa}
                                  onChange={e => updatePzRow(row._key, "cena_jednostkowa", e.target.value)}
                                  placeholder="—"
                                  className="flex-1 min-w-0 px-2 py-1 text-[11px] font-mono bg-transparent outline-none text-right"
                                  style={{ color: 'var(--text-primary)' }}
                                />
                                <span className="px-1 text-[9px] font-semibold border-l shrink-0" style={{ color: 'var(--text-muted)', borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>zł</span>
                              </div>
                            </div>

                            {/* Data produkcji */}
                            <div>
                              <label className="block text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Data prod.</label>
                              <input type="date" value={row.data_produkcji}
                                onChange={e => updatePzRow(row._key, "data_produkcji", e.target.value)}
                                className="w-full rounded px-2 py-1 text-[11px] outline-none"
                                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', colorScheme: 'dark' }}
                              />
                            </div>

                            {/* Termin ważności */}
                            <div>
                              <label className="block text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Termin ważn.</label>
                              <input type="date" value={row.termin_waznosci}
                                onChange={e => updatePzRow(row._key, "termin_waznosci", e.target.value)}
                                className="w-full rounded px-2 py-1 text-[11px] outline-none"
                                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', colorScheme: 'dark' }}
                              />
                            </div>

                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ═══ MODAL WZ ══════════════════════════════════════════════════════════ */}
      {showWz && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm pl-16 lg:pl-60 pt-2.5 pb-2.5 pr-2.5">
          <form onSubmit={e => e.preventDefault()}
            className="flex h-full border-l border-r border-b rounded-b-xl overflow-hidden shadow-2xl"
            style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)' }}>

            {/* ── PRAWY PANEL META ── */}
            <div className="w-72 shrink-0 flex flex-col border-l"
                 style={{ order: 2, borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>

              {/* Nagłówek */}
              <div className="px-5 pt-5 pb-4 border-b shrink-0"
                   style={{ borderColor: 'var(--border)', background: 'linear-gradient(to bottom, rgba(194,65,12,0.12) 0%, transparent 100%)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                         style={{ background: 'rgba(234,88,12,0.15)', border: '1px solid rgba(234,88,12,0.3)' }}>
                      <ArrowRightCircle className="w-5 h-5 text-orange-400" />
                    </div>
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: 'rgba(251,146,60,0.6)' }}>{editDocRef ? 'Edycja dokumentu' : 'Nowy dokument'}</div>
                      <div className="text-2xl font-bold leading-none" style={{ color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>{editDocRef || 'WZ'}</div>
                    </div>
                  </div>
                  <button type="button" onClick={() => { setShowWz(false); setEditDocRef(null); }}
                    className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-hover)] mt-0.5 shrink-0"
                    style={{ color: 'var(--text-muted)' }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[11px] font-mono mt-3" style={{ color: 'var(--text-muted)' }}>
                  Wydanie Zewnętrzne · {new Date().toLocaleDateString('pl-PL')}
                </p>
              </div>

              {/* Pola formularza */}
              <div className="p-4 space-y-4 flex-1 overflow-y-auto">
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
                    Kontrahent (odbiorca) <span className="text-red-400">*</span>
                  </label>
                  <select required value={wzKontrahentId} onChange={e => setWzKontrahentId(e.target.value)}
                    className="mes-input text-sm">
                    <option value="">— wybierz kontrahenta —</option>
                    {kontrahenci.map(k => <option key={k.id} value={k.id}>{k.kod} — {k.nazwa}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
                    Data dostawy
                  </label>
                  <input type="date" value={wzDataDostawy} onChange={e => setWzDataDostawy(e.target.value)}
                    className="mes-input text-sm font-mono" />
                </div>
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
                    Nr zewnętrzny — opcjonalnie
                  </label>
                  <input type="text" value={wzReferencja} onChange={e => setWzReferencja(e.target.value)}
                    placeholder="np. ZAM-2026/03/001"
                    className="mes-input text-sm font-mono" />
                </div>

                {/* Rozliczenie VAT — pojawia się gdy są pozycje z ceną */}
                {(() => {
                  const wyrobyRows = wzRows.filter(r => r.typ_asortymentu === "Wyrob_Gotowy" && parseFloat(r.cena_netto) > 0 && r.stawka_vat !== "");
                  if (wyrobyRows.length === 0) return null;
                  let totalNetto = 0, totalVat = 0, totalBrutto = 0;
                  const vatGroups: Record<string, { netto: number; vat: number; brutto: number }> = {};
                  for (const r of wyrobyRows) {
                    const netto = parseFloat(r.cena_netto) || 0;
                    const vat = parseFloat(r.stawka_vat) || 0;
                    const brutto = netto * (1 + vat / 100);
                    const ilosc = parseFloat(r.ilosc) || 0;
                    const rNetto = netto * ilosc;
                    const rBrutto = brutto * ilosc;
                    const rVat = rBrutto - rNetto;
                    totalNetto += rNetto; totalVat += rVat; totalBrutto += rBrutto;
                    const key = String(vat);
                    if (!vatGroups[key]) vatGroups[key] = { netto: 0, vat: 0, brutto: 0 };
                    vatGroups[key].netto += rNetto;
                    vatGroups[key].vat += rVat;
                    vatGroups[key].brutto += rBrutto;
                  }
                  const groups = Object.entries(vatGroups).sort(([a], [b]) => parseFloat(a) - parseFloat(b));
                  return (
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Rozliczenie VAT</div>
                      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)' }}>
                              {['Stawka', 'Netto', 'VAT', 'Brutto'].map(h => (
                                <th key={h} className="px-3 py-1.5 text-right font-semibold first:text-left" style={{ color: 'var(--text-muted)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {groups.map(([rate, g]) => (
                              <tr key={rate} style={{ borderBottom: '1px solid var(--border-dim)', background: 'var(--bg-app)' }}>
                                <td className="px-3 py-1.5 font-bold font-mono" style={{ color: 'var(--text-secondary)' }}>{rate}%</td>
                                <td className="px-3 py-1.5 text-right font-mono" style={{ color: 'var(--text-primary)' }}>{g.netto.toFixed(2)}</td>
                                <td className="px-3 py-1.5 text-right font-mono font-semibold" style={{ color: 'var(--warn)' }}>{g.vat.toFixed(2)}</td>
                                <td className="px-3 py-1.5 text-right font-mono font-semibold" style={{ color: '#fb923c' }}>{g.brutto.toFixed(2)}</td>
                              </tr>
                            ))}
                            {groups.length > 1 && (
                              <tr style={{ background: 'rgba(249,115,22,0.06)', borderTop: '2px solid rgba(249,115,22,0.3)' }}>
                                <td className="px-3 py-2 font-bold" style={{ color: 'var(--text-primary)' }}>ŁĄCZNIE</td>
                                <td className="px-3 py-2 text-right font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{totalNetto.toFixed(2)}</td>
                                <td className="px-3 py-2 text-right font-mono font-bold" style={{ color: 'var(--warn)' }}>{totalVat.toFixed(2)}</td>
                                <td className="px-3 py-2 text-right font-mono font-bold" style={{ color: '#fb923c' }}>{totalBrutto.toFixed(2)}</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Stopka lewego panelu — przyciski */}
              {(() => {
                const totalBrutto = wzRows.reduce((sum, r) => {
                  const n = parseFloat(r.cena_netto) || 0;
                  const vat = r.stawka_vat !== "" ? parseFloat(r.stawka_vat) || 0 : 0;
                  const b = n * (1 + vat / 100);
                  const il = parseFloat(r.ilosc) || 0;
                  return sum + b * il;
                }, 0);
                return (
                  <div className="p-4 border-t space-y-2 shrink-0" style={{ borderColor: 'var(--border)' }}>
                    {wzRows.length > 0 && (
                      <div className="text-xs font-mono mb-3 flex items-center justify-between">
                        <span style={{ color: 'var(--text-muted)' }}>
                          <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{wzRows.length}</span> poz.
                        </span>
                        {totalBrutto > 0 && (
                          <span className="font-bold" style={{ color: '#fb923c' }}>{totalBrutto.toFixed(2)} zł</span>
                        )}
                      </div>
                    )}
                    <button type="button" onClick={() => handleCreateWz(true)} disabled={wzSaving}
                      className="btn w-full justify-center font-bold text-sm"
                      style={{ background: '#ea580c', borderColor: '#ea580c', color: 'white' }}>
                      {wzSaving ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      Zatwierdź
                    </button>
                    <button type="button" onClick={() => handleCreateWz(false)} disabled={wzSaving}
                      className="btn btn-ghost w-full justify-center"
                      style={{ border: '1px solid var(--border)' }}>
                      {wzSaving ? <div className="w-4 h-4 border-2 border-current/40 border-t-current rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                      Bufor
                    </button>
                    <button type="button" onClick={() => { setShowWz(false); setEditDocRef(null); }} disabled={wzSaving}
                      className="btn btn-ghost w-full justify-center">
                      Anuluj
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* ── PRAWY PANEL (pozycje) ── */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="px-5 py-3 border-b shrink-0 flex items-center justify-between"
                   style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                  <ArrowRightCircle className="w-3.5 h-3.5 text-orange-400" />
                  Pozycje dokumentu
                  {wzRows.length > 0 && (
                    <span className="ml-1 px-2 py-0.5 rounded font-mono font-bold text-[10px]"
                          style={{ background: 'rgba(234,88,12,0.08)', color: '#fb923c', border: '1px solid rgba(249,115,22,0.2)' }}>
                      {wzRows.length}
                    </span>
                  )}
                </div>
                <button type="button" onClick={openWzSelektor}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm text-white"
                  style={{ background: '#ea580c' }}>
                  <Plus className="w-4 h-4" /> Dodaj pozycję
                </button>
              </div>

              {/* Ciało — scrollowalne */}
              <div className="flex-1 overflow-y-auto">
              {wzRows.length === 0 ? (
                <div onClick={openWzSelektor}
                  className="h-full flex flex-col items-center justify-center gap-4 cursor-pointer group"
                  style={{ color: 'var(--text-muted)' }}>
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                       style={{ background: 'rgba(234,88,12,0.06)', border: '2px dashed rgba(234,88,12,0.2)' }}>
                    <ArrowRightCircle className="w-7 h-7 group-hover:text-orange-400 transition-colors" style={{ color: 'rgba(234,88,12,0.4)' }} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Brak pozycji do wydania</p>
                    <p className="text-xs mt-1">Kliknij aby wybrać towary z asortymentu</p>
                  </div>
                </div>
              ) : (
                <div className="p-5 space-y-2">
                      {wzRows.map(row => {
                        const selectedPartia = row.dostepnePartie.find(p => p.id === row.id_partii);
                        const groupedOpakowania = (selectedPartia?.opakowania || []).reduce((acc: any, op) => {
                          const k = `${op.id_asortymentu}_${op.waga_kg}`;
                          if (!acc[k]) acc[k] = { ...op, count: 0 };
                          acc[k].count++;
                          return acc;
                        }, {});
                        const typy_opakowan: any[] = Object.values(groupedOpakowania).sort((a: any, b: any) => a.nazwa.localeCompare(b.nazwa) || b.waga_kg - a.waga_kg);
                        const isWyrob = row.typ_asortymentu === "Wyrob_Gotowy";
                        const netto = parseFloat(row.cena_netto) > 0 ? parseFloat(row.cena_netto) : null;
                        const vat = row.stawka_vat !== "" ? parseFloat(row.stawka_vat) : null;
                        const brutto = netto != null && vat != null ? netto * (1 + vat / 100) : netto ?? 0;
                        const kwotaVat = netto != null && vat != null ? netto * vat / 100 : null;
                        const ilosc = parseFloat(row.ilosc) || 0;

                        return (
                          <div key={row._key} className="bg-[var(--bg-app)] border border-[var(--border)] rounded-xl overflow-hidden">
                            {/* Nagłówek wiersza */}
                            <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
                              <ArrowRightCircle className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                              <span className="text-sm font-semibold text-white flex-1 truncate">{row.nazwa}</span>
                              <button type="button" onClick={() => removeWzRow(row._key)} className="p-1 text-slate-500 hover:text-red-400 rounded transition-colors shrink-0">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Główna siatka pól */}
                            <div className="p-3">
                              <div className="grid gap-1.5 grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr]">

                                {/* Partia */}
                                <div>
                                  <label className="block text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
                                    Partia <span className="text-red-400">*</span>
                                  </label>
                                  {row.loadingPartie ? (
                                    <div className="flex items-center gap-1.5 h-7 text-slate-500 text-xs">
                                      <div className="w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                                      Ładowanie…
                                    </div>
                                  ) : row.dostepnePartie.length === 0 ? (
                                    <div className="text-red-400 text-xs h-7 flex items-center">Brak partii na stanie</div>
                                  ) : (
                                    <select
                                      required
                                      value={row.id_partii}
                                      onChange={e => updateWzRow(row._key, "id_partii", e.target.value)}
                                      className="w-full bg-[var(--bg-input)] border border-[var(--border)] text-white rounded px-2 py-1 outline-none focus:border-orange-500 text-[11px] font-mono"
                                    >
                                      <option value="">— wybierz —</option>
                                      {row.dostepnePartie.map(p => (
                                        <option key={p.id} value={p.id}>
                                          {p.numer_partii} · dost. {fmtL(p.stan, 2)} {row.jednostka_miary}
                                          {p.termin_waznosci ? ` · ww: ${fmt(p.termin_waznosci)}` : ""}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </div>

                                {/* Cena netto */}
                                    <div>
                                      <label className="block text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Cena netto</label>
                                      <div className="flex items-center rounded overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-input)' }}>
                                        <input
                                          type="number" step="0.01" min="0"
                                          value={row.cena_netto}
                                          onChange={e => updateWzRow(row._key, "cena_netto", e.target.value)}
                                          className="flex-1 min-w-0 px-2 py-1 text-[11px] font-mono bg-transparent outline-none text-right"
                                          style={{ color: 'var(--text-primary)' }}
                                          placeholder="0.00"
                                        />
                                        <span className="px-1 text-[9px] font-semibold border-l shrink-0" style={{ color: 'var(--text-muted)', borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>zł</span>
                                      </div>
                                    </div>

                                    {/* Cena brutto */}
                                    <div>
                                      <label className="block text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Cena brutto</label>
                                      <div className="rounded px-2 py-1 text-[11px] font-mono text-right h-7 flex items-center justify-end" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: brutto > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                        {brutto > 0 ? <>{brutto.toFixed(2)} <span className="text-[9px] ml-0.5 opacity-60">zł</span></> : <span className="opacity-40">—</span>}
                                      </div>
                                    </div>

                                    {/* VAT */}
                                    <div>
                                      <label className="block text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>VAT %</label>
                                      <select
                                        value={row.stawka_vat}
                                        onChange={e => updateWzRow(row._key, "stawka_vat", e.target.value)}
                                        className="w-full rounded px-2 py-1 text-[11px] font-mono outline-none cursor-pointer"
                                        style={{ border: '1px solid var(--border)', background: 'var(--bg-input)', color: row.stawka_vat === "" ? 'var(--text-muted)' : 'var(--text-primary)' }}
                                      >
                                        <option value="">— wybierz —</option>
                                        <option value="0">0% (zwolniona)</option>
                                        <option value="5">5%</option>
                                        <option value="8">8%</option>
                                        <option value="23">23%</option>
                                      </select>
                                    </div>

                                    {/* Wartość netto */}
                                    <div>
                                      <label className="block text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Wartość netto</label>
                                      <div className="rounded px-2 py-1 text-[11px] font-mono text-right h-7 flex items-center justify-end" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: netto != null ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                        {netto != null && ilosc > 0 ? <>{(netto * ilosc).toFixed(2)} <span className="text-[9px] ml-0.5 opacity-60">zł</span></> : <span className="opacity-40">—</span>}
                                      </div>
                                    </div>

                                    {/* Wartość brutto */}
                                    <div>
                                      <label className="block text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: '#fb923c' }}>Wartość brutto</label>
                                      <div className="rounded px-2 py-1 text-[11px] font-mono font-bold text-right h-7 flex items-center justify-end" style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.3)', color: brutto > 0 && ilosc > 0 ? '#fb923c' : 'var(--text-muted)' }}>
                                        {brutto > 0 && ilosc > 0 ? <>{(brutto * ilosc).toFixed(2)} <span className="text-[9px] ml-0.5 font-normal opacity-70">zł</span></> : <span className="opacity-40">—</span>}
                                      </div>
                                    </div>
                              </div>

                              {/* Opakowania — widoczne dla wszystkich typów towarów */}
                              {selectedPartia?.opakowania?.length ? (
                                <div className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                                  <label className="block text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>Opakowania</label>
                                  <div className="flex flex-wrap gap-1.5">
                                    {typy_opakowan.map((op, i) => {
                                      const opKey = `${op.id_asortymentu}_${op.waga_kg}`;
                                      return (
                                        <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-1" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                                          <span className="text-xs text-white">{op.nazwa} <span className="font-mono opacity-50">{op.waga_kg}kg</span></span>
                                          <input
                                            type="number" min="0" max={op.count} step="1"
                                            value={row.sztuki[opKey] ?? ""}
                                            placeholder="0"
                                            className="w-14 bg-[var(--bg-app)] border border-[var(--border)] text-white rounded px-1.5 py-1 font-mono text-xs outline-none focus:border-orange-500 text-right"
                                            onChange={e => updateWzSztuki(row._key, opKey, parseFloat(e.target.value) || 0, selectedPartia!.opakowania!)}
                                          />
                                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>/{op.count} szt.</span>
                                        </div>
                                      );
                                    })}
                                    <div className="self-center text-[10px] ml-1" style={{ color: 'var(--text-muted)' }}>
                                      Łącznie: <span className="text-white font-mono font-bold">{fmtL(ilosc, 3)} {row.jednostka_miary}</span>
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

              </div>
            </div>

          </form>
        </div>
      )}

      {/* ═══ MODAL RW ══════════════════════════════════════════════════════════ */}
      {showRw && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm pl-16 lg:pl-60 pt-2.5 pb-2.5 pr-2.5">
          <div className="flex h-full border-l border-r border-b rounded-b-xl overflow-hidden shadow-2xl"
               style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)' }}>

            {/* ── PRAWY PANEL META ── */}
            <div className="w-72 shrink-0 flex flex-col border-l"
                 style={{ order: 2, borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>

              {/* Nagłówek */}
              <div className="px-5 pt-5 pb-4 border-b shrink-0"
                   style={{ borderColor: 'var(--border)', background: 'linear-gradient(to bottom, rgba(153,27,27,0.15) 0%, transparent 100%)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                         style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
                      <MinusCircle className="w-5 h-5 text-red-400" />
                    </div>
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: 'rgba(252,165,165,0.6)' }}>{editDocRef ? 'Edycja dokumentu' : 'Nowy dokument'}</div>
                      <div className="text-2xl font-bold leading-none" style={{ color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>{editDocRef || 'RW'}</div>
                    </div>
                  </div>
                  <button type="button" onClick={() => { setShowRw(false); setEditDocRef(null); }}
                    className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-hover)] mt-0.5 shrink-0"
                    style={{ color: 'var(--text-muted)' }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[11px] font-mono mt-3" style={{ color: 'var(--text-muted)' }}>
                  Rozchód Wewnętrzny · {new Date().toLocaleDateString('pl-PL')}
                </p>
              </div>

              {/* Info o pozycjach */}
              <div className="p-4 flex-1 overflow-y-auto">
                {rwRows.length > 0 && (() => {
                  const totalIlosc = rwRows.reduce((s, r) => s + (parseFloat(r.ilosc) || 0), 0);
                  const grupyJm: Record<string, number> = rwRows.reduce((acc: Record<string, number>, r) => {
                    const v = parseFloat(r.ilosc) || 0;
                    if (v > 0) acc[r.jednostka_miary] = (acc[r.jednostka_miary] || 0) + v;
                    return acc;
                  }, {});
                  return (
                    <div className="space-y-3">
                      <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Podsumowanie</div>
                      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                        {Object.entries(grupyJm).map(([jm, il]) => (
                          <div key={jm} className="flex justify-between items-center px-3 py-2" style={{ borderBottom: '1px solid var(--border-dim)', background: 'var(--bg-app)' }}>
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{jm}</span>
                            <span className="font-mono font-bold text-xs" style={{ color: '#f87171' }}>{fmtL(il, 3)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Stopka */}
              <div className="p-4 border-t space-y-2 shrink-0" style={{ borderColor: 'var(--border)' }}>
                {rwRows.length > 0 && (
                  <div className="text-xs font-mono mb-3">
                    <span style={{ color: 'var(--text-muted)' }}>
                      <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{rwRows.length}</span> poz. do rozchodu
                    </span>
                  </div>
                )}
                <button type="button" onClick={() => handleCreateRw(true)} disabled={rwSaving}
                  className="btn w-full justify-center font-bold text-sm"
                  style={{ background: '#991b1b', borderColor: '#991b1b', color: 'white' }}>
                  {rwSaving ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Zatwierdź
                </button>
                <button type="button" onClick={() => handleCreateRw(false)} disabled={rwSaving}
                  className="btn btn-ghost w-full justify-center"
                  style={{ border: '1px solid var(--border)' }}>
                  {rwSaving ? <div className="w-4 h-4 border-2 border-current/40 border-t-current rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                  Bufor
                </button>
                <button type="button" onClick={() => { setShowRw(false); setEditDocRef(null); }} disabled={rwSaving}
                  className="btn btn-ghost w-full justify-center">
                  Anuluj
                </button>
              </div>
            </div>

            {/* ── PRAWY PANEL (pozycje) ── */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="px-5 py-3 border-b shrink-0 flex items-center justify-between"
                   style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                  <MinusCircle className="w-3.5 h-3.5 text-red-400" />
                  Pozycje do rozchodu
                  {rwRows.length > 0 && (
                    <span className="ml-1 px-2 py-0.5 rounded font-mono font-bold text-[10px]"
                          style={{ background: 'rgba(153,27,27,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                      {rwRows.length}
                    </span>
                  )}
                </div>
                <button type="button" onClick={openRwSelektor}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm text-white"
                  style={{ background: '#991b1b' }}>
                  <Plus className="w-4 h-4" /> Dodaj pozycję
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {rwRows.length === 0 ? (
                  <div onClick={openRwSelektor}
                    className="h-full flex flex-col items-center justify-center gap-4 cursor-pointer group"
                    style={{ color: 'var(--text-muted)' }}>
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                         style={{ background: 'rgba(153,27,27,0.06)', border: '2px dashed rgba(239,68,68,0.2)' }}>
                      <MinusCircle className="w-7 h-7 group-hover:text-red-400 transition-colors" style={{ color: 'rgba(239,68,68,0.4)' }} />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Brak pozycji do rozchodu</p>
                      <p className="text-xs mt-1">Kliknij aby wybrać towary z asortymentu</p>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 space-y-2">
                    {rwRows.map(row => (
                      <div key={row._key} className="bg-[var(--bg-app)] border border-[var(--border)] rounded-xl overflow-hidden">
                        {/* Nagłówek karty */}
                        <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
                          <MinusCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          <span className="text-sm font-semibold text-white flex-1 truncate">{row.nazwa}</span>
                          <button type="button" onClick={() => removeRwRow(row._key)} className="p-1 text-slate-500 hover:text-red-400 rounded transition-colors shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Pola */}
                        <div className="p-3">
                          <div className="grid gap-1.5 grid-cols-[2fr_1fr]">

                            {/* Partia */}
                            <div>
                              <label className="block text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
                                Partia <span className="text-red-400">*</span>
                              </label>
                              {row.loadingPartie ? (
                                <div className="flex items-center gap-1.5 h-7 text-slate-500 text-xs">
                                  <div className="w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                                  Ładowanie…
                                </div>
                              ) : row.dostepnePartie.length === 0 ? (
                                <div className="text-red-400 text-xs h-7 flex items-center">Brak partii na stanie</div>
                              ) : (
                                <select required value={row.id_partii}
                                  onChange={e => updateRwRow(row._key, "id_partii", e.target.value)}
                                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] text-white rounded px-2 py-1 outline-none focus:border-red-500 text-[11px] font-mono">
                                  <option value="">— wybierz —</option>
                                  {row.dostepnePartie.map(p => (
                                    <option key={p.id} value={p.id}>
                                      {p.numer_partii} · dost. {fmtL(p.stan, 2)} {row.jednostka_miary}
                                      {p.termin_waznosci ? ` · ww: ${fmt(p.termin_waznosci)}` : ""}
                                    </option>
                                  ))}
                                </select>
                              )}
                              {row.id_partii && (() => {
                                const p = row.dostepnePartie.find(p => p.id === row.id_partii);
                                return p ? <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>dostępne: <span className="font-mono font-bold text-emerald-400">{fmtL(p.stan, 3)} {row.jednostka_miary}</span></div> : null;
                              })()}
                            </div>

                            {/* Ilość */}
                            <div>
                              <label className="block text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
                                Ilość <span className="text-red-400">*</span>
                              </label>
                              <div className="flex items-center rounded overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-input)' }}>
                                <input type="number" step="0.001" min="0.001" value={row.ilosc}
                                  onChange={e => updateRwRow(row._key, "ilosc", e.target.value)}
                                  placeholder="0"
                                  className="flex-1 min-w-0 px-2 py-1 text-[11px] font-mono font-bold bg-transparent outline-none text-right"
                                  style={{ color: '#f87171' }}
                                />
                                <span className="px-1 text-[9px] font-semibold border-l shrink-0" style={{ color: 'var(--text-muted)', borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>{row.jednostka_miary}</span>
                              </div>
                            </div>

                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ═══ SELEKTOR ASORTYMENTU ══════════════════════════════════════════════ */}
      {showSelektor && (
        <AsortymentSelektor
          tryb={selektorTryb}
          typy={selektorTryb === "wz" ? ["Wyrob_Gotowy"] : undefined}
          hideIlosc={selektorTryb === "wz" || selektorTryb === "rw"}
          onClose={() => setShowSelektor(false)}
          onConfirm={selektorTryb === "pz" ? onSelektorPzConfirm : selektorTryb === "wz" ? onSelektorWzConfirm : onSelektorRwConfirm}
        />
      )}

      {/* ═══ PODGLĄD DOKUMENTU ════════════════════════════════════════════════ */}
      {previewDocRef && (
        <DocumentPreviewModal
          docRef={previewDocRef}
          docData={previewDocData}
          loading={previewDocLoading}
          onClose={() => setPreviewDocRef(null)}
          zIndex={60}
          onEdit={(ref) => {
            const doc = dokumenty.find(d => d.referencja === ref);
            if (doc) openEditModal(doc);
          }}
          onZatwierdz={handleZatwierdz}
          onAnuluj={handleAnuluj}
          onUsun={handleUsun}
          onPrintLabels={handlePrintAllLabels}
          actionLoading={actionLoading}
        />
      )}

      {/* ═══ PASEK FILTRÓW ══════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-1.5 shrink-0 rounded-lg overflow-hidden"
           style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '4px 6px' }}>

        {/* Typ — kolorowe przyciski */}
        {(["PZ","WZ","RW","PW"] as const).map(t => {
          const c = typCfg[t];
          const isActive = filter === t;
          const cnt = typCounts[t] || 0;
          return (
            <button key={t} onClick={() => setFilter(t)}
              className="flex items-center gap-1.5 transition-all"
              style={{
                padding: '5px 11px', borderRadius: 6,
                background: isActive ? c.bg : 'transparent',
                color: isActive ? c.color : 'var(--text-muted)',
                border: `1px solid ${isActive ? c.border : 'transparent'}`,
                fontWeight: 800, fontSize: 11, letterSpacing: '0.06em',
                boxShadow: isActive ? `0 0 12px ${c.color}20` : 'none',
              }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: isActive ? c.color : 'var(--text-muted)',
                display: 'inline-block', flexShrink: 0,
                boxShadow: isActive ? `0 0 5px ${c.color}` : 'none',
                transition: 'all 0.15s',
              }} />
              {t}
              {cnt > 0 && (
                <span style={{
                  padding: '0 5px', borderRadius: 10, fontSize: 9, fontWeight: 700, lineHeight: '16px',
                  background: isActive ? `${c.color}20` : 'var(--bg-hover)',
                  color: isActive ? c.color : 'var(--text-muted)',
                }}>{cnt}</span>
              )}
            </button>
          );
        })}

        <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px', flexShrink: 0 }} />

        {/* Rok */}
        <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
          className="text-xs font-medium outline-none cursor-pointer"
          style={{ background: 'transparent', border: 'none', color: selectedYear ? 'var(--text-primary)' : 'var(--text-muted)', padding: '4px 6px', borderRadius: 4 }}>
          <option value="">Rok</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        {/* Miesiąc */}
        <select value={selectedMonth} disabled={!selectedYear} onChange={e => setSelectedMonth(e.target.value)}
          className="text-xs font-medium outline-none cursor-pointer disabled:opacity-30"
          style={{ background: 'transparent', border: 'none', color: selectedMonth ? 'var(--text-primary)' : 'var(--text-muted)', padding: '4px 6px', borderRadius: 4 }}>
          <option value="">Miesiąc</option>
          {months.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
        </select>

        <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px', flexShrink: 0 }} />

        {/* Szukaj */}
        <div className="relative flex-1" style={{ minWidth: 0 }}>
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: 'var(--text-muted)' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Numer, partia, towar…"
            className="w-full text-xs outline-none bg-transparent"
            style={{ color: 'var(--text-primary)', paddingLeft: 22, paddingRight: 8, paddingTop: 4, paddingBottom: 4 }} />
        </div>
        {search && (
          <button onClick={() => setSearch("")} className="p-1 rounded transition-colors hover:bg-[var(--bg-hover)]"
                  style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
            <X className="w-3 h-3" />
          </button>
        )}

        <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px', flexShrink: 0 }} />
        <span className="text-[10px] font-mono font-semibold px-1"
              style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {filteredDocs.length}
        </span>
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
              <tr style={{ background: 'var(--bg-surface)', borderBottom: '2px solid var(--border)' }}>
                <th style={{ width: 3, padding: 0 }} />
                {([
                  { label: 'Typ',             field: 'typ'        },
                  { label: 'Status',          field: 'status'     },
                  { label: 'Nr dokumentu',    field: 'referencja' },
                  { label: 'Data · Operator', field: 'data'       },
                  ...(filter !== 'RW' && filter !== 'PW' ? [{ label: 'Kontrahent', field: 'kontrahent' }] : []),
                  ...(filter !== 'PZ' && filter !== 'WZ' ? [{ label: 'ZP', field: null }] : []),
                  { label: 'Akcje',           field: null         },
                ] as { label: string; field: string | null }[]).map(({ label, field }, i) =>
                  field ? (
                    <SortableTh key={label} label={label} field={field}
                      sortKey={sortKey} sortDir={sortDir} onSort={handleSort}
                      style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }} />
                  ) : (
                    <th key={label} style={{ padding: '7px 10px', textAlign: label === 'Akcje' ? 'right' : 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{label}</th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filteredDocs.map(doc => {
                const c = typCfg[doc.typ] || { color: 'var(--text-muted)', bg: 'transparent', border: 'transparent', label: '' };
                const isLoading = actionLoading === doc.referencja;
                const canApprove = (doc.typ === "PZ" || doc.typ === "WZ" || doc.typ === "RW") && doc.status === "Bufor";
                const canDelete  = (doc.typ === "PZ" || doc.typ === "WZ" || doc.typ === "RW") && doc.status === "Bufor";
                const canCancel  = (doc.typ === "PZ" || doc.typ === "WZ" || doc.typ === "RW") && doc.status === "Zatwierdzony";
                return (
                  <tr key={doc.referencja} onClick={() => openDocPreview(doc.referencja)}
                    style={{ borderBottom: '1px solid var(--border-dim)', cursor: 'pointer', transition: 'background .12s', opacity: doc.status === 'Anulowany' ? 0.45 : 1 }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>

                    {/* Typ — kolor jako pionowy pasek */}
                    <td style={{ padding: '0', width: 0 }}>
                      <div style={{ width: 3, height: 36, background: c.color, opacity: 0.7 }} />
                    </td>
                    <td style={{ padding: '6px 10px 6px 8px', whiteSpace: 'nowrap' }}>
                      <span style={{ display:'inline-block', padding:'2px 7px', borderRadius:3, fontSize:10, fontWeight:800, letterSpacing:'0.06em', background: c.bg, color: c.color, border:`1px solid ${c.border}` }}>
                        {doc.typ}
                      </span>
                    </td>

                    {/* Status */}
                    <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                      <StatusBadge status={doc.status || 'Zatwierdzony'} />
                    </td>

                    {/* Nr dokumentu */}
                    <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:12, fontWeight:700, color:'var(--text-primary)' }}>
                        {doc.referencja}
                      </span>
                      {doc.numer_zewnetrzny && (
                        <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:10, color:'var(--text-muted)', marginTop:2 }}>
                          ext: {doc.numer_zewnetrzny}
                        </div>
                      )}
                    </td>

                    {/* Data · Operator */}
                    <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:11, color:'var(--text-secondary)' }}>
                        {fmtFull(doc.data)}
                      </span>
                      <span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:5 }}>· {doc.uzytkownik}</span>
                    </td>

                    {/* Kontrahent */}
                    {filter !== 'RW' && filter !== 'PW' && (
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                        {doc.kontrahent
                          ? <span style={{ fontSize: 11 }}>
                              <span style={{ fontFamily: 'JetBrains Mono,monospace', color: 'var(--accent)', fontWeight: 700 }}>{doc.kontrahent.kod}</span>
                              {' '}<span style={{ color: 'var(--text-secondary)' }}>{doc.kontrahent.nazwa}</span>
                            </span>
                          : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>}
                      </td>
                    )}

                    {/* ZP */}
                    {filter !== 'PZ' && filter !== 'WZ' && (
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                        {doc.numer_zlecenia
                          ? <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:11, color:'var(--text-code)' }}>{doc.numer_zlecenia}</span>
                          : <span style={{ color:'var(--text-muted)', fontSize:11 }}>—</span>}
                      </td>
                    )}

                    {/* Akcje */}
                    <td style={{ padding: '6px 10px' }}>
                      <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                        {doc.status === 'Bufor' && doc.typ !== 'PW' && (
                          <button onClick={e => { e.stopPropagation(); openEditModal(doc); }}
                            className="p-1.5 rounded hover:bg-[var(--bg-hover)] transition-colors"
                            title="Edytuj dokument"
                            style={{ color: 'var(--accent)' }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
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
                          style={{ color:'var(--accent)', background:'var(--accent-dim)', border:'1px solid var(--border-accent)' }}>
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
