/**
 * PlanProdukcji — planer turnusu produkcyjnego.
 *
 * Zastępuje arkusz, w którym planista rozpisywał dzień produkcji: smaki w
 * kolejności barwnej, rozbicie na wsady i docelowe opakowania. Plan powstaje
 * dzień wcześniej, drukuje się go na halę, a po produkcji wraca tu jako
 * rozliczenie (wagi końcowe przepisane z kartki).
 *
 * Plan to sesja produkcyjna w statusie "Planowana" — bez ruchów magazynowych.
 * Dopiero rozliczenie dokłada RW, PW i partie.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Plus, Trash2, GripVertical, Printer, Save, ArrowRight, ArrowLeft,
  CalendarDays, ListOrdered, FileText, PlayCircle,
} from "lucide-react";
import { useToast } from "../components/Toast";
import { Spinner } from "../components/Spinner";
import { EmptyState } from "../components/EmptyState";
import ConfirmModal from "../components/ConfirmModal";
import KolejnoscProdukcjiModal from "../components/KolejnoscProdukcjiModal";
import { fmtL, fmtDate, clampDecimals, pluralPL } from "../utils/fmt";
import { drukujKarteProdukcji } from "../utils/printKartaProdukcji";

// ── Typy ─────────────────────────────────────────────────────────────────────

type Asortyment = {
  id: string; nazwa: string; kod_towaru: string; typ_asortymentu: string;
  jednostka_miary: string; kolejnosc_produkcji: number | null; czy_aktywne: boolean;
  grupa?: { kod: string } | null;
};

type Skladnik = {
  id_asortymentu_skladnika: string;
  ilosc_wymagana: number;
  procent_strat: number;
  asortyment_skladnika: Asortyment;
};

type Receptura = {
  id: string; numer_wersji: number; wielkosc_produkcji: number;
  warianty_json: string | null; czy_aktywne: boolean;
  asortyment_docelowy: Asortyment;
  skladniki: Skladnik[];
};

/** Wariant wsadu zapisany przy recepturze — np. ×4 → kuweta, ×10 → 2 pozzetti. */
type Wariant = { mnoznik: number; id_opakowania: string | null; liczba: number };

/** Pojedyncze mrożenie: mnożnik receptury i opakowanie, do którego trafia. */
type Wsad = { _uid: string; mnoznik: string; id_opakowania: string; liczba: string };

type Pozycja = {
  _uid: string;
  /** id zlecenia w bazie — brak oznacza pozycję jeszcze niezapisaną */
  id?: string;
  id_receptury: string;
  wsady: Wsad[];
};

type Zlecenie = {
  id: string; numer_zlecenia: string | null; etap: number | null;
  kolejnosc: number | null; wsady_json: string | null;
  planowana_ilosc_wyrobu: number; id_receptury: string; status: string;
  receptura: Receptura;
};

type Plan = {
  id: string; numer_sesji: string; typ: string; status: string;
  notatki: string | null; planowana_baza_kg: number | null;
  data_produkcji: string | null; zlecenia: Zlecenie[];
};

const TYPY: Array<{ v: string; label: string }> = [
  { v: "lody", label: "Lody mleczne" },
  { v: "sorbety", label: "Sorbety" },
  { v: "kubeczki", label: "Kubeczki" },
];

const uid = () => Math.random().toString(36).slice(2, 10);

/** Sorbety nie mają etapu 1 — powstają wprost z surowców, bez bazy mlecznej. */
const wymagaBazy = (typ: string) => typ !== "sorbety";

