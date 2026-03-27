import React from "react";
import { FileText, Trash2, X, CheckCircle, Ban, Tag, Clock } from "lucide-react";
import { fmtL } from "../utils/fmt";
import { Spinner } from "./Spinner";

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

const typBadgeCls: Record<string, string> = {
  PZ: 'badge-ok', PW: 'badge-info', RW: 'badge-danger', WZ: 'badge-warn',
};

const fmtFull = (d: string) =>
  new Date(d).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

type Props = {
  docRef: string;
  docData: any;
  loading: boolean;
  onClose: () => void;
  zIndex?: number;
  // Akcje opcjonalne (tylko Dokumenty)
  onZatwierdz?: (ref: string) => void;
  onAnuluj?: (ref: string) => void;
  onUsun?: (ref: string) => void;
  onPrintLabels?: (ref: string) => void;
  actionLoading?: string | null;
};

export default function DocumentPreviewModal({
  docRef, docData, loading, onClose,
  zIndex = 1070,
  onZatwierdz, onAnuluj, onUsun, onPrintLabels, actionLoading,
}: Props) {
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm pl-16 lg:pl-60 pr-4"
      style={{ zIndex }}
      onClick={onClose}
    >
      <div
        className="flex flex-col shadow-2xl border border-[var(--border)]"
        style={{ background: 'var(--bg-panel)', height: '80vh', marginTop: '10vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Nagłówek */}
        <div className="flex justify-between items-center px-5 py-3 border-b border-[var(--border)] shrink-0" style={{ background: 'var(--bg-surface)' }}>
          <div className="flex items-center gap-3">
            <FileText className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <span className="font-bold text-white">{docRef}</span>
            {docData && (
              <span className={`badge ${typBadgeCls[docData.typ] || 'badge-info'}`}>{docData.typ}</span>
            )}
            {docData?.status && <StatusBadge status={docData.status} />}
          </div>
          <div className="flex items-center gap-2">
            {onZatwierdz && docData && (docData.typ === "PZ" || docData.typ === "WZ") && docData.status === "Bufor" && (
              <button onClick={() => onZatwierdz(docRef)} disabled={actionLoading === docRef}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-bold btn-hover-effect"
                style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.4)' }}>
                <CheckCircle className="w-3.5 h-3.5" /> Zatwierdź
              </button>
            )}
            {onUsun && docData && (docData.typ === "PZ" || docData.typ === "WZ") && docData.status === "Bufor" && (
              <button onClick={() => onUsun(docRef)} disabled={actionLoading === docRef}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-bold btn-hover-effect"
                style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                <Trash2 className="w-3.5 h-3.5" /> Usuń
              </button>
            )}
            {onAnuluj && docData && (docData.typ === "PZ" || docData.typ === "WZ") && docData.status === "Zatwierdzony" && (
              <button onClick={() => onAnuluj(docRef)} disabled={actionLoading === docRef}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-bold btn-hover-effect"
                style={{ background: 'rgba(249,115,22,0.12)', color: '#f97316', border: '1px solid rgba(249,115,22,0.3)' }}>
                <Ban className="w-3.5 h-3.5" /> Anuluj
              </button>
            )}
            {onPrintLabels && docData && docData.typ !== 'WZ' && docData.typ !== 'RW' && (
              <button onClick={() => onPrintLabels(docRef)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium btn-hover-effect"
                style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)' }}>
                <Tag className="w-3.5 h-3.5" /> Etykiety
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Meta */}
        {docData && (
          <div className="flex flex-wrap items-center gap-4 px-5 py-2.5 border-b border-[var(--border)] text-xs shrink-0" style={{ background: 'var(--bg-app)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Wystawiono: <span className="text-white font-medium">{fmtFull(docData.data)}</span></span>
            <span style={{ color: 'var(--text-muted)' }}>Operator: <span className="text-white font-medium">{docData.uzytkownik}</span></span>
            {docData.data_zatwierdzenia && (
              <span style={{ color: 'var(--text-muted)' }}>Zatwierdził: <span className="font-medium" style={{ color: '#22c55e' }}>{docData.uzytkownik_zatwierdzenia}</span> · {fmtFull(docData.data_zatwierdzenia)}</span>
            )}
            {docData.data_anulowania && (
              <span style={{ color: 'var(--text-muted)' }}>Anulował: <span className="font-medium" style={{ color: '#ef4444' }}>{docData.uzytkownik_anulowania}</span> · {fmtFull(docData.data_anulowania)}</span>
            )}
            {docData.numer_zlecenia && (
              <span style={{ color: 'var(--text-muted)' }}>ZP: <span className="font-mono font-medium" style={{ color: 'var(--text-code)' }}>{docData.numer_zlecenia}</span></span>
            )}
            {docData.kontrahent && (
              <span style={{ color: 'var(--text-muted)' }}>Kontrahent: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{docData.kontrahent.kod} — {docData.kontrahent.nazwa}</span></span>
            )}
          </div>
        )}

        {/* Treść */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center p-12"><Spinner /></div>
          ) : !docData ? (
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
                  {docData.pozycje?.map((poz: any, i: number) => (
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

              {/* Podsumowanie wagi dla PW i WZ */}
              {(docData.typ === "PW" || docData.typ === "WZ") && (() => {
                const podsumowanie: Record<string, number> = {};
                let pokazPodsumowanie = false;
                (docData.pozycje || []).forEach((p: any) => {
                  const nazwa = p.wyrob || p.asortyment;
                  const isSzt = p.jednostka === 'szt.';
                  const waga = p.ilosc_kg != null ? parseFloat(p.ilosc_kg) : (isSzt ? 0 : parseFloat(p.ilosc));
                  if (waga > 0) { podsumowanie[nazwa] = (podsumowanie[nazwa] || 0) + waga; pokazPodsumowanie = true; }
                });
                if (!pokazPodsumowanie) return null;
                const entries = Object.entries(podsumowanie).sort((a, b) => b[1] - a[1]);
                const sumaCalkowita = entries.reduce((acc, curr) => acc + curr[1], 0);
                return (
                  <div className="mt-6 mx-4 mb-2 border rounded shadow-sm overflow-hidden shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--bg-app)' }}>
                    <div className="px-4 py-2.5 text-xs font-bold uppercase tracking-widest border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>
                      Podsumowanie wagi dokumentu
                    </div>
                    <div className="p-2 space-y-0.5">
                      {entries.map(([nazwa, waga]) => (
                        <div key={nazwa} className="flex justify-between items-center px-3 py-2 hover:bg-[var(--bg-hover)] rounded transition-colors">
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
  );
}
