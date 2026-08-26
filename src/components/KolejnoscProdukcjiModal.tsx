/**
 * KolejnoscProdukcjiModal — ustawianie kolejności barwnej wyrobów gotowych.
 *
 * Lody produkuje się od najjaśniejszych smaków do najciemniejszych, żeby nie
 * zabarwiać maszyny. Ta kolejność jest stała i ustawia się ją raz — plan turnusu
 * układa potem smaki automatycznie według niej.
 *
 * Zapis nadaje wartości co 10 (10, 20, 30…), dzięki czemu wstawienie nowego
 * smaku między istniejące nie wymaga przenumerowania całej listy.
 */
import { useEffect, useState } from "react";
import { GripVertical, Search } from "lucide-react";
import { Modal } from "./Modal";
import { useToast } from "./Toast";
import { Spinner } from "./Spinner";

type Wyrob = {
  id: string;
  nazwa: string;
  kod_towaru: string;
  typ_asortymentu: string;
  czy_aktywne: boolean;
  kolejnosc_produkcji: number | null;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Wywoływane po udanym zapisie — pozwala odświeżyć listę w rodzicu */
  onZapisano?: () => void;
}

export default function KolejnoscProdukcjiModal({ isOpen, onClose, onZapisano }: Props) {
  const { showToast } = useToast();
  const [wyroby, setWyroby] = useState<Wyrob[]>([]);
  const [loading, setLoading] = useState(false);
  const [zapisywanie, setZapisywanie] = useState(false);
  const [szukaj, setSzukaj] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch("/api/asortyment")
      .then((r) => r.json())
      .then((data: Wyrob[]) => {
        const lista = data
          .filter((a) => a.typ_asortymentu === "Wyrob_Gotowy" && a.czy_aktywne)
          .sort(porownajKolejnoscia);
        setWyroby(lista);
      })
      .catch(() => showToast("Nie udało się pobrać listy wyrobów", "error"))
      .finally(() => setLoading(false));
  }, [isOpen]);

  /** Wyroby bez ustawionej kolejności lądują na końcu, alfabetycznie. */
  function porownajKolejnoscia(a: Wyrob, b: Wyrob) {
    const ka = a.kolejnosc_produkcji;
    const kb = b.kolejnosc_produkcji;
    if (ka == null && kb == null) return a.nazwa.localeCompare(b.nazwa, "pl");
    if (ka == null) return 1;
    if (kb == null) return -1;
    return ka - kb;
  }

  function przenies(z: number, na: number) {
    if (z === na) return;
    setWyroby((prev) => {
      const kopia = [...prev];
      const [element] = kopia.splice(z, 1);
      kopia.splice(na, 0, element);
      return kopia;
    });
  }

  async function zapisz() {
    setZapisywanie(true);
    try {
      const res = await fetch("/api/asortyment/kolejnosc-produkcji", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kolejnosc: wyroby.map((w, i) => ({ id: w.id, kolejnosc_produkcji: (i + 1) * 10 })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast("Kolejność produkcji zapisana", "ok");
      onZapisano?.();
      onClose();
    } catch (e: any) {
      showToast(e.message || "Błąd zapisu kolejności", "error");
    } finally {
      setZapisywanie(false);
    }
  }

  const filtr = szukaj.trim().toLowerCase();
  const przeciaganieAktywne = filtr === "";

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" tall
      title="Kolejność produkcji"
      subtitle="Od najjaśniejszych smaków do najciemniejszych — przeciągnij, żeby zmienić">

      <div className="p-5 space-y-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            value={szukaj}
            onChange={(e) => setSzukaj(e.target.value)}
            placeholder="Szukaj smaku…"
            className="w-full text-sm outline-none rounded pl-9 pr-3 py-2"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
        </div>

        {!przeciaganieAktywne && (
          <div className="text-xs px-1" style={{ color: 'var(--warn)' }}>
            Wyczyść wyszukiwanie, żeby móc przeciągać pozycje.
          </div>
        )}

        {loading ? (
          <div className="py-10 flex justify-center"><Spinner /></div>
        ) : (
          <div className="space-y-1">
            {wyroby.map((w, i) => {
              const pasuje = !filtr || w.nazwa.toLowerCase().includes(filtr) || w.kod_towaru.toLowerCase().includes(filtr);
              if (!pasuje) return null;
              return (
                <div
                  key={w.id}
                  draggable={przeciaganieAktywne}
                  onDragStart={() => setDragIdx(i)}
                  onDragOver={(e) => { e.preventDefault(); setOverIdx(i); }}
                  onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIdx !== null) przenies(dragIdx, i);
                    setDragIdx(null);
                    setOverIdx(null);
                  }}
                  className="flex items-center gap-3 px-3 py-2 rounded"
                  style={{
                    background: overIdx === i && dragIdx !== null && dragIdx !== i ? 'var(--accent-dim)' : 'var(--bg-surface)',
                    border: `1px solid ${overIdx === i && dragIdx !== null && dragIdx !== i ? 'var(--border-accent)' : 'var(--border)'}`,
                    opacity: dragIdx === i ? 0.4 : 1,
                    cursor: przeciaganieAktywne ? 'grab' : 'default',
                  }}
                >
                  <GripVertical className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                  <span className="font-mono text-xs w-8 shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {(i + 1) * 10}
                  </span>
                  <span className="flex-1 truncate text-sm">{w.nazwa}</span>
                  <span className="font-mono text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {w.kod_towaru}
                  </span>
                </div>
              );
            })}
            {wyroby.length === 0 && (
              <div className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                Brak aktywnych wyrobów gotowych.
              </div>
            )}
          </div>
        )}
      </div>

      <Modal.Footer>
        <button onClick={onClose} className="btn btn-ghost">Anuluj</button>
        <button onClick={zapisz} disabled={zapisywanie || loading} className="btn btn-primary">
          {zapisywanie ? "Zapisywanie…" : "Zapisz kolejność"}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