export default function PlanProdukcji() {
  const { showToast } = useToast();

  const [plany, setPlany] = useState<Plan[]>([]);
  const [receptury, setReceptury] = useState<Receptura[]>([]);
  const [opakowania, setOpakowania] = useState<Asortyment[]>([]);
  const [loading, setLoading] = useState(true);

  // null = lista planów; obiekt = otwarty edytor
  const [edytowany, setEdytowany] = useState<Plan | null>(null);
  const [nowy, setNowy] = useState(false);

  // ── Stan edytora ───────────────────────────────────────────────────────────
  const [typ, setTyp] = useState("lody");
  const [dataProdukcji, setDataProdukcji] = useState("");
  const [notatki, setNotatki] = useState("");
  const [idRecepturyBazy, setIdRecepturyBazy] = useState("");
  const [bazaKg, setBazaKg] = useState("");
  const [pozycje, setPozycje] = useState<Pozycja[]>([]);
  const [szukajSmaku, setSzukajSmaku] = useState("");
  const [zapisywanie, setZapisywanie] = useState(false);

  const [kolejnoscOpen, setKolejnoscOpen] = useState(false);
  const [doUsuniecia, setDoUsuniecia] = useState<Plan | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // ── Stan rozliczenia — wagi końcowe przepisywane z kartki ──────────────────
  /** Pojedyncze fizyczne opakowanie z wagą po zważeniu. */
  type OpakRozliczenie = { _uid: string; id_asortymentu: string; waga: string };
  type PozycjaRozliczenia = { pominieta: boolean; opakowania: OpakRozliczenie[] };

  const [tryb, setTryb] = useState<"plan" | "rozliczenie">("plan");
  const [rozliczenie, setRozliczenie] = useState<Record<string, PozycjaRozliczenia>>({});
  const [bazaRzeczywista, setBazaRzeczywista] = useState("");
  const [potwierdzRozliczenie, setPotwierdzRozliczenie] = useState(false);

  // ── Ładowanie danych ───────────────────────────────────────────────────────
  const pobierz = async () => {
    setLoading(true);
    try {
      const [p, r, a] = await Promise.all([
        fetch("/api/produkcja/plany").then((x) => x.json()),
        fetch("/api/receptury").then((x) => x.json()),
        fetch("/api/asortyment").then((x) => x.json()),
      ]);
      setPlany(Array.isArray(p) ? p : []);
      setReceptury(Array.isArray(r) ? r.filter((x: Receptura) => x.czy_aktywne) : []);
      setOpakowania(
        Array.isArray(a) ? a.filter((x: Asortyment) => x.typ_asortymentu === "Opakowanie" && x.czy_aktywne) : []
      );
    } catch {
      showToast("Nie udało się pobrać danych planera", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { pobierz(); }, []);

  // ── Pomocnicze ─────────────────────────────────────────────────────────────

  const recepturaById = (id: string) => receptury.find((r) => r.id === id);

  /** Receptury bazy (półprodukt) — wybierane w etapie 1. */
  const recepturyBazy = useMemo(
    () => receptury.filter((r) => r.asortyment_docelowy.typ_asortymentu === "Polprodukt"),
    [receptury]
  );

  /** Id asortymentu bazy — po nim rozpoznajemy składnik "baza" w recepturach smaków. */
  const idAsortymentuBazy = recepturaById(idRecepturyBazy)?.asortyment_docelowy.id;

  const wariantyReceptury = (r: Receptura | undefined): Wariant[] => {
    if (!r?.warianty_json) return [];
    try {
      const parsed = JSON.parse(r.warianty_json);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  };

  const nazwaOpakowania = (id: string | null) =>
    opakowania.find((o) => o.id === id)?.nazwa ?? "";

  /** Planowana ilość wyrobu: suma mnożników × wydajność receptury (kg z mnożnika 1). */
  const kgPozycji = (p: Pozycja) => {
    const rec = recepturaById(p.id_receptury);
    const suma = p.wsady.reduce((s, w) => s + (parseFloat(w.mnoznik.replace(",", ".")) || 0), 0);
    return Math.round(suma * (rec?.wielkosc_produkcji ?? 1) * 1000) / 1000;
  };

  /**
   * Zapotrzebowanie na bazę liczone z BOM-u, a nie z mnożnika — receptura na
   * 1 kg wyrobu miewa 0,8 kg bazy, więc te wartości nie są tożsame.
   */
  const bazaPozycji = (p: Pozycja) => {
    const rec = recepturaById(p.id_receptury);
    if (!rec || !idAsortymentuBazy) return 0;
    const skl = rec.skladniki.find((s) => s.id_asortymentu_skladnika === idAsortymentuBazy);
    if (!skl) return 0;
    return Math.round(skl.ilosc_wymagana * kgPozycji(p) * (1 + (skl.procent_strat || 0) / 100) * 1000) / 1000;
  };

  const sumaKg = useMemo(() => pozycje.reduce((s, p) => s + kgPozycji(p), 0), [pozycje, receptury]);
  const sumaBazy = useMemo(
    () => Math.round(pozycje.reduce((s, p) => s + bazaPozycji(p), 0) * 1000) / 1000,
    [pozycje, receptury, idAsortymentuBazy]
  );

  /** Maksymalny wsad frezera — powyżej tego mieszanka nie zmieści się na raz. */
  const MAX_WSAD_KG = 10;

  const bazaKgNum = parseFloat(bazaKg.replace(",", ".")) || 0;
  /** Smaki żądają więcej bazy, niż zaplanowano jej zrobić w etapie 1. */
  const bazaPrzekroczona = wymagaBazy(typ) && bazaKgNum > 0 && sumaBazy > bazaKgNum + 0.001;

  // ── Otwieranie edytora ─────────────────────────────────────────────────────

  function otworzNowy() {
    setEdytowany(null);
    setNowy(true);
    setTyp("lody");
    setDataProdukcji(new Date().toISOString().slice(0, 10));
    setNotatki("");
    setIdRecepturyBazy(recepturyBazy[0]?.id ?? "");
    setBazaKg("");
    setPozycje([]);
    setSzukajSmaku("");
  }

  function otworzPlan(plan: Plan) {
    setNowy(false);
    setEdytowany(plan);
    setTyp(plan.typ);
    setDataProdukcji(plan.data_produkcji ? plan.data_produkcji.slice(0, 10) : "");
    setNotatki(plan.notatki ?? "");
    setBazaKg(plan.planowana_baza_kg != null ? String(plan.planowana_baza_kg) : "");

    const zlBazy = plan.zlecenia.find((z) => z.etap === 1);
    setIdRecepturyBazy(zlBazy?.id_receptury ?? recepturyBazy[0]?.id ?? "");

    const etap2 = plan.zlecenia
      .filter((z) => z.etap === 2)
      .sort((a, b) => (a.kolejnosc ?? 0) - (b.kolejnosc ?? 0));

    setPozycje(
      etap2.map((z) => {
        let wsady: Wsad[] = [];
        try {
          const parsed = z.wsady_json ? JSON.parse(z.wsady_json) : [];
          wsady = (Array.isArray(parsed) ? parsed : []).map((w: any) => ({
            _uid: uid(),
            mnoznik: String(w.mnoznik ?? ""),
            id_opakowania: w.id_opakowania ?? "",
            liczba: String(w.liczba ?? 1),
          }));
        } catch { wsady = []; }
        return { _uid: uid(), id: z.id, id_receptury: z.id_receptury, wsady };
      })
    );
    setSzukajSmaku("");
  }

  function zamknijEdytor() {
    setEdytowany(null);
    setNowy(false);
  }

  // ── Operacje na pozycjach ──────────────────────────────────────────────────

  /** Nowy smak trafia na miejsce wynikające z kolejności barwnej. */
  function dodajSmak(idReceptury: string) {
    const rec = recepturaById(idReceptury);
    if (!rec) return;
    if (pozycje.some((p) => p.id_receptury === idReceptury)) {
      showToast("Ten smak jest już na planie", "warn");
      return;
    }

    const warianty = wariantyReceptury(rec);
    const pierwszy = warianty[0];
    const nowa: Pozycja = {
      _uid: uid(),
      id_receptury: idReceptury,
      wsady: pierwszy
        ? [{ _uid: uid(), mnoznik: String(pierwszy.mnoznik), id_opakowania: pierwszy.id_opakowania ?? "", liczba: String(pierwszy.liczba || 1) }]
        : [{ _uid: uid(), mnoznik: "", id_opakowania: "", liczba: "1" }],
    };

    const kNowej = rec.asortyment_docelowy.kolejnosc_produkcji;
    setPozycje((prev) => {
      if (kNowej == null) return [...prev, nowa];
      const idx = prev.findIndex((p) => {
        const k = recepturaById(p.id_receptury)?.asortyment_docelowy.kolejnosc_produkcji;
        return k != null && k > kNowej;
      });
      if (idx === -1) return [...prev, nowa];
      const kopia = [...prev];
      kopia.splice(idx, 0, nowa);
      return kopia;
    });
    setSzukajSmaku("");
  }

  const usunPozycje = (uidPoz: string) =>
    setPozycje((prev) => prev.filter((p) => p._uid !== uidPoz));

  const dodajWsad = (uidPoz: string, w?: Wariant) =>
    setPozycje((prev) => prev.map((p) => p._uid !== uidPoz ? p : {
      ...p,
      wsady: [...p.wsady, {
        _uid: uid(),
        mnoznik: w ? String(w.mnoznik) : "",
        id_opakowania: w?.id_opakowania ?? "",
        liczba: String(w?.liczba || 1),
      }],
    }));

  const zmienWsad = (uidPoz: string, uidWsadu: string, pola: Partial<Wsad>) =>
    setPozycje((prev) => prev.map((p) => p._uid !== uidPoz ? p : {
      ...p,
      wsady: p.wsady.map((w) => (w._uid === uidWsadu ? { ...w, ...pola } : w)),
    }));

  const usunWsad = (uidPoz: string, uidWsadu: string) =>
    setPozycje((prev) => prev.map((p) => p._uid !== uidPoz ? p : {
      ...p,
      wsady: p.wsady.filter((w) => w._uid !== uidWsadu),
    }));

  function przeniesPozycje(z: number, na: number) {
    if (z === na) return;
    setPozycje((prev) => {
      const kopia = [...prev];
      const [el] = kopia.splice(z, 1);
      kopia.splice(na, 0, el);
      return kopia;
    });
  }

  // ── Zapis ──────────────────────────────────────────────────────────────────

  function zbudujPayload() {
    return {
      data_produkcji: dataProdukcji || null,
      typ,
      notatki: notatki.trim() || null,
      planowana_baza_kg: wymagaBazy(typ) ? (bazaKgNum || sumaBazy) : null,
      id_receptury_bazy: wymagaBazy(typ) ? idRecepturyBazy || null : null,
      pozycje: pozycje.map((p, i) => ({
        id: p.id,
        id_receptury: p.id_receptury,
        kolejnosc: i * 10,
        wsady: p.wsady
          .map((w) => ({
            mnoznik: parseFloat(w.mnoznik.replace(",", ".")) || 0,
            id_opakowania: w.id_opakowania || null,
            liczba: parseInt(w.liczba, 10) || 1,
          }))
          .filter((w) => w.mnoznik > 0),
      })),
    };
  }

  async function zapisz() {
    if (pozycje.length === 0) { showToast("Dodaj co najmniej jeden smak", "warn"); return; }
    if (wymagaBazy(typ) && !idRecepturyBazy) { showToast("Wybierz recepturę bazy", "warn"); return; }
    if (bazaPrzekroczona) {
      showToast(`Zaplanowana baza (${fmtL(bazaKgNum, 1)} kg) nie wystarczy na wybrane smaki — potrzeba ${fmtL(sumaBazy, 1)} kg. Zwiększ bazę albo usuń smak.`, "error");
      return;
    }

    setZapisywanie(true);
    try {
      const istniejacy = edytowany?.id;
      const res = await fetch(
        istniejacy ? `/api/produkcja/plany/${istniejacy}` : "/api/produkcja/plany",
        {
          method: istniejacy ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(zbudujPayload()),
        }
      );
      const dane = await res.json();
      if (!res.ok) throw new Error(dane.error);

      showToast(istniejacy ? "Plan zapisany" : `Utworzono plan ${dane.numer_sesji}`, "ok");
      await pobierz();
      otworzPlan(dane);
    } catch (e: any) {
      showToast(e.message || "Błąd zapisu planu", "error");
    } finally {
      setZapisywanie(false);
    }
  }

  async function usunPlan(plan: Plan) {
    try {
      const res = await fetch(`/api/produkcja/plany/${plan.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast(`Usunięto plan ${plan.numer_sesji}`, "ok");
      if (edytowany?.id === plan.id) zamknijEdytor();
      pobierz();
    } catch (e: any) {
      showToast(e.message || "Błąd usuwania planu", "error");
    } finally {
      setDoUsuniecia(null);
    }
  }

  // ── Rozliczenie ────────────────────────────────────────────────────────────

  /** Rozwija wsady na pojedyncze opakowania — każde dostanie własną wagę. */
  function wejdzWRozliczenie() {
    if (bazaPrzekroczona) {
      showToast(`Zaplanowana baza (${fmtL(bazaKgNum, 1)} kg) nie wystarczy na wybrane smaki — potrzeba ${fmtL(sumaBazy, 1)} kg. Zwiększ bazę albo usuń smak.`, "error");
      return;
    }
    const stan: Record<string, PozycjaRozliczenia> = {};
    for (const p of pozycje) {
      const opakowania: OpakRozliczenie[] = [];
      for (const w of p.wsady) {
        const ile = Math.max(1, parseInt(w.liczba, 10) || 1);
        for (let i = 0; i < ile; i++) {
          opakowania.push({ _uid: uid(), id_asortymentu: w.id_opakowania, waga: "" });
        }
      }
      stan[p._uid] = { pominieta: false, opakowania };
    }
    setRozliczenie(stan);
    setBazaRzeczywista(bazaKg);
    setTryb("rozliczenie");
  }

  const sumaWag = (uidPoz: string) =>
    Math.round(
      (rozliczenie[uidPoz]?.opakowania ?? []).reduce(
        (s, o) => s + (parseFloat(o.waga.replace(",", ".")) || 0), 0
      ) * 1000
    ) / 1000;

  const zmienWage = (uidPoz: string, uidOpak: string, pola: Partial<OpakRozliczenie>) =>
    setRozliczenie((prev) => ({
      ...prev,
      [uidPoz]: {
        ...prev[uidPoz],
        opakowania: prev[uidPoz].opakowania.map((o) => (o._uid === uidOpak ? { ...o, ...pola } : o)),
      },
    }));

  const dodajOpakowanie = (uidPoz: string, idAsortymentu: string) =>
    setRozliczenie((prev) => ({
      ...prev,
      [uidPoz]: {
        ...prev[uidPoz],
        opakowania: [...prev[uidPoz].opakowania, { _uid: uid(), id_asortymentu: idAsortymentu, waga: "" }],
      },
    }));

  const usunOpakowanie = (uidPoz: string, uidOpak: string) =>
    setRozliczenie((prev) => ({
      ...prev,
      [uidPoz]: { ...prev[uidPoz], opakowania: prev[uidPoz].opakowania.filter((o) => o._uid !== uidOpak) },
    }));

  const przelaczPominiecie = (uidPoz: string) =>
    setRozliczenie((prev) => ({
      ...prev,
      [uidPoz]: { ...prev[uidPoz], pominieta: !prev[uidPoz].pominieta },
    }));

  async function rozlicz() {
    if (!edytowany) return;
    setZapisywanie(true);
    try {
      // Pozycje oznaczone jako niewykonane pomijamy — backend zamknie ich zlecenia jako anulowane
      const wyroby = pozycje
        .filter((p) => !rozliczenie[p._uid]?.pominieta)
        .map((p) => {
          const zlecenie = edytowany.zlecenia.find((z) => z.etap === 2 && z.id === p.id);
          const waga = sumaWag(p._uid);
          return {
            id_zlecenia: p.id,
            id_receptury: p.id_receptury,
            ilosc: kgPozycji(p),
            // Bez wpisanych wag przyjmujemy plan — pozwala domknąć turnus mimo braku ważenia
            rzeczywista_ilosc: waga > 0 ? waga : kgPozycji(p),
            opakowania: (rozliczenie[p._uid]?.opakowania ?? [])
              .filter((o) => (parseFloat(o.waga.replace(",", ".")) || 0) > 0)
              .map((o) => ({
                id_asortymentu: o.id_asortymentu || null,
                nazwa: nazwaOpakowania(o.id_asortymentu) || "—",
                waga_kg: parseFloat(o.waga.replace(",", ".")) || 0,
              })),
            _numer: zlecenie?.numer_zlecenia,
          };
        });

      if (wyroby.length === 0) throw new Error("Wszystkie pozycje oznaczono jako niewykonane");

      const zlecenieBazy = edytowany.zlecenia.find((z) => z.etap === 1);
      const res = await fetch(`/api/produkcja/plany/${edytowany.id}/rozlicz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auto_fifo: true,
          typ,
          data_produkcji: dataProdukcji || null,
          id_receptury_bazy: wymagaBazy(typ) ? idRecepturyBazy : null,
          id_zlecenia_bazy: zlecenieBazy?.id ?? null,
          ilosc_bazy: wymagaBazy(typ) ? parseFloat(bazaKg.replace(",", ".")) || 0 : 0,
          rzeczywista_ilosc_bazy: wymagaBazy(typ) ? parseFloat(bazaRzeczywista.replace(",", ".")) || null : null,
          wyroby,
        }),
      });
      const dane = await res.json();
      if (!res.ok) throw new Error(dane.error);

      showToast(`Turnus ${edytowany.numer_sesji} rozliczony`, "ok");
      setTryb("plan");
      await pobierz();
      zamknijEdytor();
    } catch (e: any) {
      showToast(e.message || "Błąd rozliczenia turnusu", "error");
    } finally {
      setZapisywanie(false);
      setPotwierdzRozliczenie(false);
    }
  }

  function drukuj() {
    drukujKarteProdukcji({
      numer_sesji: edytowany?.numer_sesji ?? "(niezapisany)",
      data_produkcji: dataProdukcji,
      typ,
      notatki,
      baza_kg: wymagaBazy(typ) ? parseFloat(bazaKg.replace(",", ".")) || 0 : null,
      nazwa_bazy: recepturaById(idRecepturyBazy)?.asortyment_docelowy.nazwa ?? null,
      pozycje: pozycje.map((p) => ({
        nazwa: recepturaById(p.id_receptury)?.asortyment_docelowy.nazwa ?? "—",
        kg: kgPozycji(p),
        wsady: p.wsady
          .filter((w) => (parseFloat(w.mnoznik.replace(",", ".")) || 0) > 0)
          .map((w) => ({
            mnoznik: parseFloat(w.mnoznik.replace(",", ".")) || 0,
            opakowanie: nazwaOpakowania(w.id_opakowania) || "—",
            liczba: parseInt(w.liczba, 10) || 1,
          })),
      })),
    });
  }

  // ── Widok: lista planów ────────────────────────────────────────────────────

  if (!edytowany && !nowy) {
    const planowane = plany.filter((p) => p.status === "Planowana");
    const zrealizowane = plany.filter((p) => p.status !== "Planowana").slice(0, 15);

    return (
      <div className="h-full flex flex-col animate-view">
        <div className="flex items-center justify-between gap-4 p-6 pb-4 shrink-0">
          <div>
            <h1 className="text-xl font-bold">Planer produkcji</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Plan turnusu — smaki w kolejności barwnej, wsady i opakowania
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setKolejnoscOpen(true)} className="btn btn-ghost" data-testid="btn-kolejnosc">
              <ListOrdered className="w-4 h-4" /> Kolejność barwna
            </button>
            <button onClick={otworzNowy} className="btn btn-primary" data-testid="btn-nowy-plan">
              <Plus className="w-4 h-4" /> Nowy plan
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 space-y-6">
        {loading ? (
          <div className="py-16 flex justify-center"><Spinner /></div>
        ) : (
          <>
            <section className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Zaplanowane ({planowane.length})
              </h2>
              {planowane.length === 0 ? (
                <EmptyState
                  icon={CalendarDays}
                  message="Brak zaplanowanych turnusów"
                  hint="Utwórz plan, wydrukuj kartę na halę, a po produkcji wróć tu, żeby wpisać wagi końcowe."
                />
              ) : (
                <div className="space-y-2">
                  {planowane.map((p) => (
                    <div key={p.id} onClick={() => otworzPlan(p)} role="button" tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter") otworzPlan(p); }}
                      className="w-full text-left rounded px-4 py-3 flex items-center gap-4 transition-colors cursor-pointer"
                      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                      <span className="badge badge-info shrink-0">Planowana</span>
                      <span className="font-mono font-bold text-sm shrink-0">{p.numer_sesji}</span>
                      <span className="text-sm shrink-0" style={{ color: 'var(--text-secondary)' }}>
                        {fmtDate(p.data_produkcji)}
                      </span>
                      <span className="text-sm shrink-0" style={{ color: 'var(--text-muted)' }}>
                        {TYPY.find((t) => t.v === p.typ)?.label ?? p.typ}
                      </span>
                      <span className="text-sm flex-1 truncate" style={{ color: 'var(--text-muted)' }}>
                        {p.zlecenia.filter((z) => z.etap === 2).length} {pluralPL(p.zlecenia.filter((z) => z.etap === 2).length, "smak", "smaki", "smaków")}
                      </span>
                      <button onClick={(e) => { e.stopPropagation(); setDoUsuniecia(p); }}
                        className="btn btn-ghost btn-sm shrink-0" title="Usuń plan">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <ArrowRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                    </div>
                  ))}
                </div>
              )}
            </section>

            {zrealizowane.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                  Rozliczone
                </h2>
                <div className="space-y-1">
                  {zrealizowane.map((p) => (
                    <div key={p.id} className="rounded px-4 py-2 flex items-center gap-4 text-sm"
                      style={{ background: 'var(--bg-app)', border: '1px solid var(--border)' }}>
                      <span className="badge badge-ok shrink-0">Rozliczona</span>
                      <span className="font-mono shrink-0">{p.numer_sesji}</span>
                      <span className="shrink-0" style={{ color: 'var(--text-muted)' }}>{fmtDate(p.data_produkcji)}</span>
                      <span className="flex-1 truncate" style={{ color: 'var(--text-muted)' }}>
                        {p.zlecenia.filter((z) => z.etap === 2).length} {pluralPL(p.zlecenia.filter((z) => z.etap === 2).length, "smak", "smaki", "smaków")}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
        </div>

        <KolejnoscProdukcjiModal
          isOpen={kolejnoscOpen}
          onClose={() => setKolejnoscOpen(false)}
          onZapisano={pobierz}
        />
      </div>
    );
  }

  // ── Widok: edytor planu ────────────────────────────────────────────────────

  const rozliczony = edytowany != null && edytowany.status !== "Planowana";

  // Grupy towarowe rozróżniają linie produktowe — te same reguły co w wizardzie sesji gelato
  const pasujeDoTypu = (r: Receptura) => {
    const kodGrupy = r.asortyment_docelowy.grupa?.kod ?? null;
    if (typ === "sorbety") return kodGrupy === "GEL-SOR";
    if (typ === "kubeczki") return kodGrupy !== "GEL-SOR";
    if (typ === "lody") return kodGrupy !== "GEL-SOR" && kodGrupy !== "GEL-KUB";
    return true;
  };

  const dostepneSmaki = receptury
    .filter((r) => r.asortyment_docelowy.typ_asortymentu === "Wyrob_Gotowy")
    .filter(pasujeDoTypu)
    .filter((r) => !pozycje.some((p) => p.id_receptury === r.id))
    .filter((r) => {
      const q = szukajSmaku.trim().toLowerCase();
      return !q || r.asortyment_docelowy.nazwa.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const ka = a.asortyment_docelowy.kolejnosc_produkcji;
      const kb = b.asortyment_docelowy.kolejnosc_produkcji;
      if (ka == null && kb == null) return a.asortyment_docelowy.nazwa.localeCompare(b.asortyment_docelowy.nazwa, "pl");
      if (ka == null) return 1;
      if (kb == null) return -1;
      return ka - kb;
    });

  return (
    <div className="h-full flex flex-col animate-view">
      <div className="p-6 pb-4 shrink-0">
      {/* Nagłówek */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={zamknijEdytor} className="btn btn-ghost">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-3">
              {edytowany?.numer_sesji ?? "Nowy plan turnusu"}
              {edytowany && (
                <span className={`badge ${rozliczony ? "badge-ok" : tryb === "rozliczenie" ? "badge-warn" : "badge-info"}`}>
                  {rozliczony ? "Rozliczona" : tryb === "rozliczenie" ? "Rozliczanie" : "Planowana"}
                </span>
              )}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {pozycje.length} {pluralPL(pozycje.length, "smak", "smaki", "smaków")} · {fmtL(sumaKg, 1)} kg wyrobu
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={drukuj} disabled={pozycje.length === 0} className="btn btn-ghost" data-testid="btn-drukuj-karte">
            <Printer className="w-4 h-4" /> Drukuj kartę
          </button>
          {!rozliczony && tryb === "plan" && (
            <button onClick={zapisz} disabled={zapisywanie || bazaPrzekroczona} className="btn btn-ghost" data-testid="btn-zapisz-plan"
              title={bazaPrzekroczona ? "Zaplanowana baza nie wystarczy na wybrane smaki" : undefined}>
              <Save className="w-4 h-4" /> {zapisywanie ? "Zapisywanie…" : "Zapisz plan"}
            </button>
          )}
          {!rozliczony && tryb === "plan" && edytowany && (
            <button onClick={wejdzWRozliczenie} disabled={bazaPrzekroczona} className="btn btn-primary" data-testid="btn-rozlicz-turnus"
              title={bazaPrzekroczona ? "Zaplanowana baza nie wystarczy na wybrane smaki" : undefined}>
              <PlayCircle className="w-4 h-4" /> Rozlicz turnus
            </button>
          )}
          {!rozliczony && tryb === "rozliczenie" && (
            <>
              <button onClick={() => setTryb("plan")} className="btn btn-ghost">
                <ArrowLeft className="w-4 h-4" /> Wróć do planu
              </button>
              <button onClick={() => setPotwierdzRozliczenie(true)} disabled={zapisywanie} className="btn btn-primary">
                <PlayCircle className="w-4 h-4" /> {zapisywanie ? "Rozliczanie…" : "Zamknij turnus"}
              </button>
            </>
          )}
        </div>
      </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 space-y-5">
      {/* Parametry turnusu */}
      <div className="rounded p-4 grid grid-cols-1 md:grid-cols-4 gap-4"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--text-muted)' }}>
            Data produkcji
          </label>
          <input type="date" value={dataProdukcji} onChange={(e) => setDataProdukcji(e.target.value)} disabled={rozliczony}
            className="w-full text-sm font-mono outline-none rounded px-2 py-2"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--text-muted)' }}>
            Typ produkcji
          </label>
          <select value={typ} onChange={(e) => setTyp(e.target.value)} disabled={rozliczony}
            className="w-full text-sm outline-none rounded px-2 py-2"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            {TYPY.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
        </div>

        {wymagaBazy(typ) && (
          <>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Receptura bazy
              </label>
              <select value={idRecepturyBazy} onChange={(e) => setIdRecepturyBazy(e.target.value)} disabled={rozliczony}
                className="w-full text-sm outline-none rounded px-2 py-2"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                <option value="">— wybierz —</option>
                {recepturyBazy.map((r) => (
                  <option key={r.id} value={r.id}>{r.asortyment_docelowy.nazwa}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Baza do zrobienia
              </label>
              <div className="flex items-center gap-2">
                <input type="text" value={bazaKg} onChange={(e) => setBazaKg(clampDecimals(e.target.value, 3))}
                  placeholder={String(sumaBazy)} disabled={rozliczony}
                  className="w-full text-sm font-mono font-bold outline-none rounded px-2 py-2"
                  style={{ background: 'var(--bg-input)', border: `1px solid ${bazaPrzekroczona ? 'var(--warn)' : 'var(--border)'}`, color: 'var(--text-primary)' }} />
                <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>kg</span>
              </div>
              {bazaPrzekroczona ? (
                <p className="text-[10px] mt-1 font-bold" style={{ color: 'var(--warn)' }}>
                  ⚠ Za mało — smaki potrzebują <span className="font-mono">{fmtL(sumaBazy, 3)} kg</span>, brakuje <span className="font-mono">{fmtL(sumaBazy - bazaKgNum, 3)} kg</span>
                </p>
              ) : (
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  Z receptur wychodzi <span className="font-mono font-bold">{fmtL(sumaBazy, 3)} kg</span>
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Rzeczywista ilość bazy — tylko przy rozliczaniu */}
      {tryb === "rozliczenie" && wymagaBazy(typ) && (
        <div className="rounded p-4 flex items-center gap-4"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-accent)' }}>
          <div className="flex-1">
            <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
              Etap 1 — ile bazy faktycznie wyszło
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Planowano {fmtL(parseFloat(bazaKg.replace(",", ".")) || 0, 1)} kg. Reszta niewykorzystanej bazy trafi na stratę.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input type="text" value={bazaRzeczywista}
              onChange={(e) => setBazaRzeczywista(clampDecimals(e.target.value, 3))}
              className="text-sm font-mono font-bold text-right outline-none rounded w-28"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#4ade80', padding: '6px 8px' }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>kg</span>
          </div>
        </div>
      )}

      {/* Pozycje */}
      <div className="space-y-2">
        {pozycje.map((p, i) => {
          const rec = recepturaById(p.id_receptury);
          const warianty = wariantyReceptury(rec);
          const kg = kgPozycji(p);

          return (
            <div key={p._uid}
              draggable={!rozliczony}
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (dragIdx !== null) przeniesPozycje(dragIdx, i); setDragIdx(null); }}
              onDragEnd={() => setDragIdx(null)}
              className="rounded p-3"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                opacity: dragIdx === i ? 0.4 : 1,
              }}>

              <div className="flex items-center gap-3 mb-2">
                {!rozliczony && <GripVertical className="w-4 h-4 shrink-0 cursor-grab" style={{ color: 'var(--text-muted)' }} />}
                <span className="font-mono text-xs w-6 shrink-0" style={{ color: 'var(--text-muted)' }}>{i + 1}</span>
                <span className="font-bold text-sm flex-1 truncate">
                  {rec?.asortyment_docelowy.nazwa ?? "— nieznana receptura —"}
                </span>
                <span className="font-mono font-bold text-sm shrink-0" style={{ color: 'var(--accent)' }}>
                  {fmtL(kg, 3)} kg
                </span>
                {!rozliczony && (
                  <button onClick={() => usunPozycje(p._uid)} className="btn btn-ghost btn-sm shrink-0" title="Usuń smak">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Tryb rozliczenia — wagi końcowe przepisywane z kartki */}
              {tryb === "rozliczenie" && (() => {
                const rozl = rozliczenie[p._uid];
                if (!rozl) return null;
                const suma = sumaWag(p._uid);
                const odchylka = suma > 0 ? suma - kg : 0;
                return (
                  <div className="pl-9 space-y-1">
                    <div className="flex items-center gap-3 mb-1">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                        <input type="checkbox" checked={rozl.pominieta} onChange={() => przelaczPominiecie(p._uid)} />
                        Niewykonane
                      </label>
                      {!rozl.pominieta && suma > 0 && (
                        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                          zważono <span className="font-bold" style={{ color: 'var(--ok)' }}>{fmtL(suma, 3)} kg</span>
                          {" "}({odchylka >= 0 ? "+" : ""}{fmtL(odchylka, 3)} wobec planu)
                        </span>
                      )}
                    </div>

                    {!rozl.pominieta && rozl.opakowania.map((o, oi) => (
                      <div key={o._uid} className="flex items-center gap-2">
                        <span className="font-mono text-xs w-5 shrink-0" style={{ color: 'var(--text-muted)' }}>{oi + 1}</span>
                        <select value={o.id_asortymentu}
                          onChange={(e) => zmienWage(p._uid, o._uid, { id_asortymentu: e.target.value })}
                          className="text-xs outline-none rounded flex-1 min-w-0"
                          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '4px 6px' }}>
                          <option value="">— opakowanie —</option>
                          {opakowania.map((op) => <option key={op.id} value={op.id}>{op.nazwa}</option>)}
                        </select>
                        <input type="text" value={o.waga} placeholder="0,000"
                          onChange={(e) => zmienWage(p._uid, o._uid, { waga: clampDecimals(e.target.value, 3) })}
                          className="text-xs font-mono font-bold text-right outline-none rounded w-24 shrink-0"
                          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#4ade80', padding: '4px 6px' }} />
                        <span className="text-xs shrink-0 w-6" style={{ color: 'var(--text-muted)' }}>kg</span>
                        <button onClick={() => usunOpakowanie(p._uid, o._uid)} className="btn btn-ghost btn-sm shrink-0">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}

                    {!rozl.pominieta && (
                      <button onClick={() => dodajOpakowanie(p._uid, p.wsady[0]?.id_opakowania ?? "")}
                        className="text-xs px-2 py-1 rounded mt-1"
                        style={{ background: 'var(--bg-app)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                        <Plus className="w-3 h-3 inline" /> opakowanie ponadplanowe
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Chipy wariantów — jedno kliknięcie dodaje wsad z opakowaniem */}
              {!rozliczony && tryb === "plan" && (
                <div className="flex flex-wrap items-center gap-1.5 mb-2 pl-9">
                  {warianty.map((w, wi) => (
                    <button key={wi} onClick={() => dodajWsad(p._uid, w)}
                      className="text-xs px-2 py-1 rounded font-mono"
                      style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--border-accent)' }}>
                      ×{w.mnoznik} {nazwaOpakowania(w.id_opakowania) || "—"}
                      {w.liczba > 1 ? ` (${w.liczba} szt.)` : ""}
                    </button>
                  ))}
                  <button onClick={() => dodajWsad(p._uid)}
                    className="text-xs px-2 py-1 rounded"
                    style={{ background: 'var(--bg-app)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    <Plus className="w-3 h-3 inline" /> inny wsad
                  </button>
                  {warianty.length === 0 && (
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      Brak zapisanych wariantów — ustaw je przy recepturze, żeby dodawać wsady jednym kliknięciem
                    </span>
                  )}
                </div>
              )}

              {/* Wsady */}
              <div className="space-y-1 pl-9" style={{ display: tryb === "rozliczenie" ? 'none' : undefined }}>
                {p.wsady.map((w) => {
                  const mn = parseFloat(w.mnoznik.replace(",", ".")) || 0;
                  const kgWsadu = Math.round(mn * (rec?.wielkosc_produkcji ?? 1) * 1000) / 1000;
                  // Limit maszyny dotyczy mnożnika (ile receptury wlewa się na raz), nie
                  // gotowej wagi wyrobu — ta bywa wyższa przez pasty/przekładki w BOM.
                  const zaDuzy = mn > MAX_WSAD_KG;
                  return (
                    <div key={w._uid} className="flex items-center gap-2">
                      <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>×</span>
                      <input type="text" value={w.mnoznik} disabled={rozliczony}
                        onChange={(e) => zmienWsad(p._uid, w._uid, { mnoznik: clampDecimals(e.target.value, 2) })}
                        placeholder="4"
                        className="text-xs font-mono font-bold text-right outline-none rounded w-14 shrink-0"
                        style={{ background: 'var(--bg-input)', border: `1px solid ${zaDuzy ? 'var(--warn)' : 'var(--border)'}`, color: 'var(--text-primary)', padding: '4px 6px' }} />
                      <select value={w.id_opakowania} disabled={rozliczony}
                        onChange={(e) => zmienWsad(p._uid, w._uid, { id_opakowania: e.target.value })}
                        className="text-xs outline-none rounded flex-1 min-w-0"
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '4px 6px' }}>
                        <option value="">— opakowanie —</option>
                        {opakowania.map((o) => <option key={o.id} value={o.id}>{o.nazwa}</option>)}
                      </select>
                      <input type="text" value={w.liczba} disabled={rozliczony}
                        onChange={(e) => zmienWsad(p._uid, w._uid, { liczba: e.target.value.replace(/\D/g, "") })}
                        className="text-xs font-mono text-right outline-none rounded w-12 shrink-0"
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '4px 6px' }} />
                      <span className="text-xs shrink-0 w-8" style={{ color: 'var(--text-muted)' }}>szt.</span>
                      <span className="font-mono text-xs shrink-0 w-20 text-right"
                        style={{ color: zaDuzy ? 'var(--warn)' : 'var(--text-secondary)' }}>
                        {fmtL(kgWsadu, 3)} kg
                      </span>
                      {zaDuzy && (
                        <span className="text-[10px] shrink-0" style={{ color: 'var(--warn)' }} title={`Mnożnik powyżej ${MAX_WSAD_KG} nie zmieści się w maszynie na raz`}>
                          ⚠ maks. ×{MAX_WSAD_KG}
                        </span>
                      )}
                      {!rozliczony && (
                        <button onClick={() => usunWsad(p._uid, w._uid)} className="btn btn-ghost btn-sm shrink-0">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
                {p.wsady.length === 0 && (
                  <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>Brak wsadów — dodaj przynajmniej jeden.</p>
                )}
              </div>
            </div>
          );
        })}

        {pozycje.length === 0 && (
          <div className="rounded py-10 text-center text-sm"
            style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
            Plan jest pusty — dodaj pierwszy smak poniżej.
          </div>
        )}
      </div>

      {/* Dodawanie smaku */}
      {!rozliczony && tryb === "plan" && (
        <div className="rounded p-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <input
            value={szukajSmaku}
            onChange={(e) => setSzukajSmaku(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && dostepneSmaki.length > 0) dodajSmak(dostepneSmaki[0].id);
            }}
            placeholder="Dodaj smak — wpisz nazwę i naciśnij Enter"
            data-testid="input-dodaj-smak"
            className="w-full text-sm outline-none rounded px-3 py-2 mb-2"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
            {dostepneSmaki.slice(0, 40).map((r) => (
              <button key={r.id} onClick={() => dodajSmak(r.id)}
                className="text-xs px-2 py-1 rounded"
                style={{ background: 'var(--bg-app)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                {r.asortyment_docelowy.nazwa}
              </button>
            ))}
            {dostepneSmaki.length === 0 && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Brak pasujących smaków.</span>
            )}
          </div>
        </div>
      )}

      {/* Notatki */}
      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--text-muted)' }}>
          Notatki na kartę
        </label>
        <textarea value={notatki} onChange={(e) => setNotatki(e.target.value)} rows={2} disabled={rozliczony}
          className="w-full text-sm outline-none rounded px-3 py-2"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
      </div>

      {/* Akcje dolne */}
      {edytowany && !rozliczony && tryb === "plan" && (
        <div className="flex items-center justify-between gap-2 pt-2">
          <button onClick={() => setDoUsuniecia(edytowany)} className="btn btn-danger">
            <Trash2 className="w-4 h-4" /> Usuń plan
          </button>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Rozliczenie wpisuje wagi końcowe i tworzy dokumenty magazynowe — przycisk „Rozlicz turnus" u góry
          </span>
        </div>
      )}
      </div>

      <ConfirmModal
        isOpen={doUsuniecia != null}
        onCancel={() => setDoUsuniecia(null)}
        onConfirm={() => doUsuniecia && usunPlan(doUsuniecia)}
        title="Usunąć plan turnusu?"
        message={`Plan ${doUsuniecia?.numer_sesji ?? ""} zostanie trwale usunięty razem ze wszystkimi pozycjami. Magazyn nie zostanie ruszony.`}
        confirmText="Usuń plan"
      />

      <ConfirmModal
        isOpen={potwierdzRozliczenie}
        onCancel={() => setPotwierdzRozliczenie(false)}
        onConfirm={rozlicz}
        title="Zamknąć turnus?"
        message={
          `Powstaną dokumenty RW i PW, surowce zejdą ze stanu (partie dobrane FIFO), ` +
          `a wyroby trafią na magazyn. Operacji nie da się cofnąć. ` +
          `Pozycje oznaczone jako niewykonane zostaną anulowane.`
        }
        confirmText="Zamknij turnus"
        isDestructive={false}
      />
    </div>
  );
}
