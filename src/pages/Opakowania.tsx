import React, { useState, useEffect, useCallback } from "react";
import {
  Archive, ArrowDownToLine, ArrowUpFromLine, RotateCcw, AlertTriangle,
  Plus, RefreshCw, History, LayoutGrid, Trash2, Settings2
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AsortymentItem {
  id: string;
  kod_towaru: string;
  nazwa: string;
  jednostka_miary: string;
  czy_zwrotne: boolean;
  czy_aktywne: boolean;
}

interface StanKontrahenta {
  id: string;
  kod: string;
  nazwa: string;
  ilosc: number;
}

interface StanAsortymentu {
  id_asortymentu: string;
  nazwa_asortymentu: string;
  czy_zwrotne: boolean;
  magazyn: number;
  kontrahenci: StanKontrahenta[];
  lacznie: number;
}

interface Kontrahent {
  id: string;
  kod: string;
  nazwa: string;
}

interface RuchHistoria {
  id: string;
  ilosc: number;
  typ_ruchu: string;
  uwagi: string | null;
  referencja_dokumentu?: string | null;
  utworzono_dnia: string;
  asortyment: { id: string; nazwa: string };
  kontrahent: { id: string; kod: string; nazwa: string } | null;
  uzytkownik: { login: string };
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function useToast() {
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: "ok" | "error" }[]>([]);
  const show = useCallback((msg: string, type: "ok" | "error" = "ok") => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);
  return { toasts, show };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const RUCH_META: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  PRZYJECIE: { label: "Przyjęcie",  color: "var(--ok)",      bg: "rgba(34,197,94,0.12)",  icon: <ArrowDownToLine className="w-3.5 h-3.5" /> },
  WYDA:      { label: "Wydanie",    color: "var(--accent)",  bg: "rgba(6,182,212,0.12)",  icon: <ArrowUpFromLine className="w-3.5 h-3.5" /> },
  ZWROT:     { label: "Zwrot",      color: "#a78bfa",        bg: "rgba(167,139,250,0.12)",icon: <RotateCcw className="w-3.5 h-3.5" /> },
  STRATA:    { label: "Strata",     color: "var(--error)",   bg: "rgba(239,68,68,0.12)",  icon: <AlertTriangle className="w-3.5 h-3.5" /> },
};

function RuchBadge({ typ }: { typ: string }) {
  const m = RUCH_META[typ] || { label: typ, color: "gray", bg: "rgba(128,128,128,0.1)", icon: null };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 600,
      color: m.color, background: m.bg, border: `1px solid ${m.color}33`
    }}>
      {m.icon}{m.label}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type Tab = "stan" | "ruch" | "historia" | "ustawienia";

