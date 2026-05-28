import React from "react";
import { FileText, Trash2, X, CheckCircle, Ban, Tag, Clock, Printer, ArrowRightCircle, ArrowDownCircle, Factory, Pencil } from "lucide-react";
import { fmtL, fmtDate, fmtFull } from "../utils/fmt";
import { printDocument, computeVatSummary } from "../utils/printDoc";
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


type Props = {
  docRef: string;
  docData: any;
  loading: boolean;
  onClose: () => void;
  zIndex?: number;
  onZatwierdz?: (ref: string) => void;
  onAnuluj?: (ref: string) => void;
  onUsun?: (ref: string) => void;
  onEdit?: (ref: string) => void;
  onPrintLabels?: (ref: string) => void;
  actionLoading?: string | null;
};

export default function DocumentPreviewModal({
  docRef, docData, loading, onClose,
  zIndex = 1070,
  onZatwierdz, onAnuluj, onUsun, onEdit, onPrintLabels, actionLoading,
}: Props) {
  const isWZ = docData?.typ === "WZ";
  const isPW = docData?.typ === "PW";
  const isRW = docData?.typ === "RW";
  const isPZ = docData?.typ === "PZ";
  const isCostDoc = isPW || isRW || isPZ;
  const vatSummary = React.useMemo(() => isWZ ? computeVatSummary(docData) : null, [docData, isWZ]);
  const costSummary = React.useMemo(() => {
    if (!docData || !isCostDoc) return null;
    const pozycje: any[] = docData?.pozycje || [];
    const hasCeny = pozycje.some((p: any) => p.cena_jednostkowa != null && p.cena_jednostkowa > 0);
    if (!hasCeny) return null;
    const total = pozycje.reduce((acc: number, p: any) => acc + (p.wartosc || 0), 0);
    return { total };
  }, [docData, isCostDoc]);

  return (
    <>
      <div
        id="doc-print-root"
        className="fixed inset-0 bg-black/70 backdrop-blur-sm pl-16 lg:pl-60 pt-2.5 pb-2.5 pr-2.5"
        style={{ zIndex }}
        onClick={onClose}
      >
        <div
          id="doc-print-inner"
          className="flex h-full border-l border-r border-b rounded-b-xl overflow-hidden"
          style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)' }}
          onClick={e => e.stopPropagation()}
        >

          {/* ── PRAWY PANEL: metadane + akcje ── */}
          <div className="no-print w-72 shrink-0 border-l flex flex-col"
               style={{ order: 2, borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>

            {/* Nagłówek panelu */}
            <div className="flex items-start justify-between p-5 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex-1 min-w-0">
                <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
                  Podgląd dokumentu
                </div>
                {loading ? (
                  <div className="h-7 w-36 rounded animate-pulse" style={{ background: 'var(--bg-hover)' }} />
                ) : docData ? (
                  <>
                    <div className="text-xl font-black font-mono text-white leading-tight">{docRef}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className={`badge ${typBadgeCls[docData.typ] || 'badge-info'}`}>{docData.typ}</span>
                      <StatusBadge status={docData.status} />
                    </div>
                  </>
                ) : (
                  <div className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>{docRef}</div>
                )}
              </div>
              <button onClick={onClose}
                className="p-1.5 rounded-lg ml-2 shrink-0 transition-colors hover:bg-[var(--bg-hover)]"
                style={{ color: 'var(--text-muted)' }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metadane */}
            {docData && (
              <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">

                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>Wystawiono</div>
                  <div className="font-medium text-white">{fmtFull(docData.data)}</div>
                  <div className="mt-0.5" style={{ color: 'var(--text-muted)' }}>Operator: {docData.uzytkownik}</div>
                </div>

                {docData.kontrahent && (
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>Kontrahent</div>
                    <div className="font-semibold text-white">{docData.kontrahent.nazwa}</div>
                    <div className="font-mono mt-0.5" style={{ color: 'var(--text-code)' }}>{docData.kontrahent.kod}</div>
                  </div>
                )}

                {isWZ && docData.data_dostawy && (
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>Data dostawy</div>
                    <div className="font-medium text-white">{fmtDate(docData.data_dostawy)}</div>
                  </div>
                )}

                {docData.numer_zewnetrzny && (
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>Nr zewnętrzny</div>
                    <div className="font-mono font-medium" style={{ color: 'var(--text-code)' }}>{docData.numer_zewnetrzny}</div>
                  </div>
                )}

                {docData.numer_zlecenia && (
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>Zlecenie produkcyjne</div>
                    <div className="font-mono font-medium" style={{ color: 'var(--text-code)' }}>{docData.numer_zlecenia}</div>
                  </div>
                )}

                {docData.data_zatwierdzenia && (
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>Zatwierdzono</div>
                    <div className="font-medium" style={{ color: '#22c55e' }}>{docData.uzytkownik_zatwierdzenia}</div>
                    <div className="mt-0.5" style={{ color: 'var(--text-muted)' }}>{fmtFull(docData.data_zatwierdzenia)}</div>
                  </div>
                )}

                {docData.data_anulowania && (
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>Anulowano</div>
                    <div className="font-medium" style={{ color: '#ef4444' }}>{docData.uzytkownik_anulowania}</div>
                    <div className="mt-0.5" style={{ color: 'var(--text-muted)' }}>{fmtFull(docData.data_anulowania)}</div>
                  </div>
                )}

                {/* Koszty dla PW/RW */}
                {costSummary && (
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>{isPZ ? "Wartość dokumentu" : "Wartość kosztów"}</div>
                    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                      <div className="flex justify-between items-center px-3 py-2.5" style={{ background: 'var(--bg-app)' }}>
                        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Łączna wartość</span>
                        <span className="text-sm font-mono font-bold" style={{ color: '#38bdf8' }}>{costSummary.total.toFixed(2)} zł</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* VAT w lewym panelu */}
                {vatSummary && (
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Rozliczenie VAT</div>
                    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
                            <th className="px-3 py-1.5 text-left font-semibold" style={{ color: 'var(--text-muted)' }}>Stawk.</th>
                            <th className="px-2 py-1.5 text-right font-semibold" style={{ color: 'var(--text-muted)' }}>Netto</th>
                            <th className="px-2 py-1.5 text-right font-semibold" style={{ color: 'var(--text-muted)' }}>VAT</th>
                            <th className="px-3 py-1.5 text-right font-semibold" style={{ color: 'var(--text-muted)' }}>Brutto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(Object.entries(vatSummary.groups) as [string, { netto: number; vat: number; brutto: number }][])
                            .sort(([a], [b]) => parseFloat(a) - parseFloat(b))
                            .map(([rate, g]) => (
                              <tr key={rate} style={{ borderBottom: '1px solid var(--border-dim)', background: 'var(--bg-app)' }}>
                                <td className="px-3 py-1.5 font-bold font-mono" style={{ color: 'var(--text-secondary)' }}>{rate}%</td>
                                <td className="px-2 py-1.5 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>{g.netto.toFixed(2)}</td>
                                <td className="px-2 py-1.5 text-right font-mono" style={{ color: 'var(--warn)' }}>{g.vat.toFixed(2)}</td>
                                <td className="px-3 py-1.5 text-right font-mono font-semibold" style={{ color: '#fb923c' }}>{g.brutto.toFixed(2)}</td>
                              </tr>
                            ))}
                          {Object.keys(vatSummary.groups).length > 1 && (
                            <tr style={{ background: 'rgba(249,115,22,0.07)', borderTop: '2px solid rgba(249,115,22,0.3)' }}>
                              <td className="px-3 py-2 font-bold" style={{ color: 'var(--text-primary)' }} colSpan={3}>ŁĄCZNIE</td>
                              <td className="px-3 py-2 text-right font-mono font-bold" style={{ color: '#fb923c' }}>{vatSummary.totalBrutto.toFixed(2)}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Przyciski akcji */}
            {docData && (
              <div className="p-4 border-t flex flex-col gap-2 shrink-0" style={{ borderColor: 'var(--border)' }}>
                {onZatwierdz && (docData.typ === "PZ" || docData.typ === "WZ" || docData.typ === "RW") && docData.status === "Bufor" && (
                  <button onClick={() => onZatwierdz(docRef)} disabled={actionLoading === docRef}
                    className="btn w-full justify-center font-bold text-sm"
                    style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.4)' }}>
                    <CheckCircle className="w-4 h-4" /> Zatwierdź dokument
                  </button>
                )}
                {onEdit && (docData.typ === "PZ" || docData.typ === "WZ" || docData.typ === "RW") && docData.status === "Bufor" && (
                  <button onClick={() => onEdit(docRef)} disabled={actionLoading === docRef}
                    className="btn w-full justify-center text-sm"
                    style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.35)' }}>
                    <Pencil className="w-4 h-4" /> Edytuj dokument
                  </button>
                )}
                {onAnuluj && (docData.typ === "PZ" || docData.typ === "WZ" || docData.typ === "RW") && docData.status === "Zatwierdzony" && (
                  <button onClick={() => onAnuluj(docRef)} disabled={actionLoading === docRef}
                    className="btn w-full justify-center text-sm"
                    style={{ background: 'rgba(249,115,22,0.12)', color: '#f97316', border: '1px solid rgba(249,115,22,0.3)' }}>
                    <Ban className="w-4 h-4" /> Anuluj dokument
                  </button>
                )}
                {onUsun && (docData.typ === "PZ" || docData.typ === "WZ" || docData.typ === "RW") && docData.status === "Bufor" && (
                  <button onClick={() => onUsun(docRef)} disabled={actionLoading === docRef}
                    className="btn w-full justify-center text-sm"
                    style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                    <Trash2 className="w-4 h-4" /> Usuń dokument
                  </button>
                )}
                {onPrintLabels && docData.typ !== 'WZ' && docData.typ !== 'RW' && (
                  <button onClick={() => onPrintLabels(docRef)}
                    className="btn w-full justify-center text-sm"
                    style={{ background: 'rgba(245,158,11,0.1)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)' }}>
                    <Tag className="w-4 h-4" /> Drukuj etykiety
                  </button>
                )}
                <button onClick={() => printDocument(docData)}
                  className="btn w-full justify-center text-sm"
                  style={{ background: 'rgba(148,163,184,0.08)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.2)' }}>
                  <Printer className="w-4 h-4" /> Drukuj dokument
                </button>
              </div>
            )}
          </div>

          {/* ── PRAWY PANEL: treść dokumentu ── */}
          <div id="doc-print-body" className="flex-1 flex flex-col overflow-hidden">
            <div className="px-5 py-3 border-b shrink-0 flex items-center gap-2 no-print text-xs font-bold uppercase tracking-widest"
                 style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>
              {docData?.typ === 'WZ' && <ArrowRightCircle className="w-3.5 h-3.5 text-orange-400" />}
              {docData?.typ === 'PZ' && <ArrowDownCircle className="w-3.5 h-3.5 text-green-400" />}
              {(docData?.typ === 'PW' || docData?.typ === 'RW') && <Factory className="w-3.5 h-3.5 text-blue-400" />}
              Pozycje dokumentu
              {docData?.pozycje && (
                <span className="ml-1 px-2 py-0.5 rounded font-mono font-bold text-[10px]"
                      style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--border-accent)' }}>
                  {docData.pozycje.length}
                </span>
              )}
            </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center p-16"><Spinner /></div>
            ) : !docData ? (
              <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--text-muted)' }}>
                Brak danych o dokumencie
              </div>
            ) : (
              <div className="flex flex-col pb-8">

                {/* ── Nagłówek do druku ── */}
                <div className="hidden print:block print-header px-6 pt-6">
                  <div>
                    <div className="print-title">{docData.typ} — {docRef}</div>
                    <div className="print-meta">
                      Data: {fmtFull(docData.data)} · Operator: {docData.uzytkownik}
                      {docData.kontrahent ? ` · Odbiorca: ${docData.kontrahent.kod} — ${docData.kontrahent.nazwa}` : ""}
                      {docData.data_zatwierdzenia ? ` · Zatwierdzono: ${fmtFull(docData.data_zatwierdzenia)}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>Status</div>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>{docData.status?.toUpperCase()}</div>
                  </div>
                </div>

                {/* ── Tabela pozycji ── */}
                <table className="mes-table">
                  <thead>
                    <tr>
                      <th className="text-center w-8">Lp.</th>
                      <th>Towar</th>
                      <th>Partia</th>
                      {isWZ && <th style={{ color: 'var(--text-muted)', fontSize: 10 }}>Data prod.</th>}
                      <th className="text-right">Ilość</th>
                      {isWZ && (
                        <>
                          <th className="text-right" style={{ color: 'var(--text-muted)', fontSize: 10 }}>Cena netto</th>
                          <th className="text-right" style={{ color: 'var(--text-muted)', fontSize: 10 }}>VAT</th>
                          <th className="text-right" style={{ color: 'var(--text-muted)', fontSize: 10 }}>Cena brutto</th>
                          <th className="text-right" style={{ fontWeight: 700 }}>Wartość netto</th>
                          <th className="text-right" style={{ color: '#fb923c', fontWeight: 700 }}>Wartość brutto</th>
                        </>
                      )}
                      {isCostDoc && (
                        <>
                          <th className="text-right" style={{ color: 'var(--text-muted)', fontSize: 10 }}>{isPZ ? "Cena jm" : "Koszt jm"}</th>
                          <th className="text-right" style={{ fontWeight: 700 }}>{isPZ ? "Wartość netto" : "Wartość"}</th>
                        </>
                      )}
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
                        {isWZ && (
                          <td className="text-xs mono" style={{ color: 'var(--text-muted)' }}>
                            {fmtDate(poz.data_produkcji)}
                            {poz.termin_waznosci && <div style={{ color: new Date(poz.termin_waznosci) < new Date() ? '#ef4444' : 'var(--text-muted)' }}>ww: {fmtDate(poz.termin_waznosci)}</div>}
                          </td>
                        )}
                        <td className="text-right">
                          <div className="font-mono font-bold text-white">{fmtL(poz.ilosc, poz.jednostka === 'szt.' ? 0 : 3)} <span className="text-xs opacity-50">{poz.jednostka}</span></div>
                          {poz.ilosc_kg != null && <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{fmtL(poz.ilosc_kg, 3)} kg</div>}
                        </td>
                        {isWZ && (
                          <>
                            <td className="text-right font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                              {poz.cena_netto != null ? (
                                <span>
                                  {poz.cena_netto.toFixed(4)} zł
                                  {poz.cena_z_kartoteki && <span className="ml-1 text-[9px] font-sans" style={{ color: 'var(--text-muted)' }}>(katalog)</span>}
                                </span>
                              ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                            </td>
                            <td className="text-right font-mono text-xs" style={{ color: 'var(--warn)' }}>
                              {poz.stawka_vat != null ? `${poz.stawka_vat}%` : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                            </td>
                            <td className="text-right font-mono text-xs font-semibold" style={{ color: '#fb923c' }}>
                              {poz.cena_brutto != null ? `${poz.cena_brutto.toFixed(2)} zł` : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                            </td>
                            <td className="text-right font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                              {poz.wartosc_netto != null ? `${poz.wartosc_netto.toFixed(2)} zł` : <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>}
                            </td>
                            <td className="text-right font-mono font-bold" style={{ color: '#fb923c' }}>
                              {poz.wartosc_brutto != null ? `${poz.wartosc_brutto.toFixed(2)} zł` : <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>}
                            </td>
                          </>
                        )}
                        {isCostDoc && (
                          <>
                            <td className="text-right font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                              {poz.cena_jednostkowa != null && poz.cena_jednostkowa > 0
                                ? `${poz.cena_jednostkowa.toFixed(4)} zł`
                                : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                            </td>
                            <td className="text-right font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                              {poz.wartosc != null && poz.wartosc > 0
                                ? `${poz.wartosc.toFixed(2)} zł`
                                : <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* ── Podsumowanie wagi (PW / WZ) ── */}
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
                    <div className="mt-6 mx-4 mb-2 border rounded overflow-hidden shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--bg-app)' }}>
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

                {/* Podpisy do druku */}
                <div className="hidden print:flex signature-row mt-10">
                  <div className="signature-box">Wystawił</div>
                  <div className="signature-box">Odebrał</div>
                </div>

              </div>
            )}
          </div>
          </div>

        </div>
      </div>
    </>
  );
}
