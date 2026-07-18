import React, { useState, useEffect } from "react";
import { BarChart2, ChevronDown, ChevronRight, TrendingUp, FileText, Users, Calendar, Package, DollarSign, Layers, Printer, Receipt } from "lucide-react";
import { fmtL, fmtDate } from "../utils/fmt";
import { Spinner } from "../components/Spinner";
import { printReport } from "../utils/printReport";

type Pozycja = {
  asortyment: string;
  wyrob: string | null;
  kod_towaru: string;
  numer_partii: string;
  jednostka: string;
  ilosc: number;
  ilosc_kg: number | null;
  cena_jednostkowa: number | null;
  wartosc: number;
};

type Dokument = {
  referencja: string;
  data: string | null;
  wartosc: number;
  pozycje: Pozycja[];
};

type KontrahentRow = {
  id: string | null;
  kod: string;
  nazwa: string;
  liczba_dokumentow: number;
  wartosc_total: number;
  dokumenty: Dokument[];
};

type RaportData = {
  kontrahenci: KontrahentRow[];
  suma_total: number;
  liczba_dokumentow: number;
};

type StanMagazynowy = {
  id: string;
  kod_towaru: string;
  nazwa: string;
  typ_asortymentu: string;
  jednostka_miary: string;
  ilosc: number;
  rezerwacje: number;
  cena_srednia: number;
  cena_sprzedazy: number | null;
  stawka_vat: number | null;
};

const typLabels: Record<string, string> = {
  Surowiec: "Surowiec",
  Polprodukt: "Półprodukt",
  Wyrob_Gotowy: "Wyrób gotowy",
  Opakowanie: "Opakowanie",
};

const typColors: Record<string, string> = {
  Surowiec: "#60a5fa",
  Polprodukt: "#fbbf24",
  Wyrob_Gotowy: "#4ade80",
  Opakowanie: "#c084fc",
};

