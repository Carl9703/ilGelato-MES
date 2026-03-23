import React, { useState, useEffect } from "react";
import { BarChart2, ChevronDown, ChevronRight, TrendingUp, FileText, Users, Calendar } from "lucide-react";
import { fmtL, fmtDate } from "../utils/fmt";
import { Spinner } from "../components/Spinner";
import { EmptyState } from "../components/EmptyState";

type Pozycja = {
  kod_towaru: string;
  nazwa: string;
  jednostka: string;
  ilosc: number;
  cena_jednostkowa: number;
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

function fmt(val: number) {
  return val.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}


export default function Raporty() {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const [od, setOd] = useState(firstOfMonth);
  const [doData, setDoData] = useState(todayStr);
  const [filtKontrahent, setFiltKontrahent] = useState<string>("__all__");
  const [data, setData] = useState<RaportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedDok, setExpandedDok] = useState<Set<string>>(new Set());

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

  useEffect(() => { fetchRaport(); }, []);

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

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Nagłówek */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-5 h-5" style={{ color: "var(--accent)" }} />
          <h2 className="text-lg font-bold text-white">Raporty</h2>
        </div>
      </div>

      {/* Zakładki raportów */}
      <div className="flex gap-1 shrink-0">
        <button
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          <Users className="w-4 h-4" /> Sprzedaż per kontrahent
        </button>
      </div>

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
            type="date"
            value={od}
            onChange={e => setOd(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-sm outline-none"
            style={{ background: "var(--bg-app)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs" style={{ color: "var(--text-muted)" }}>Do</label>
          <input
            type="date"
            value={doData}
            onChange={e => setDoData(e.target.value)}
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
          onClick={fetchRaport}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-1.5 rounded-xl text-sm font-semibold text-white"
          style={{ background: "var(--accent)" }}
        >
          {loading ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <TrendingUp className="w-3.5 h-3.5" />}
          Generuj
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
            <div
              key={label}
              className="px-4 py-3 rounded-xl"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
            >
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
              <tr style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
                {["", "Kontrahent", "Dokumenty WZ", "Wartość (PLN)", "Udział %"].map((h, i) => (
                  <th
                    key={i}
                    style={{
                      padding: "8px 12px",
                      textAlign: i >= 2 ? "right" : "left",
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--text-muted)",
                      width: i === 0 ? 32 : undefined,
                    }}
                  >
                    {h}
                  </th>
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
                    {/* Wiersz kontrahenta */}
                    <tr
                      onClick={() => toggleKontrahent(klucz)}
                      style={{ borderBottom: "1px solid var(--border-dim)", cursor: "pointer", transition: "background .1s" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={{ padding: "8px 12px" }}>
                        {isExp
                          ? <ChevronDown className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
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
                          <div
                            className="h-1.5 rounded-full"
                            style={{ width: 60, background: "var(--border)" }}
                          >
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${udzial}%`, background: "var(--accent)" }}
                            />
                          </div>
                          <span className="font-mono text-xs w-10 text-right" style={{ color: "var(--text-secondary)" }}>
                            {fmtL(udzial, 1)}%
                          </span>
                        </div>
                      </td>
                    </tr>

                    {/* Rozwinięcie — lista dokumentów */}
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
                              {isDokExp
                                ? <ChevronDown className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
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

                          {/* Pozycje dokumentu */}
                          {isDokExp && dok.pozycje.map((poz, pi) => (
                            <tr
                              key={pi}
                              style={{ background: "rgba(59,130,246,0.02)", borderBottom: "1px solid var(--border-dim)" }}
                            >
                              <td style={{ padding: "5px 12px 5px 52px" }} />
                              <td style={{ padding: "5px 12px", fontSize: 12 }}>
                                <span className="font-mono" style={{ color: "var(--text-muted)", marginRight: 6 }}>{poz.kod_towaru}</span>
                                <span style={{ color: "var(--text-secondary)" }}>{poz.nazwa}</span>
                              </td>
                              <td style={{ padding: "5px 12px", textAlign: "right", fontSize: 12 }}>
                                <span className="font-mono" style={{ color: "var(--text-muted)" }}>
                                  {poz.ilosc.toLocaleString("pl-PL", { maximumFractionDigits: 3 })} {poz.jednostka}
                                </span>
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
    </div>
  );
}
