/**
 * WariantyWsaduPanel — typowe wsady, w jakich robi się dany smak.
 *
 * Wariant to para „mnożnik receptury → opakowanie docelowe", np. ×4 na kuwetę
 * albo ×10 na dwa pozzetti. Rozbicie nie jest kosmetyczne: maszyna bierze
 * ograniczoną ilość na raz, a kuweta z pozzetti nie mieszczą się razem
 * w szokówce, więc idą osobnymi mrożeniami.
 *
 * Warianty zapisane tutaj pojawiają się na planie turnusu jako przyciski,
 * które jednym kliknięciem dodają wsad razem z opakowaniem.
 */
import { useEffect, useState } from "react";
import { Plus, Trash2, Info } from "lucide-react";
import { useToast } from "./Toast";
import { fmtL, clampDecimals } from "../utils/fmt";

type Asortyment = { id: string; nazwa: string; typ_asortymentu: string; czy_aktywne: boolean };

type Wariant = { _uid: string; mnoznik: string; id_opakowania: string; liczba: string };

interface Props {
  receptura: {
    id: string;
    wielkosc_produkcji: number;
    warianty_json: string | null;
    asortyment_docelowy: { nazwa: string; jednostka_miary: string };
  };
  /** Wywoływane po zapisie, żeby rodzic odświeżył listę receptur */
  onZapisano?: () => void;
}

const uid = () => Math.random().toString(36).slice(2, 10);

/** Maksymalny wsad frezera — powyżej tego mieszanka nie zmieści się na raz. */
const MAX_WSAD_KG = 10;