export default function Opakowania() {
  const [tab, setTab] = useState<Tab>("stan");
  const [stan, setStan] = useState<StanAsortymentu[]>([]);
  const [asortyment, setAsortyment] = useState<AsortymentItem[]>([]);
  const [kontrahenci, setKontrahenci] = useState<Kontrahent[]>([]);
  const [historia, setHistoria] = useState<RuchHistoria[]>([]);
  const [loading, setLoading] = useState(false);
  const { toasts, show } = useToast();

  // Formularz ruchu
  const [formAsort, setFormAsort] = useState("");
  const [formIlosc, setFormIlosc] = useState("");
  const [formRuch, setFormRuch] = useState<"PRZYJECIE" | "WYDA" | "ZWROT" | "STRATA">("PRZYJECIE");
  const [formKontrahent, setFormKontrahent] = useState("");
  const [formUwagi, setFormUwagi] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [stanR, asortR, kontrR, histR] = await Promise.all([
        fetch("/api/opakowania-zwrotne/stan").then(r => r.json()),
        fetch("/api/opakowania-asortyment").then(r => r.json()),
        fetch("/api/kontrahenci").then(r => r.json()),
        fetch("/api/opakowania-zwrotne/historia?limit=200").then(r => r.json()),
      ]);
      setStan(Array.isArray(stanR) ? stanR : []);
      setAsortyment(Array.isArray(asortR) ? asortR : []);
      setKontrahenci(Array.isArray(kontrR) ? kontrR : []);
      setHistoria(Array.isArray(histR) ? histR : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Wylicz wszystkich kontrahentów którzy mają coś u siebie (dla nagłówka tabeli)
  const dedupedKontrahenci: Record<string, StanKontrahenta> = {};
  stan.flatMap(s => s.kontrahenci).forEach(k => { dedupedKontrahenci[k.id] = k; });
  const kontrahenciWStan: StanKontrahenta[] = (Object.values(dedupedKontrahenci) as StanKontrahenta[])
    .sort((a, b) => a.nazwa.localeCompare(b.nazwa));

  const handleSaveRuch = async () => {
    if (!formAsort) return show("Wybierz kartotekę opakowania", "error");
    const iloscNum = parseInt(formIlosc);
    if (!iloscNum || iloscNum <= 0) return show("Podaj prawidłową ilość", "error");
    if ((formRuch === "WYDA" || formRuch === "ZWROT") && !formKontrahent)
      return show("Wybierz kontrahenta", "error");

    setSaving(true);
    try {
      const r = await fetch("/api/opakowania-zwrotne/ruch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_asortymentu: formAsort,
          ilosc: iloscNum,
          typ_ruchu: formRuch,
          id_kontrahenta: formKontrahent || null,
          uwagi: formUwagi || null,
        })
      });
      const data = await r.json();
      if (!r.ok) return show(data.error || "Błąd zapisu", "error");
      show(`Zarejestrowano ruch: ${RUCH_META[formRuch]?.label} ${iloscNum} szt.`, "ok");
      setFormIlosc(""); setFormKontrahent(""); setFormUwagi("");
      await fetchAll();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRuch = async (id: string) => {
    if (!confirm("Usunąć ten ruch?")) return;
    const r = await fetch(`/api/opakowania-zwrotne/ruch/${id}`, { method: "DELETE" });
    if (r.ok) { show("Ruch usunięty", "ok"); fetchAll(); }
    else { const d = await r.json(); show(d.error || "Błąd", "error"); }
  };

  const handleToggleZwrotne = async (item: AsortymentItem) => {
    const r = await fetch(`/api/asortyment/${item.id}/zwrotne`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ czy_zwrotne: !item.czy_zwrotne })
    });
    if (r.ok) { show(`Zaktualizowano kartotekę: ${item.nazwa}`, "ok"); fetchAll(); }
    else { const d = await r.json(); show(d.error || "Błąd", "error"); }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ color: "var(--text-primary)" }}>
      {/* Toasty */}
      <div style={{ position: "fixed", top: 16, right: 16, zIndex: 999, display: "flex", flexDirection: "column", gap: 8 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 500,
            background: t.type === "ok" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
            border: `1px solid ${t.type === "ok" ? "var(--ok)" : "var(--error)"}`,
            color: t.type === "ok" ? "var(--ok)" : "var(--error)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)", backdropFilter: "blur(12px)"
          }}>{t.msg}</div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div style={{ padding: "8px", borderRadius: "10px", background: "rgba(6,182,212,0.15)", border: "1px solid rgba(6,182,212,0.3)" }}>
            <Archive className="w-5 h-5" style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Opakowania zwrotne</h1>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Cyrkulacja pozetti i innych opakowań na podstawie kartotek towarowych</p>
          </div>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)", cursor: loading ? "wait" : "pointer" }}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Odśwież</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 shrink-0" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "4px" }}>
        {([
          { key: "stan",       icon: <LayoutGrid className="w-4 h-4" />,    label: "Stan"       },
          { key: "ruch",       icon: <Plus className="w-4 h-4" />,          label: "Ruch"       },
          { key: "historia",   icon: <History className="w-4 h-4" />,       label: "Historia"   },
          { key: "ustawienia", icon: <Settings2 className="w-4 h-4" />,     label: "Kartoteki"  },
        ] as { key: Tab; icon: React.ReactNode; label: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all flex-1 justify-center"
            style={{
              background: tab === t.key ? "var(--accent-dim)" : "transparent",
              color: tab === t.key ? "var(--accent)" : "var(--text-secondary)",
              border: tab === t.key ? "1px solid var(--border-accent)" : "1px solid transparent",
            }}
          >
            {t.icon}<span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">

        {/* ── Stan ── */}
        {tab === "stan" && (
          <div>
            {stan.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div style={{ padding: "20px", borderRadius: "50%", background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.15)" }}>
                  <Archive className="w-8 h-8" style={{ color: "var(--text-muted)" }} />
                </div>
                <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Brak śledzonych opakowań zwrotnych.</p>
                <p style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center", maxWidth: 400 }}>
                  Przejdź do zakładki <strong>Kartoteki</strong> i oznacz produkty (np. Pozetti), które chcesz śledzić ilościowo.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th style={{ textAlign: "left", padding: "10px 12px", color: "var(--text-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                        Nazwa asortymentu
                      </th>
                      <th style={{ textAlign: "center", padding: "10px 12px", color: "var(--ok)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                        🏭 Magazyn
                      </th>
                      {kontrahenciWStan.map(k => (
                        <th key={k.id} style={{ textAlign: "center", padding: "10px 12px", color: "var(--accent)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                          📍 {k.kod}
                          <div style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--text-muted)", fontSize: 10 }}>{k.nazwa}</div>
                        </th>
                      ))}
                      <th style={{ textAlign: "center", padding: "10px 12px", color: "var(--text-secondary)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                        Łącznie
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {stan.map((s, idx) => (
                      <tr key={s.id_asortymentu} style={{ borderBottom: "1px solid var(--border)", background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                        <td style={{ padding: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                          {s.nazwa_asortymentu}
                        </td>
                        <td style={{ padding: "12px", textAlign: "center" }}>
                          <span style={{
                            display: "inline-block", minWidth: 40, padding: "4px 12px",
                            borderRadius: "9999px", fontWeight: 700, fontSize: 14,
                            background: s.magazyn > 0 ? "rgba(34,197,94,0.12)" : "rgba(100,116,139,0.1)",
                            color: s.magazyn > 0 ? "var(--ok)" : "var(--text-muted)",
                            border: `1px solid ${s.magazyn > 0 ? "rgba(34,197,94,0.3)" : "rgba(100,116,139,0.2)"}`,
                          }}>
                            {s.magazyn}
                          </span>
                        </td>
                        {kontrahenciWStan.map(k => {
                          const kStan = s.kontrahenci.find(ck => ck.id === k.id);
                          const ilosc = kStan?.ilosc || 0;
                          return (
                            <td key={k.id} style={{ padding: "12px", textAlign: "center" }}>
                              {ilosc > 0 ? (
                                <span style={{
                                  display: "inline-block", minWidth: 40, padding: "4px 12px",
                                  borderRadius: "9999px", fontWeight: 700, fontSize: 14,
                                  background: "rgba(6,182,212,0.12)", color: "var(--accent)",
                                  border: "1px solid rgba(6,182,212,0.3)"
                                }}>
                                  {ilosc}
                                </span>
                              ) : (
                                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
                              )}
                            </td>
                          );
                        })}
                        <td style={{ padding: "12px", textAlign: "center", fontWeight: 700, color: "var(--text-secondary)", fontSize: 15 }}>
                          {s.lacznie}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Rejestruj ruch ── */}
        {tab === "ruch" && (
          <div style={{ maxWidth: 560 }}>
            {/* Szybkie akcje */}
            <div className="flex gap-2 mb-6">
              {(["PRZYJECIE", "WYDA", "ZWROT", "STRATA"] as const).map(r => {
                const m = RUCH_META[r];
                const active = formRuch === r;
                return (
                  <button
                    key={r}
                    onClick={() => setFormRuch(r)}
                    className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-semibold transition-all"
                    style={{
                      background: active ? m.bg : "var(--bg-card)",
                      border: `2px solid ${active ? m.color : "var(--border)"}`,
                      color: active ? m.color : "var(--text-muted)",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{r === "PRZYJECIE" ? "📥" : r === "WYDA" ? "📤" : r === "ZWROT" ? "🔄" : "⚠️"}</span>
                    {m.label}
                  </button>
                );
              })}
            </div>

            {/* Form fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                  Kartoteka opakowania *
                </label>
                <select
                  value={formAsort}
                  onChange={e => setFormAsort(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)", fontSize: 14 }}
                >
                  <option value="">— wybierz kartotekę —</option>
                  {asortyment.filter(t => t.czy_zwrotne).map(t => (
                    <option key={t.id} value={t.id}>{t.nazwa} ({t.kod_towaru})</option>
                  ))}
                  {asortyment.filter(t => t.czy_zwrotne).length === 0 && (
                    <option disabled>Brak zwrotnych kartotek — skonfiguruj w zakładce Kartoteki</option>
                  )}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                  Ilość (szt.) *
                </label>
                <input
                  type="number"
                  min="1"
                  value={formIlosc}
                  onChange={e => setFormIlosc(e.target.value)}
                  placeholder="np. 5"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)", fontSize: 18, fontWeight: 700, textAlign: "center" }}
                />
              </div>

              {(formRuch === "WYDA" || formRuch === "ZWROT") && (
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                    {formRuch === "WYDA" ? "Wydaję do" : "Zwrot od"} *
                  </label>
                  <select
                    value={formKontrahent}
                    onChange={e => setFormKontrahent(e.target.value)}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)", fontSize: 14 }}
                  >
                    <option value="">— wybierz kontrahenta —</option>
                    {kontrahenci.map(k => (
                      <option key={k.id} value={k.id}>{k.kod} – {k.nazwa}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                  Uwagi
                </label>
                <input
                  type="text"
                  value={formUwagi}
                  onChange={e => setFormUwagi(e.target.value)}
                  placeholder="opcjonalne"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)", fontSize: 14 }}
                />
              </div>

              <button
                onClick={handleSaveRuch}
                disabled={saving}
                className="flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition-all"
                style={{
                  background: "linear-gradient(135deg, var(--accent) 0%, #3b82f6 100%)",
                  border: "none", color: "#fff", fontSize: 15, cursor: saving ? "wait" : "pointer",
                  opacity: saving ? 0.7 : 1, boxShadow: "0 4px 20px rgba(6,182,212,0.3)"
                }}
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : RUCH_META[formRuch]?.icon}
                {saving ? "Zapisuję..." : `Zarejestruj ${RUCH_META[formRuch]?.label.toLowerCase()}`}
              </button>
            </div>
          </div>
        )}

        {/* ── Historia ── */}
        {tab === "historia" && (
          <div>
            {historia.length === 0 ? (
              <div className="text-center py-20" style={{ color: "var(--text-muted)" }}>Brak historii ruchów</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["Data", "Asortyment", "Ruch", "Ilość", "Kontrahent", "Dokument", "Uwagi", ""].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "var(--text-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {historia.map((h, idx) => (
                      <tr key={h.id} style={{ borderBottom: "1px solid var(--border)", background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: "var(--text-muted)", fontSize: 12 }}>{formatDate(h.utworzono_dnia)}</td>
                        <td style={{ padding: "10px 12px", fontWeight: 600 }}>{h.asortyment?.nazwa || "—"}</td>
                        <td style={{ padding: "10px 12px" }}><RuchBadge typ={h.typ_ruchu} /></td>
                        <td style={{ padding: "10px 12px", fontWeight: 700, fontSize: 15, textAlign: "center" }}>{h.ilosc}</td>
                        <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>
                          {h.kontrahent ? <span title={h.kontrahent.nazwa}>{h.kontrahent.kod}</span> : <span style={{ color: "var(--text-muted)" }}>—</span>}
                        </td>
                        <td style={{ padding: "10px 12px", color: "var(--accent)", fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>
                          {h.referencja_dokumentu || "—"}
                        </td>
                        <td style={{ padding: "10px 12px", color: "var(--text-muted)", fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.uwagi || "—"}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <button
                            onClick={() => handleDeleteRuch(h.id)}
                            title="Usuń ruch"
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4, borderRadius: 6, transition: "color 0.15s" }}
                            onMouseEnter={e => (e.currentTarget.style.color = "var(--error)")}
                            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Ustawienia (Kartoteki) ── */}
        {tab === "ustawienia" && (
          <div style={{ maxWidth: 600 }}>
            <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16 }}>
              Zaznacz kartoteki towarowe (z grupy Opakowania), które mają być śledzone jako <strong>zwrotne</strong> (pozetti).
              <br />Pozostałe (plastik jednorazowy) są pomijane w tym module.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {asortyment.map(item => (
                <div
                  key={item.id}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "14px 16px", borderRadius: 12,
                    background: item.czy_zwrotne ? "rgba(167,139,250,0.08)" : "var(--bg-card)",
                    border: `1px solid ${item.czy_zwrotne ? "rgba(167,139,250,0.3)" : "var(--border)"}`,
                    transition: "all 0.15s"
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{item.nazwa}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      Kod: {item.kod_towaru} | J.M.: {item.jednostka_miary}
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleZwrotne(item)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                    style={{
                      background: item.czy_zwrotne ? "rgba(167,139,250,0.15)" : "var(--bg-app)",
                      border: `1px solid ${item.czy_zwrotne ? "rgba(167,139,250,0.4)" : "var(--border)"}`,
                      color: item.czy_zwrotne ? "#a78bfa" : "var(--text-muted)",
                      cursor: "pointer"
                    }}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    {item.czy_zwrotne ? "Zwrotne ✓" : "Nieśledzone"}
                  </button>
                </div>
              ))}
              {asortyment.length === 0 && (
                <div className="text-center py-10" style={{ border: "2px dashed var(--border)", borderRadius: 12 }}>
                  <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                    Brak kartotek asortymentowych typu "Opakowanie".
                    <br />Dodaj je najpierw w module <strong>Asortyment</strong>.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