function fmt(val: number) {
  return val.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type WyrobGotowyRow = {
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

type ActiveReport = "sprzedaz" | "stany_bez_cen" | "stany_ceny_sprzedazy" | "stany_wartosci" | "wyroby_opakowania" | "kalkulator_fs";

export default function Raporty() {
  const today = new Date();
  const toLocalDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };
  const firstOfYear = toLocalDateStr(new Date(today.getFullYear(), 0, 1));
  const todayStr = toLocalDateStr(today);

  const [activeReport, setActiveReport] = useState<ActiveReport>("sprzedaz");

  // -- Sprzedaż per kontrahent --
  const [od, setOd] = useState(firstOfYear);
  const [doData, setDoData] = useState(todayStr);
  const [filtKontrahent, setFiltKontrahent] = useState<string>("__all__");
  const [data, setData] = useState<RaportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedDok, setExpandedDok] = useState<Set<string>>(new Set());

  // -- Stany magazynowe --
  // -- Stany magazynowe --
  const [stanyData, setStanyData] = useState<StanMagazynowy[] | null>(null);
  const [stanyLoading, setStanyLoading] = useState(false);
  const [stanyTypFilter, setStanyTypFilter] = useState<string>("all");
  const [stanySearch, setStanySearch] = useState("");
  const [tylkoZZapasem, setTylkoZZapasem] = useState(true);

  // -- Wyroby gotowe z opakowaniami --
  const [wyrobyData, setWyrobyData] = useState<WyrobGotowyRow[] | null>(null);
  const [wyrobyLoading, setWyrobyLoading] = useState(false);
  const [wyrobySearch, setWyrobySearch] = useState("");

  // -- Kalkulator FS --
  const [fsOd, setFsOd] = useState(firstOfYear);
  const [fsDo, setFsDo] = useState(todayStr);
  const [fsKontrahent, setFsKontrahent] = useState<string>("__all__");
  const [fsRaportData, setFsRaportData] = useState<RaportData | null>(null);
  const [fsLoading, setFsLoading] = useState(false);
  const [selectedWz, setSelectedWz] = useState<Set<string>>(new Set());
  const [fsVatRate, setFsVatRate] = useState<string>("5");

  const fetchRaport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (od) params.set("od", od);
      if (doData) params.set("do", doData);
      const res = await fetch(`/api/raporty/sprzedaz-per-kontrahent?${params}`);
      if (res.ok) setData(await res.json());
    } catch {}
    finally { setLoading(false); }
  };

  const fetchStany = async () => {
    if (stanyData) return;
    setStanyLoading(true);
    try {
      const res = await fetch("/api/asortyment");
      if (res.ok) setStanyData(await res.json());
    } catch {} finally { setStanyLoading(false); }
  };

  const fetchWyroby = async (force = false) => {
    if (wyrobyData && !force) return;
    setWyrobyLoading(true);
    try {
      const res = await fetch("/api/wyroby-gotowe/stan");
      if (res.ok) setWyrobyData(await res.json());
    } catch {} finally { setWyrobyLoading(false); }
  };

  const fetchFsRaport = async () => {
    setFsLoading(true);
    setSelectedWz(new Set());
    try {
      const params = new URLSearchParams();
      if (fsOd) params.set("od", fsOd);
      if (fsDo) params.set("do", fsDo);
      const res = await fetch(`/api/raporty/sprzedaz-per-kontrahent?${params}`);
      if (res.ok) setFsRaportData(await res.json());
    } catch {} finally { setFsLoading(false); }
  };

  useEffect(() => { fetchRaport(); }, []);

  useEffect(() => {
    if (activeReport === "stany_bez_cen" || activeReport === "stany_ceny_sprzedazy" || activeReport === "stany_wartosci") fetchStany();
    if (activeReport === "wyroby_opakowania") fetchWyroby();
    if (activeReport === "kalkulator_fs" && !fsRaportData) fetchFsRaport();
  }, [activeReport]);

  const visibleKontrahenci = data
    ? filtKontrahent === "__all__"
      ? data.kontrahenci
      : data.kontrahenci.filter(k => (k.id ?? "__brak__") === filtKontrahent)
    : [];

  const visibleSuma = visibleKontrahenci.reduce((s, k) => s + k.wartosc_total, 0);
  const visibleDok = visibleKontrahenci.reduce((s, k) => s + k.liczba_dokumentow, 0);

  const toggleKontrahent = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleDok = (ref: string) => {
    setExpandedDok(prev => {
      const next = new Set(prev);
      next.has(ref) ? next.delete(ref) : next.add(ref);
      return next;
    });
  };

  const filteredStany = (stanyData ?? []).filter(a => {
    if (tylkoZZapasem && a.ilosc <= 0) return false;
    if (stanyTypFilter !== "all" && a.typ_asortymentu !== stanyTypFilter) return false;
    if (stanySearch) {
      const q = stanySearch.toLowerCase();
      if (!a.nazwa.toLowerCase().includes(q) && !a.kod_towaru.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const fsDokumenty = React.useMemo(() => {
    if (!fsRaportData) return [];
    return fsRaportData.kontrahenci
      .filter(k => fsKontrahent === "__all__" || (k.id ?? "__brak__") === fsKontrahent)
      .flatMap(k => k.dokumenty.map(d => ({ ...d, kontrahent: k.nazwa })))
      .sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));
  }, [fsRaportData, fsKontrahent]);

  const fsAggregates = React.useMemo(() => {
    let sumKg = 0;
    let wartoscKg = 0;
    let sumSzt = 0;
    let wartoscSzt = 0;

    fsDokumenty.filter(d => selectedWz.has(d.referencja)).forEach(d => {
      d.pozycje.forEach(p => {
        if (p.ilosc_kg != null && p.ilosc_kg > 0) {
          sumKg += p.ilosc_kg;
          wartoscKg += p.wartosc;
        } else if (p.jednostka === "szt." || p.jednostka === "szt") {
          sumSzt += p.ilosc;
          wartoscSzt += p.wartosc;
        } else {
          // Fallback
          sumKg += p.ilosc;
          wartoscKg += p.wartosc;
        }
      });
    });

    const totalWartoscNetto = wartoscKg + wartoscSzt;
    const vatRateNum = parseFloat(fsVatRate) || 0;
    
    // Calculate VAT per row to avoid rounding discrepancies with the PDF rows
    const kwotaVatKg = sumKg > 0 ? Math.round(wartoscKg * vatRateNum / 100 * 100) / 100 : 0;
    const kwotaVatSzt = sumSzt > 0 ? Math.round(wartoscSzt * vatRateNum / 100 * 100) / 100 : 0;
    const kwotaVat = kwotaVatKg + kwotaVatSzt;
    
    const wartoscBrutto = Math.round((totalWartoscNetto + kwotaVat) * 100) / 100;

    return { 
      sumKg, wartoscKg, sredniaCenaKg: sumKg > 0 ? wartoscKg / sumKg : 0, 
      sumSzt, wartoscSzt, sredniaCenaSzt: sumSzt > 0 ? wartoscSzt / sumSzt : 0,
      totalWartoscNetto, kwotaVat, wartoscBrutto, vatRateNum
    };
  }, [fsDokumenty, selectedWz, fsVatRate]);

  const fsSumaKg = fsAggregates.sumKg;
  const fsSredniaCena = fsAggregates.sredniaCenaKg;
  const fsWartoscNetto = fsAggregates.totalWartoscNetto;
  const fsVatRateNum = fsAggregates.vatRateNum;
  const fsKwotaVat = fsAggregates.kwotaVat;
  const fsWartoscBrutto = fsAggregates.wartoscBrutto;

  const toggleWz = (ref: string) => setSelectedWz(prev => {
    const next = new Set(prev);
    next.has(ref) ? next.delete(ref) : next.add(ref);
    return next;
  });

  const toggleAllWz = () => {
    setSelectedWz(selectedWz.size === fsDokumenty.length && fsDokumenty.length > 0
      ? new Set()
      : new Set(fsDokumenty.map(d => d.referencja)));
  };

  const exportKalkulatorFS = () => {
    if (selectedWz.size === 0 || fsWartoscNetto === 0) return;
    const refs = fsDokumenty.filter(d => selectedWz.has(d.referencja)).map(d => d.referencja).join(', ');
    printReport({
      title: "Kalkulator FS — Lody gelato",
      subtitle: `Dokumenty WZ: ${refs}`,
      sections: [
        {
          columns: [
            { label: "Nazwa towaru/usługi" },
            { label: "Ilość", align: "right" },
            { label: "Jdn." },
            { label: "Cena jdn. (netto)", align: "right" },
            { label: "VAT", align: "right" },
            { label: "Wartość netto", align: "right", bold: true },
            { label: "Kwota VAT", align: "right" },
            { label: "Wartość brutto", align: "right", bold: true },
          ],
          rows: [
            ...(fsAggregates.sumKg > 0 ? [[
              "Lody gelato",
              fmtL(fsAggregates.sumKg, 3),
              "kg",
              `${fsAggregates.sredniaCenaKg.toFixed(2)} zł`,
              `${fsVatRate}%`,
              `${fmt(fsAggregates.wartoscKg)} zł`,
              `${fmt(Math.round(fsAggregates.wartoscKg * fsVatRateNum / 100 * 100) / 100)} zł`,
              `${fmt(fsAggregates.wartoscKg + Math.round(fsAggregates.wartoscKg * fsVatRateNum / 100 * 100) / 100)} zł`,
            ]] : []),
            ...(fsAggregates.sumSzt > 0 ? [[
              "Gelato w kubeczkach",
              fmtL(fsAggregates.sumSzt, 0),
              "szt.",
              `${fsAggregates.sredniaCenaSzt.toFixed(2)} zł`,
              `${fsVatRate}%`,
              `${fmt(fsAggregates.wartoscSzt)} zł`,
              `${fmt(Math.round(fsAggregates.wartoscSzt * fsVatRateNum / 100 * 100) / 100)} zł`,
              `${fmt(fsAggregates.wartoscSzt + Math.round(fsAggregates.wartoscSzt * fsVatRateNum / 100 * 100) / 100)} zł`,
            ]] : [])
          ],
          totalRow: ["RAZEM", null, null, null, null, `${fmt(fsWartoscNetto)} zł`, `${fmt(fsKwotaVat)} zł`, `${fmt(fsWartoscBrutto)} zł`],
        },
        {
          heading: "Rozliczenie VAT",
          columns: [
            { label: "Stawka VAT", align: "right" },
            { label: "Wartość netto", align: "right", bold: true },
            { label: "Kwota VAT", align: "right" },
            { label: "Wartość brutto", align: "right", bold: true },
          ],
          rows: [[
            `${fsVatRate}%`,
            `${fmt(fsWartoscNetto)} zł`,
            `${fmt(fsKwotaVat)} zł`,
            `${fmt(fsWartoscBrutto)} zł`,
          ]],
          totalRow: ["RAZEM", `${fmt(fsWartoscNetto)} zł`, `${fmt(fsKwotaVat)} zł`, `${fmt(fsWartoscBrutto)} zł`],
        },
      ],
    });
  };

  const exportSprzedaz = () => {
    if (!visibleKontrahenci.length) return;
    const rows: (string | number | null)[][] = [];
    for (const k of visibleKontrahenci) {
      for (const dok of k.dokumenty) {
        for (const poz of dok.pozycje) {
          rows.push([
            k.nazwa,
            dok.referencja,
            fmtDate(dok.data),
            poz.wyrob ?? poz.asortyment,
            `${poz.ilosc.toLocaleString('pl-PL', { maximumFractionDigits: 3 })} ${poz.jednostka}`,
            `${fmt(poz.wartosc)} zł`,
          ]);
        }
      }
    }
    printReport({
      title: "Sprzedaż per kontrahent",
      subtitle: `Okres: ${od} — ${doData}`,
      sections: [{
        columns: [
          { label: "Kontrahent" },
          { label: "Dokument WZ" },
          { label: "Data" },
          { label: "Towar / wyrób" },
          { label: "Ilość", align: "right" },
          { label: "Wartość netto", align: "right", bold: true },
        ],
        rows,
        totalRow: ["RAZEM", `${visibleDok} dok.`, null, null, null, `${fmt(visibleSuma)} zł`],
      }],
    });
  };

  const exportStanyBezCen = () => {
    printReport({
      title: "Zestawienie stanów magazynowych — ilościowy",
      sections: [{
        columns: [
          { label: "Kod" },
          { label: "Nazwa" },
          { label: "Typ" },
          { label: "J.M." },
          { label: "Stan", align: "right" },
          { label: "Zarezerwowane", align: "right" },
          { label: "Dostępne", align: "right", bold: true },
        ],
        rows: filteredStany.map(a => [
          a.kod_towaru,
          a.nazwa,
          typLabels[a.typ_asortymentu] ?? a.typ_asortymentu,
          a.jednostka_miary,
          fmtL(a.ilosc, 3),
          fmtL(a.rezerwacje, 3),
          fmtL(a.ilosc - a.rezerwacje, 3),
        ]),
        totalRow: [`RAZEM (${filteredStany.length} poz.)`, null, null, null, null,
          fmtL(filteredStany.reduce((s, a) => s + a.rezerwacje, 0), 3),
          null,
        ],
      }],
    });
  };

  const exportStanyCenySprzedazy = () => {
    printReport({
      title: "Zestawienie stanów magazynowych — ceny sprzedaży (netto)",
      sections: [{
        columns: [
          { label: "Kod" },
          { label: "Nazwa" },
          { label: "Typ" },
          { label: "J.M." },
          { label: "Dostępne", align: "right" },
          { label: "Cena netto sprzedaży", align: "right" },
          { label: "VAT", align: "right" },
          { label: "Wartość netto", align: "right", bold: true },
        ],
        rows: filteredStany.map(a => {
          const dostepne = a.ilosc - a.rezerwacje;
          const wartosc = a.cena_sprzedazy != null ? dostepne * a.cena_sprzedazy : null;
          return [
            a.kod_towaru,
            a.nazwa,
            typLabels[a.typ_asortymentu] ?? a.typ_asortymentu,
            a.jednostka_miary,
            fmtL(dostepne, 3),
            a.cena_sprzedazy != null ? `${fmt(a.cena_sprzedazy)} zł` : null,
            a.stawka_vat != null ? `${a.stawka_vat}%` : null,
            wartosc != null ? `${fmt(wartosc)} zł` : null,
          ];
        }),
        totalRow: [`RAZEM (${filteredStany.length} poz.)`, null, null, null, null, null, null,
          `${fmt(filteredStany.reduce((s, a) => a.cena_sprzedazy != null ? s + (a.ilosc - a.rezerwacje) * a.cena_sprzedazy : s, 0))} zł`,
        ],
      }],
    });
  };

  const exportStanyWartosci = () => {
    printReport({
      title: "Zestawienie stanów magazynowych — wartości zakupu (netto)",
      sections: [{
        columns: [
          { label: "Kod" },
          { label: "Nazwa" },
          { label: "Typ" },
          { label: "J.M." },
          { label: "Stan", align: "right" },
          { label: "Cena śr. zakupu (netto)", align: "right" },
          { label: "Wartość magazynowa (netto)", align: "right", bold: true },
        ],
        rows: filteredStany.map(a => [
          a.kod_towaru,
          a.nazwa,
          typLabels[a.typ_asortymentu] ?? a.typ_asortymentu,
          a.jednostka_miary,
          fmtL(a.ilosc, 3),
          a.cena_srednia > 0 ? `${fmt(a.cena_srednia)} zł` : null,
          a.cena_srednia > 0 ? `${fmt(a.ilosc * a.cena_srednia)} zł` : null,
        ]),
        totalRow: [`RAZEM (${filteredStany.length} poz.)`, null, null, null, null, null,
          `${fmt(filteredStany.reduce((s, a) => s + a.ilosc * a.cena_srednia, 0))} zł`,
        ],
      }],
    });
  };

  const tabs: { id: ActiveReport; label: string; icon: React.ReactNode }[] = [
    { id: "sprzedaz", label: "Sprzedaż per kontrahent", icon: <Users className="w-4 h-4" /> },
    { id: "stany_bez_cen", label: "Stany mag. — ilościowy", icon: <Package className="w-4 h-4" /> },
    { id: "stany_ceny_sprzedazy", label: "Stany mag. — ceny sprzedaży", icon: <DollarSign className="w-4 h-4" /> },
    { id: "stany_wartosci", label: "Stany mag. — wartości zakupu", icon: <Layers className="w-4 h-4" /> },
    { id: "wyroby_opakowania", label: "Wyroby gotowe — opakowania", icon: <Package className="w-4 h-4" /> },
    { id: "kalkulator_fs", label: "Kalkulator FS", icon: <Receipt className="w-4 h-4" /> },
  ];

  // -- Filtry dla stanów --
  const stanyFilterBar = (onExport: () => void) => (
    <div
      className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl shrink-0"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
    >
      <input
        type="text"
        placeholder="Szukaj…"
        value={stanySearch}
        onChange={e => setStanySearch(e.target.value)}
        className="rounded-lg px-3 py-1.5 text-sm outline-none"
        style={{ background: "var(--bg-app)", border: "1px solid var(--border)", color: "var(--text-primary)", width: 180 }}
      />
      <select
        value={stanyTypFilter}
        onChange={e => setStanyTypFilter(e.target.value)}
        className="rounded-lg px-3 py-1.5 text-sm outline-none cursor-pointer"
        style={{ background: "var(--bg-app)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
      >
        <option value="all">Wszystkie typy</option>
        <option value="Surowiec">Surowce</option>
        <option value="Polprodukt">Półprodukty</option>
        <option value="Wyrob_Gotowy">Wyroby gotowe</option>
        <option value="Opakowanie">Opakowania</option>
      </select>
      <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: "var(--text-secondary)" }}>
        <input
          type="checkbox"
          checked={tylkoZZapasem}
          onChange={e => setTylkoZZapasem(e.target.checked)}
          className="rounded"
        />
        Tylko z zapasem
      </label>
      <span className="ml-auto text-xs font-mono" style={{ color: "var(--text-muted)" }}>
        {filteredStany.length} poz.
      </span>
      <button
        onClick={() => { setStanyData(null); fetchStany(); }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all btn-hover-effect"
        style={{ background: 'rgba(6,182,212,0.15)', color: 'var(--accent)', border: '1px solid rgba(6,182,212,0.35)' }}
      >
        <TrendingUp className="w-3.5 h-3.5" /> Odśwież
      </button>
      <button
        onClick={onExport}
        disabled={filteredStany.length === 0}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all btn-hover-effect disabled:opacity-40"
        style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.35)' }}
      >
        <Printer className="w-3.5 h-3.5" /> Eksportuj PDF
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 h-full animate-view">
      {/* Nagłówek */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-black text-white tracking-tight">Raporty</h2>
            <span className="text-[9px] font-bold uppercase tracking-[0.15em] px-2 py-0.5 rounded"
                  style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--border-accent)' }}>
              Analiza
            </span>
          </div>
        </div>
      </div>

      {/* Zakładki raportów */}
      <div className="flex gap-1 shrink-0 flex-wrap">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveReport(tab.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={
              activeReport === tab.id
                ? { background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--border-accent)' }
                : { background: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
            }
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ── SPRZEDAŻ PER KONTRAHENT ── */}
      {activeReport === "sprzedaz" && (
        <>
          {/* Filtry */}
          <div
            className="flex flex-wrap items-center gap-4 px-4 py-3 rounded-xl shrink-0"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />
              <span className="text-xs font-bold uppercase" style={{ color: "var(--text-muted)" }}>Okres:</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs" style={{ color: "var(--text-muted)" }}>Od</label>
              <input
                type="date" value={od} onChange={e => setOd(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-sm outline-none"
                style={{ background: "var(--bg-app)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs" style={{ color: "var(--text-muted)" }}>Do</label>
              <input
                type="date" value={doData} onChange={e => setDoData(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-sm outline-none"
                style={{ background: "var(--bg-app)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              />
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />
              <select
                value={filtKontrahent}
                onChange={e => setFiltKontrahent(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-sm outline-none"
                style={{ background: "var(--bg-app)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              >
                <option value="__all__">Wszyscy kontrahenci</option>
                {(data?.kontrahenci ?? []).map(k => (
                  <option key={k.id ?? "__brak__"} value={k.id ?? "__brak__"}>{k.nazwa}</option>
                ))}
              </select>
            </div>
            <button
              onClick={fetchRaport} disabled={loading}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all btn-hover-effect"
              style={{ background: 'rgba(6,182,212,0.15)', color: 'var(--accent)', border: '1px solid rgba(6,182,212,0.35)' }}
            >
              {loading ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <TrendingUp className="w-3.5 h-3.5" />}
              Generuj
            </button>
            <button
              onClick={exportSprzedaz}
              disabled={visibleKontrahenci.length === 0}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all btn-hover-effect disabled:opacity-40"
              style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.35)' }}
            >
              <Printer className="w-3.5 h-3.5" /> Eksportuj PDF
            </button>
          </div>

          {/* Podsumowanie */}
          {data && (
            <div className="grid grid-cols-3 gap-3 shrink-0">
              {[
                { label: "Kontrahentów", value: visibleKontrahenci.length, mono: true },
                { label: "Dokumentów WZ", value: visibleDok, mono: true },
                { label: "Wartość sprzedaży", value: fmt(visibleSuma) + " PLN", mono: false },
              ].map(({ label, value, mono }) => (
                <div key={label} className="px-4 py-3 rounded-xl"
                     style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  <div className="text-xs uppercase font-bold mb-1" style={{ color: "var(--text-muted)" }}>{label}</div>
                  <div className={`text-xl font-bold ${mono ? "font-mono" : ""}`} style={{ color: "var(--text-primary)" }}>{value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Tabela */}
          <div className="mes-panel rounded overflow-hidden flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <Spinner.Page />
            ) : visibleKontrahenci.length === 0 ? (
              <div className="p-12 text-center" style={{ color: "var(--text-muted)" }}>
                Brak zatwierdzonych dokumentów WZ w wybranym okresie.
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--bg-surface)", borderBottom: "2px solid var(--border)" }}>
                    {["", "Kontrahent", "Dokumenty WZ", "Wartość netto (PLN)", "Udział %"].map((h, i) => (
                      <th key={i} style={{
                        padding: "8px 12px", textAlign: i >= 2 ? "right" : "left",
                        fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                        letterSpacing: "0.08em", color: "var(--text-muted)",
                        width: i === 0 ? 32 : undefined,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleKontrahenci.map(k => {
                    const klucz = k.id ?? "__brak__";
                    const isExp = expanded.has(klucz);
                    const udzial = visibleSuma > 0 ? (k.wartosc_total / visibleSuma) * 100 : 0;
                    return (
                      <React.Fragment key={klucz}>
                        <tr
                          onClick={() => toggleKontrahent(klucz)}
                          style={{ borderBottom: "1px solid var(--border-dim)", cursor: "pointer", transition: "background .1s" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                        >
                          <td style={{ padding: "8px 12px" }}>
                            {isExp ? <ChevronDown className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
                                   : <ChevronRight className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />}
                          </td>
                          <td style={{ padding: "8px 12px" }}>
                            <div className="font-semibold" style={{ color: "var(--text-primary)" }}>{k.nazwa}</div>
                            {k.id && <div className="font-mono text-xs mt-0.5" style={{ color: "var(--accent)" }}>{k.kod}</div>}
                          </td>
                          <td style={{ padding: "8px 12px", textAlign: "right" }}>
                            <span className="font-mono" style={{ color: "var(--text-secondary)" }}>{k.liczba_dokumentow}</span>
                          </td>
                          <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, fontFamily: "JetBrains Mono,monospace" }}>
                            <span style={{ color: "var(--ok)" }}>{fmt(k.wartosc_total)}</span>
                          </td>
                          <td style={{ padding: "8px 12px", textAlign: "right" }}>
                            <div className="flex items-center justify-end gap-2">
                              <div className="h-1.5 rounded-full" style={{ width: 60, background: "var(--border)" }}>
                                <div className="h-full rounded-full" style={{ width: `${udzial}%`, background: "var(--accent)" }} />
                              </div>
                              <span className="font-mono text-xs w-10 text-right" style={{ color: "var(--text-secondary)" }}>
                                {fmtL(udzial, 1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                        {isExp && k.dokumenty.map(dok => {
                          const isDokExp = expandedDok.has(dok.referencja);
                          return (
                            <React.Fragment key={dok.referencja}>
                              <tr
                                onClick={() => toggleDok(dok.referencja)}
                                style={{ background: "rgba(59,130,246,0.04)", borderBottom: "1px solid var(--border-dim)", cursor: "pointer" }}
                                onMouseEnter={e => (e.currentTarget.style.background = "rgba(59,130,246,0.08)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "rgba(59,130,246,0.04)")}
                              >
                                <td style={{ padding: "6px 12px 6px 32px" }}>
                                  {isDokExp ? <ChevronDown className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
                                            : <ChevronRight className="w-3 h-3" style={{ color: "var(--text-muted)" }} />}
                                </td>
                                <td style={{ padding: "6px 12px" }}>
                                  <div className="flex items-center gap-2">
                                    <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--accent)" }} />
                                    <span className="font-mono text-xs font-bold" style={{ color: "var(--accent)" }}>{dok.referencja}</span>
                                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>{fmtDate(dok.data)}</span>
                                  </div>
                                </td>
                                <td style={{ padding: "6px 12px", textAlign: "right" }}>
                                  <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>{dok.pozycje.length} poz.</span>
                                </td>
                                <td style={{ padding: "6px 12px", textAlign: "right" }}>
                                  <span className="font-mono text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>{fmt(dok.wartosc)}</span>
                                </td>
                                <td />
                              </tr>
                              {isDokExp && dok.pozycje.map((poz, pi) => (
                                <tr key={pi} style={{ background: "rgba(59,130,246,0.02)", borderBottom: "1px solid var(--border-dim)" }}>
                                  <td style={{ padding: "5px 12px 5px 52px" }} />
                                  <td style={{ padding: "5px 8px 5px 12px", fontSize: 12 }}>
                                    {poz.wyrob ? (
                                      <>
                                        <div style={{ color: "var(--text-muted)", fontSize: 11 }}>{poz.asortyment}</div>
                                        <div style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{poz.wyrob}</div>
                                        <div className="font-mono" style={{ color: "var(--text-muted)", fontSize: 11 }}>{poz.numer_partii}</div>
                                      </>
                                    ) : (
                                      <>
                                        <span className="font-mono" style={{ color: "var(--text-muted)", marginRight: 6 }}>{poz.kod_towaru}</span>
                                        <span style={{ color: "var(--text-secondary)" }}>{poz.asortyment}</span>
                                      </>
                                    )}
                                  </td>
                                  <td style={{ padding: "5px 12px", textAlign: "right", fontSize: 12 }}>
                                    <span className="font-mono" style={{ color: "var(--text-muted)" }}>
                                      {poz.ilosc.toLocaleString("pl-PL", { maximumFractionDigits: 3 })} {poz.jednostka}
                                    </span>
                                    {poz.ilosc_kg != null && (
                                      <div className="font-mono" style={{ color: "var(--text-muted)", fontSize: 11 }}>
                                        {fmtL(poz.ilosc_kg, 3)} kg
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ padding: "5px 12px", textAlign: "right", fontSize: 12 }}>
                                    <span className="font-mono" style={{ color: "var(--text-secondary)" }}>{fmt(poz.wartosc)}</span>
                                  </td>
                                  <td />
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid var(--border)", background: "var(--bg-surface)" }}>
                    <td />
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: "var(--text-primary)", fontSize: 13 }}>RAZEM</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontWeight: 700, color: "var(--text-primary)" }}>{visibleDok}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontWeight: 700 }}>
                      <span style={{ color: "var(--ok)" }}>{fmt(visibleSuma)}</span>
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── STANY MAGAZYNOWE — ILOŚCIOWY ── */}
      {activeReport === "stany_bez_cen" && (
        <>
          {stanyFilterBar(exportStanyBezCen)}
          <div className="mes-panel rounded overflow-hidden flex-1 min-h-0 overflow-y-auto">
            {stanyLoading ? <Spinner.Page /> : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--bg-surface)", borderBottom: "2px solid var(--border)" }}>
                    {["Kod", "Nazwa", "Typ", "J.M.", "Stan", "Zarezerwowane", "Dostępne"].map((h, i) => (
                      <th key={h} style={{
                        padding: "8px 12px", textAlign: i >= 4 ? "right" : "left",
                        fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                        letterSpacing: "0.08em", color: "var(--text-muted)",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredStany.map(a => (
                    <tr key={a.id}
                        style={{ borderBottom: "1px solid var(--border-dim)" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={{ padding: "7px 12px", fontFamily: "JetBrains Mono,monospace", fontSize: 12, color: "var(--text-code)" }}>{a.kod_towaru}</td>
                      <td style={{ padding: "7px 12px", fontWeight: 500, color: "var(--text-primary)" }}>{a.nazwa}</td>
                      <td style={{ padding: "7px 12px" }}>
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ color: typColors[a.typ_asortymentu] ?? "var(--text-muted)", background: `${typColors[a.typ_asortymentu] ?? "#888"}18` }}>
                          {typLabels[a.typ_asortymentu] ?? a.typ_asortymentu}
                        </span>
                      </td>
                      <td style={{ padding: "7px 12px", color: "var(--text-secondary)" }}>{a.jednostka_miary}</td>
                      <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontWeight: 600, color: "var(--text-primary)" }}>{fmtL(a.ilosc, 3)}</td>
                      <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", color: a.rezerwacje > 0 ? "#fbbf24" : "var(--text-muted)" }}>{fmtL(a.rezerwacje, 3)}</td>
                      <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontWeight: 600, color: (a.ilosc - a.rezerwacje) > 0 ? "#4ade80" : "var(--text-muted)" }}>{fmtL(a.ilosc - a.rezerwacje, 3)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid var(--border)", background: "var(--bg-surface)" }}>
                    <td colSpan={4} style={{ padding: "8px 12px", fontWeight: 700, color: "var(--text-muted)", fontSize: 12 }}>
                      RAZEM ({filteredStany.length} poz.)
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontWeight: 700, color: "var(--text-primary)" }}>—</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontWeight: 700, color: "#fbbf24" }}>
                      {fmtL(filteredStany.reduce((s, a) => s + a.rezerwacje, 0), 3)}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontWeight: 700, color: "#4ade80" }}>—</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── WYROBY GOTOWE — PODZIAŁ NA OPAKOWANIA ── */}
      {activeReport === "wyroby_opakowania" && (() => {
        const q = wyrobySearch.toLowerCase();
        const filtered = (wyrobyData ?? []).filter(r =>
          !q || r.nazwa.toLowerCase().includes(q) || r.kod_towaru.toLowerCase().includes(q)
        );

        // Grupuj per produkt
        type Grupa = {
          kod_towaru: string;
          nazwa: string;
          jednostka_miary: string;
          totalKg: number;
          totalSzt: number;
          rows: WyrobGotowyRow[];
        };
        const grupy: Record<string, Grupa> = {};
        for (const r of filtered) {
          if (!grupy[r.nazwa]) {
            grupy[r.nazwa] = { kod_towaru: r.kod_towaru, nazwa: r.nazwa, jednostka_miary: r.jednostka_miary, totalKg: 0, totalSzt: 0, rows: [] };
          }
          grupy[r.nazwa].totalKg += r.ilosc_kg;
          grupy[r.nazwa].totalSzt += r.ilosc_szt ?? 0;
          grupy[r.nazwa].rows.push(r);
        }
        const grupySorted = Object.values(grupy).sort((a, b) => a.nazwa.localeCompare(b.nazwa, 'pl'));
        const grandTotalKg = Math.round(grupySorted.reduce((s, g) => s + g.totalKg, 0) * 1000) / 1000;
        const grandTotalSzt = grupySorted.reduce((s, g) => s + g.totalSzt, 0);

        const exportWyroby = () => printReport({
          title: "Wyroby gotowe — podział na opakowania",
          sections: [{
            columns: [
              { label: "Kod" },
              { label: "Wyrób / Opakowanie" },
              { label: "Partia", align: "left" },
              { label: "Waga/szt." },
              { label: "Ilość szt.", align: "right" },
              { label: "Ilość kg", align: "right", bold: true },
              { label: "Termin", align: "left" },
            ],
            rows: grupySorted.flatMap((g, idx) => [
              ...(idx > 0 ? [["", "", "", "", "", "", ""]] : []),
              [g.kod_towaru, g.nazwa.toUpperCase(), "", "", fmtL(g.totalSzt, 0), fmtL(g.totalKg, 3), ""],
              ...g.rows.map(r => [
                "",
                `&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${g.nazwa} — ${r.opakowanie ?? "bez opakowania"}`,
                r.numer_partii || "—",
                r.waga_jednostkowa ? `${r.waga_jednostkowa.toFixed(3)} kg` : "—",
                r.ilosc_szt != null ? String(r.ilosc_szt) : "—",
                fmtL(r.ilosc_kg, 3),
                r.termin_waznosci ? fmtDate(r.termin_waznosci) : "—",
              ]),
            ]),
            totalRow: [`RAZEM (${grupySorted.length} prod.)`, null, null, null, grandTotalSzt > 0 ? fmtL(grandTotalSzt, 0) : "—", fmtL(grandTotalKg, 3), null],
          }],
        });

        return (
          <>
            {/* Pasek filtru */}
            <div
              className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl shrink-0"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
            >
              <input
                type="text"
                placeholder="Szukaj produktu…"
                value={wyrobySearch}
                onChange={e => setWyrobySearch(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-sm outline-none"
                style={{ background: "var(--bg-app)", border: "1px solid var(--border)", color: "var(--text-primary)", width: 200 }}
              />
              <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                {grupySorted.length} produktów · {grandTotalKg.toFixed(3)} kg łącznie
              </span>
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => { setWyrobyData(null); fetchWyroby(true); }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all btn-hover-effect"
                  style={{ background: 'rgba(6,182,212,0.15)', color: 'var(--accent)', border: '1px solid rgba(6,182,212,0.35)' }}
                >
                  <TrendingUp className="w-3.5 h-3.5" /> Odśwież
                </button>
                <button
                  onClick={exportWyroby}
                  disabled={grupySorted.length === 0}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all btn-hover-effect disabled:opacity-40"
                  style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.35)' }}
                >
                  <Printer className="w-3.5 h-3.5" /> Eksportuj PDF
                </button>
              </div>
            </div>

            <div className="mes-panel rounded overflow-hidden flex-1 min-h-0 overflow-y-auto">
              {wyrobyLoading ? <Spinner.Page /> : grupySorted.length === 0 ? (
                <div className="p-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Brak wyrobów gotowych w magazynie.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--bg-surface)", borderBottom: "2px solid var(--border)" }}>
                      {["Kod", "Wyrób gotowy / Opakowanie", "Partia", "Masa/szt.", "Ilość szt.", "Ilość kg", "Termin"].map((h, i) => (
                        <th key={h} style={{
                          padding: "8px 12px", textAlign: i === 3 || i === 4 || i === 5 ? "right" : "left",
                          fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                          letterSpacing: "0.08em", color: "var(--text-muted)",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grupySorted.map(g => (
                      <React.Fragment key={g.nazwa}>
                        {/* Pusty wiersz jako odstęp w UI (tylko od drugiego elementu) */}
                        <tr style={{ background: "transparent", height: 16 }}>
                          <td colSpan={7}></td>
                        </tr>
                        {/* Wiersz nagłówka produktu */}
                        <tr style={{ background: "rgba(6,182,212,0.08)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "10px 12px", fontFamily: "JetBrains Mono,monospace", fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>{g.kod_towaru}</td>
                          <td style={{ padding: "10px 12px", fontWeight: 800, fontSize: 14, color: "var(--text-primary)" }}>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#4ade8018', color: '#4ade80' }}>WG</span>
                              {g.nazwa.toUpperCase()}
                            </div>
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "left", color: "var(--text-muted)" }}></td>
                          <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-muted)" }}></td>
                          <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontWeight: 700, fontSize: 13, color: g.totalSzt > 0 ? "var(--text-primary)" : "var(--text-muted)" }}>
                            {g.totalSzt > 0 ? g.totalSzt : "—"}
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontWeight: 800, fontSize: 13, color: "#4ade80" }}>
                            {g.totalKg.toFixed(3)} kg
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "left", color: "var(--text-muted)" }}></td>
                        </tr>
                        {/* Wiersze opakowań */}
                        {g.rows.map((r, idx) => (
                          <tr key={`${r.id_partii}_${r.opakowanie ?? ''}_${idx}`}
                              style={{ borderBottom: "1px solid var(--border-dim)" }}
                              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                          >
                            <td style={{ padding: "5px 12px", fontFamily: "JetBrains Mono,monospace", fontSize: 10, color: "var(--text-muted)" }}></td>
                            <td style={{ padding: "5px 12px 5px 40px", color: "var(--text-secondary)" }}>
                              <div className="flex items-center gap-2">
                                <span style={{ color: "var(--text-muted)" }}>{g.nazwa} —</span>
                                {r.opakowanie ?? <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>bez opakowania</span>}
                              </div>
                            </td>
                            <td style={{ padding: "5px 12px", fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: "var(--text-primary)" }}>
                              {r.numer_partii || "—"}
                            </td>
                            <td style={{ padding: "5px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: "var(--text-muted)" }}>
                              {r.waga_jednostkowa ? `${r.waga_jednostkowa.toFixed(3)} kg` : "—"}
                            </td>
                            <td style={{ padding: "5px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", color: "var(--text-primary)" }}>
                              {r.ilosc_szt != null ? r.ilosc_szt : "—"}
                            </td>
                            <td style={{ padding: "5px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontWeight: 500, color: "var(--ok)" }}>
                              {r.ilosc_kg.toFixed(3)} kg
                            </td>
                            <td style={{ padding: "5px 12px", fontFamily: "JetBrains Mono,monospace", fontSize: 10, color: "var(--text-muted)" }}>
                              {r.termin_waznosci ? fmtDate(r.termin_waznosci) : "—"}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--border)", background: "var(--bg-surface)" }}>
                      <td colSpan={2} style={{ padding: "8px 12px", fontWeight: 700, color: "var(--text-muted)", fontSize: 12 }}>
                        RAZEM ({grupySorted.length} produktów)
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }} />
                      <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontWeight: 700, color: "var(--text-primary)" }}>
                        {grandTotalSzt > 0 ? grandTotalSzt : "—"}
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontWeight: 700, color: "#4ade80" }}>
                        {grandTotalKg.toFixed(3)} kg
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </>
        );
      })()}

      {/* ── STANY MAGAZYNOWE — CENY SPRZEDAŻY (NETTO) ── */}
      {activeReport === "stany_ceny_sprzedazy" && (
        <>
          {stanyFilterBar(exportStanyCenySprzedazy)}
          <div className="mes-panel rounded overflow-hidden flex-1 min-h-0 overflow-y-auto">
            {stanyLoading ? <Spinner.Page /> : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--bg-surface)", borderBottom: "2px solid var(--border)" }}>
                    {["Kod", "Nazwa", "Typ", "J.M.", "Dostępne", "Cena netto sprzedaży", "VAT", "Wartość netto (dostępne × cena)"].map((h, i) => (
                      <th key={h} style={{
                        padding: "8px 12px", textAlign: i >= 4 ? "right" : "left",
                        fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                        letterSpacing: "0.08em", color: "var(--text-muted)",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredStany.map(a => {
                    const dostepne = a.ilosc - a.rezerwacje;
                    const wartosc = a.cena_sprzedazy != null ? dostepne * a.cena_sprzedazy : null;
                    return (
                      <tr key={a.id}
                          style={{ borderBottom: "1px solid var(--border-dim)" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <td style={{ padding: "7px 12px", fontFamily: "JetBrains Mono,monospace", fontSize: 12, color: "var(--text-code)" }}>{a.kod_towaru}</td>
                        <td style={{ padding: "7px 12px", fontWeight: 500, color: "var(--text-primary)" }}>{a.nazwa}</td>
                        <td style={{ padding: "7px 12px" }}>
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ color: typColors[a.typ_asortymentu] ?? "var(--text-muted)", background: `${typColors[a.typ_asortymentu] ?? "#888"}18` }}>
                            {typLabels[a.typ_asortymentu] ?? a.typ_asortymentu}
                          </span>
                        </td>
                        <td style={{ padding: "7px 12px", color: "var(--text-secondary)" }}>{a.jednostka_miary}</td>
                        <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontWeight: 600, color: dostepne > 0 ? "#4ade80" : "var(--text-muted)" }}>{fmtL(dostepne, 3)}</td>
                        <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", color: a.cena_sprzedazy != null ? "var(--accent)" : "var(--text-muted)" }}>
                          {a.cena_sprzedazy != null ? `${fmt(a.cena_sprzedazy)} zł` : "—"}
                        </td>
                        <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontSize: 12, color: "var(--text-muted)" }}>
                          {a.stawka_vat != null ? `${a.stawka_vat}%` : "—"}
                        </td>
                        <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontWeight: 600, color: wartosc != null && wartosc > 0 ? "var(--ok)" : "var(--text-muted)" }}>
                          {wartosc != null ? `${fmt(wartosc)} zł` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid var(--border)", background: "var(--bg-surface)" }}>
                    <td colSpan={4} style={{ padding: "8px 12px", fontWeight: 700, color: "var(--text-muted)", fontSize: 12 }}>
                      RAZEM ({filteredStany.length} poz.)
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontWeight: 700, color: "#4ade80" }}>—</td>
                    <td colSpan={2} />
                    <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontWeight: 700, color: "var(--ok)" }}>
                      {fmt(filteredStany.reduce((s, a) => {
                        if (a.cena_sprzedazy == null) return s;
                        return s + (a.ilosc - a.rezerwacje) * a.cena_sprzedazy;
                      }, 0))} zł
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── KALKULATOR FS ── */}
      {activeReport === "kalkulator_fs" && (
        <>
          {/* Filtry */}
          <div
            className="flex flex-wrap items-center gap-4 px-4 py-3 rounded-xl shrink-0"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />
              <span className="text-xs font-bold uppercase" style={{ color: "var(--text-muted)" }}>Okres:</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs" style={{ color: "var(--text-muted)" }}>Od</label>
              <input
                type="date" value={fsOd} onChange={e => setFsOd(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-sm outline-none"
                style={{ background: "var(--bg-app)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs" style={{ color: "var(--text-muted)" }}>Do</label>
              <input
                type="date" value={fsDo} onChange={e => setFsDo(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-sm outline-none"
                style={{ background: "var(--bg-app)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              />
            </div>
            {fsRaportData && (
              <select
                value={fsKontrahent}
                onChange={e => setFsKontrahent(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-sm outline-none"
                style={{ background: "var(--bg-app)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              >
                <option value="__all__">Wszyscy kontrahenci</option>
                {fsRaportData.kontrahenci.map(k => (
                  <option key={k.id ?? "__brak__"} value={k.id ?? "__brak__"}>{k.nazwa}</option>
                ))}
              </select>
            )}
            <button
              onClick={fetchFsRaport} disabled={fsLoading}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all btn-hover-effect"
              style={{ background: 'rgba(6,182,212,0.15)', color: 'var(--accent)', border: '1px solid rgba(6,182,212,0.35)' }}
            >
              {fsLoading ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <TrendingUp className="w-3.5 h-3.5" />}
              Generuj
            </button>
            <div className="flex items-center gap-2 ml-auto">
              <label className="text-xs font-bold uppercase" style={{ color: "var(--text-muted)" }}>VAT</label>
              <select
                value={fsVatRate}
                onChange={e => setFsVatRate(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-sm outline-none font-mono"
                style={{ background: "var(--bg-app)", border: "1px solid var(--border)", color: "var(--text-primary)", width: 80 }}
              >
                <option value="0">0%</option>
                <option value="5">5%</option>
                <option value="8">8%</option>
                <option value="23">23%</option>
              </select>
            </div>
            <button
              onClick={exportKalkulatorFS}
              disabled={selectedWz.size === 0 || fsWartoscNetto === 0}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all btn-hover-effect disabled:opacity-40"
              style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.35)' }}
            >
              <Printer className="w-3.5 h-3.5" /> Eksportuj PDF
            </button>
          </div>

          {/* Treść */}
          <div className="flex gap-3 flex-1 min-h-0">
            {/* Lista WZ */}
            <div className="mes-panel rounded overflow-hidden flex-1 min-h-0 overflow-y-auto">
              {fsLoading ? (
                <Spinner.Page />
              ) : !fsRaportData ? (
                <div className="p-12 text-center" style={{ color: "var(--text-muted)" }}>
                  Wybierz okres i kliknij „Generuj".
                </div>
              ) : fsDokumenty.length === 0 ? (
                <div className="p-12 text-center" style={{ color: "var(--text-muted)" }}>
                  Brak zatwierdzonych dokumentów WZ w wybranym okresie.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--bg-surface)", borderBottom: "2px solid var(--border)" }}>
                      <th style={{ padding: "8px 12px", width: 36 }}>
                        <input
                          type="checkbox"
                          checked={selectedWz.size === fsDokumenty.length && fsDokumenty.length > 0}
                          onChange={toggleAllWz}
                          style={{ cursor: "pointer" }}
                        />
                      </th>
                      {["Dokument WZ", "Data", "Kontrahent", "Wartość netto"].map((h, i) => (
                        <th key={h} style={{
                          padding: "8px 12px", textAlign: i === 3 ? "right" : "left",
                          fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                          letterSpacing: "0.08em", color: "var(--text-muted)",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fsDokumenty.map(d => {
                      const sel = selectedWz.has(d.referencja);
                      return (
                        <tr
                          key={d.referencja}
                          onClick={() => toggleWz(d.referencja)}
                          style={{
                            borderBottom: "1px solid var(--border-dim)", cursor: "pointer",
                            background: sel ? "rgba(6,182,212,0.07)" : "transparent",
                            transition: "background .1s",
                          }}
                          onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "var(--bg-hover)"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = sel ? "rgba(6,182,212,0.07)" : "transparent"; }}
                        >
                          <td style={{ padding: "8px 12px" }}>
                            <input type="checkbox" checked={sel} onChange={() => {}} style={{ cursor: "pointer", pointerEvents: "none" }} />
                          </td>
                          <td style={{ padding: "8px 12px" }}>
                            <div className="flex items-center gap-2">
                              <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: sel ? "var(--accent)" : "var(--text-muted)" }} />
                              <span className="font-mono text-xs font-bold" style={{ color: sel ? "var(--accent)" : "var(--text-secondary)" }}>
                                {d.referencja}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: 12 }}>{fmtDate(d.data)}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-secondary)", fontSize: 12 }}>{d.kontrahent}</td>
                          <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontWeight: sel ? 700 : 400, color: sel ? "var(--ok)" : "var(--text-secondary)" }}>
                            {fmt(d.wartosc)} zł
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--border)", background: "var(--bg-surface)" }}>
                      <td />
                      <td colSpan={2} style={{ padding: "8px 12px", fontWeight: 700, color: "var(--text-muted)", fontSize: 12 }}>
                        Zaznaczono {selectedWz.size} z {fsDokumenty.length} dok.
                      </td>
                      <td />
                      <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontWeight: 700, color: "var(--ok)" }}>
                        {selectedWz.size > 0 ? `${fmt(fsWartoscNetto)} zł` : "—"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* Panel podsumowania */}
            <div
              className="rounded-xl shrink-0 flex flex-col gap-4"
              style={{ width: 290, background: "var(--bg-surface)", border: "1px solid var(--border)", padding: "16px", alignSelf: "flex-start", position: "sticky", top: 0 }}
            >
              <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                Pozycja FS
              </div>

              {selectedWz.size === 0 ? (
                <div className="text-sm py-4 text-center" style={{ color: "var(--text-muted)" }}>
                  Zaznacz dokumenty WZ z listy
                </div>
              ) : (
                <>
                  <div className="text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.2)", color: "var(--accent)" }}>
                    <span className="font-bold font-mono">{selectedWz.size}</span> dok. WZ
                    {fsAggregates.sumKg > 0 && <span className="ml-1">· <span className="font-bold font-mono">{fmtL(fsAggregates.sumKg, 3)} kg</span></span>}
                    {fsAggregates.sumSzt > 0 && <span className="ml-1">· <span className="font-bold font-mono">{fmtL(fsAggregates.sumSzt, 0)} szt.</span></span>}
                  </div>

                  <div className="flex flex-col gap-3">
                    {fsAggregates.sumKg > 0 && (
                      <div>
                        <div className="text-sm font-bold mb-1.5" style={{ color: "var(--text-primary)" }}>Lody gelato</div>
                        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <tbody>
                              {[
                                { label: "Ilość", value: `${fmtL(fsAggregates.sumKg, 3)} kg`, color: "var(--text-primary)", bold: true },
                                { label: "Śr. cena/kg", value: `${fsAggregates.sredniaCenaKg.toFixed(2)} zł`, color: "var(--text-secondary)", bold: false },
                                { label: "Wartość netto", value: `${fmt(fsAggregates.wartoscKg)} zł`, color: "var(--ok)", bold: true },
                              ].map(row => (
                                <tr key={row.label} style={{ borderBottom: "1px solid var(--border-dim)" }}>
                                  <td style={{ padding: "7px 10px", color: "var(--text-muted)" }}>{row.label}</td>
                                  <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontWeight: row.bold ? 700 : 400, color: row.color }}>
                                    {row.value}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {fsAggregates.sumSzt > 0 && (
                      <div>
                        <div className="text-sm font-bold mb-1.5" style={{ color: "var(--text-primary)" }}>Gelato w kubeczkach</div>
                        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <tbody>
                              {[
                                { label: "Ilość", value: `${fmtL(fsAggregates.sumSzt, 0)} szt.`, color: "var(--text-primary)", bold: true },
                                { label: "Śr. cena/szt", value: `${fsAggregates.sredniaCenaSzt.toFixed(2)} zł`, color: "var(--text-secondary)", bold: false },
                                { label: "Wartość netto", value: `${fmt(fsAggregates.wartoscSzt)} zł`, color: "var(--ok)", bold: true },
                              ].map(row => (
                                <tr key={row.label} style={{ borderBottom: "1px solid var(--border-dim)" }}>
                                  <td style={{ padding: "7px 10px", color: "var(--text-muted)" }}>{row.label}</td>
                                  <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontWeight: row.bold ? 700 : 400, color: row.color }}>
                                    {row.value}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg overflow-hidden mt-1" style={{ border: "1px solid var(--border)", background: "rgba(16,185,129,0.05)" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <tbody>
                        <tr style={{ borderBottom: "1px solid var(--border-dim)" }}>
                          <td style={{ padding: "7px 10px", color: "var(--text-muted)" }}>Łącznie netto</td>
                          <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontWeight: 700, color: "var(--ok)" }}>
                            {fmt(fsWartoscNetto)} zł
                          </td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid var(--border-dim)" }}>
                          <td style={{ padding: "7px 10px", color: "var(--text-muted)" }}>VAT {fsVatRate}%</td>
                          <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", color: "var(--warn)" }}>
                            {fmt(fsAggregates.kwotaVat)} zł
                          </td>
                        </tr>
                        <tr style={{ background: "rgba(16,185,129,0.1)" }}>
                          <td style={{ padding: "7px 10px", fontWeight: 700, color: "var(--text-primary)" }}>Wartość brutto</td>
                          <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontWeight: 900, color: "var(--ok)" }}>
                            {fmt(fsAggregates.wartoscBrutto)} zł
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="text-[10px] leading-4" style={{ color: "var(--text-muted)" }}>
                    Wartość netto = dokładna suma z WZ.<br />
                    Cena śr./kg tylko informacyjnie — wartość jest nadrzędna.
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── STANY MAGAZYNOWE — WARTOŚCI ZAKUPU (NETTO) ── */}
      {activeReport === "stany_wartosci" && (
        <>
          {stanyFilterBar(exportStanyWartosci)}
          <div className="mes-panel rounded overflow-hidden flex-1 min-h-0 overflow-y-auto">
            {stanyLoading ? <Spinner.Page /> : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--bg-surface)", borderBottom: "2px solid var(--border)" }}>
                    {["Kod", "Nazwa", "Typ", "J.M.", "Stan", "Cena śr. zakupu (netto)", "Wartość magazynowa (netto)"].map((h, i) => (
                      <th key={h} style={{
                        padding: "8px 12px", textAlign: i >= 4 ? "right" : "left",
                        fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                        letterSpacing: "0.08em", color: "var(--text-muted)",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredStany.map(a => {
                    const wartosc = a.ilosc * a.cena_srednia;
                    return (
                      <tr key={a.id}
                          style={{ borderBottom: "1px solid var(--border-dim)" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <td style={{ padding: "7px 12px", fontFamily: "JetBrains Mono,monospace", fontSize: 12, color: "var(--text-code)" }}>{a.kod_towaru}</td>
                        <td style={{ padding: "7px 12px", fontWeight: 500, color: "var(--text-primary)" }}>{a.nazwa}</td>
                        <td style={{ padding: "7px 12px" }}>
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ color: typColors[a.typ_asortymentu] ?? "var(--text-muted)", background: `${typColors[a.typ_asortymentu] ?? "#888"}18` }}>
                            {typLabels[a.typ_asortymentu] ?? a.typ_asortymentu}
                          </span>
                        </td>
                        <td style={{ padding: "7px 12px", color: "var(--text-secondary)" }}>{a.jednostka_miary}</td>
                        <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontWeight: 600, color: a.ilosc > 0 ? "var(--text-primary)" : "var(--text-muted)" }}>{fmtL(a.ilosc, 3)}</td>
                        <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", color: a.cena_srednia > 0 ? "var(--text-secondary)" : "var(--text-muted)" }}>
                          {a.cena_srednia > 0 ? `${fmt(a.cena_srednia)} zł` : "—"}
                        </td>
                        <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontWeight: 600, color: wartosc > 0 ? "var(--ok)" : "var(--text-muted)" }}>
                          {wartosc > 0 ? `${fmt(wartosc)} zł` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid var(--border)", background: "var(--bg-surface)" }}>
                    <td colSpan={4} style={{ padding: "8px 12px", fontWeight: 700, color: "var(--text-muted)", fontSize: 12 }}>
                      RAZEM ({filteredStany.length} poz.)
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontWeight: 700, color: "var(--text-primary)" }}>—</td>
                    <td />
                    <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "JetBrains Mono,monospace", fontWeight: 700, color: "var(--ok)" }}>
                      {fmt(filteredStany.reduce((s, a) => s + a.ilosc * a.cena_srednia, 0))} zł
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