export default function WariantyWsaduPanel({ receptura, onZapisano }: Props) {
  const { showToast } = useToast();
  const [opakowania, setOpakowania] = useState<Asortyment[]>([]);
  const [warianty, setWarianty] = useState<Wariant[]>([]);
  const [zapisywanie, setZapisywanie] = useState(false);

  useEffect(() => {
    fetch("/api/asortyment")
      .then((r) => r.json())
      .then((d: Asortyment[]) =>
        setOpakowania(Array.isArray(d) ? d.filter((a) => a.typ_asortymentu === "Opakowanie" && a.czy_aktywne) : [])
      )
      .catch(() => showToast("Nie udało się pobrać listy opakowań", "error"));
  }, []);

  useEffect(() => {
    try {
      const parsed = receptura.warianty_json ? JSON.parse(receptura.warianty_json) : [];
      setWarianty(
        (Array.isArray(parsed) ? parsed : []).map((w: any) => ({
          _uid: uid(),
          mnoznik: String(w.mnoznik ?? ""),
          id_opakowania: w.id_opakowania ?? "",
          liczba: String(w.liczba ?? 1),
        }))
      );
    } catch {
      setWarianty([]);
    }
  }, [receptura.id, receptura.warianty_json]);

  const dodaj = () =>
    setWarianty((p) => [...p, { _uid: uid(), mnoznik: "", id_opakowania: "", liczba: "1" }]);

  const zmien = (u: string, pola: Partial<Wariant>) =>
    setWarianty((p) => p.map((w) => (w._uid === u ? { ...w, ...pola } : w)));

  const usun = (u: string) => setWarianty((p) => p.filter((w) => w._uid !== u));

  async function zapisz() {
    setZapisywanie(true);
    try {
      const res = await fetch(`/api/receptury/${receptura.id}/warianty`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warianty: warianty.map((w) => ({
            mnoznik: parseFloat(w.mnoznik.replace(",", ".")) || 0,
            id_opakowania: w.id_opakowania || null,
            liczba: parseInt(w.liczba, 10) || 1,
          })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast("Warianty wsadu zapisane", "ok");
      onZapisano?.();
    } catch (e: any) {
      showToast(e.message || "Błąd zapisu wariantów", "error");
    } finally {
      setZapisywanie(false);
    }
  }

  const jm = receptura.asortyment_docelowy.jednostka_miary;

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-start gap-2 text-xs rounded px-3 py-2"
        style={{ background: 'var(--bg-app)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Mnożnik skaluje całą recepturę. Przy wydajności{" "}
          <span className="font-mono font-bold" style={{ color: 'var(--text-secondary)' }}>
            {fmtL(receptura.wielkosc_produkcji ?? 1, 3)} {jm}
          </span>{" "}
          mnożnik ×4 daje{" "}
          <span className="font-mono font-bold" style={{ color: 'var(--text-secondary)' }}>
            {fmtL(4 * (receptura.wielkosc_produkcji ?? 1), 3)} {jm}
          </span>{" "}
          wyrobu.
        </span>
      </div>

      <div className="space-y-2">
        {warianty.map((w) => {
          const mn = parseFloat(w.mnoznik.replace(",", ".")) || 0;
          const kg = Math.round(mn * (receptura.wielkosc_produkcji ?? 1) * 1000) / 1000;
          // Limit maszyny dotyczy mnożnika (ile receptury wlewa się na raz), nie
          // gotowej wagi wyrobu — ta bywa wyższa przez pasty/przekładki w BOM.
          const zaDuzy = mn > MAX_WSAD_KG;
          return (
            <div key={w._uid} className="flex items-center gap-2">
              <span className="text-sm shrink-0" style={{ color: 'var(--text-muted)' }}>×</span>
              <input type="text" value={w.mnoznik} placeholder="4"
                onChange={(e) => zmien(w._uid, { mnoznik: clampDecimals(e.target.value, 2) })}
                className="text-sm font-mono font-bold text-right outline-none rounded w-16 shrink-0"
                style={{ background: 'var(--bg-input)', border: `1px solid ${zaDuzy ? 'var(--warn)' : 'var(--border)'}`, color: 'var(--text-primary)', padding: '6px 8px' }} />

              <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>→</span>

              <select value={w.id_opakowania}
                onChange={(e) => zmien(w._uid, { id_opakowania: e.target.value })}
                className="text-sm outline-none rounded flex-1 min-w-0"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '6px 8px' }}>
                <option value="">— opakowanie —</option>
                {opakowania.map((o) => <option key={o.id} value={o.id}>{o.nazwa}</option>)}
              </select>

              <input type="text" value={w.liczba}
                onChange={(e) => zmien(w._uid, { liczba: e.target.value.replace(/\D/g, "") })}
                className="text-sm font-mono text-right outline-none rounded w-14 shrink-0"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '6px 8px' }} />
              <span className="text-xs shrink-0 w-8" style={{ color: 'var(--text-muted)' }}>szt.</span>

              <span className="font-mono text-xs shrink-0 w-24 text-right"
                style={{ color: zaDuzy ? 'var(--warn)' : 'var(--text-secondary)' }}>
                {fmtL(kg, 3)} {jm}
              </span>
              {zaDuzy && (
                <span className="text-[10px] shrink-0" style={{ color: 'var(--warn)' }} title={`Mnożnik powyżej ${MAX_WSAD_KG} nie zmieści się w maszynie na raz`}>
                  ⚠ maks. ×{MAX_WSAD_KG}
                </span>
              )}

              <button type="button" onClick={() => usun(w._uid)} className="btn btn-ghost btn-sm shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}

        {warianty.length === 0 && (
          <p className="text-sm italic py-4 text-center" style={{ color: 'var(--text-muted)' }}>
            Brak wariantów. Dodaj te rozmiary, w których faktycznie robisz ten smak.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <button type="button" onClick={dodaj} className="btn btn-ghost">
          <Plus className="w-4 h-4" /> Dodaj wariant
        </button>
        <button type="button" onClick={zapisz} disabled={zapisywanie} className="btn btn-primary">
          {zapisywanie ? "Zapisywanie…" : "Zapisz warianty"}
        </button>
      </div>
    </div>
  );
}
