import { useState, useEffect } from "react";
import { AlertTriangle, Package, Factory, Clock, TrendingUp, AlertCircle, Share2, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router";
import { fmtL } from "../utils/fmt";
import { Spinner } from "../components/Spinner";

type DashboardData = {
  zlecenia: { planowane: number; w_toku: number; zrealizowane: number };
  alerty_waznosc: { typ: string; asortyment: string; numer_partii: string; termin_waznosci: string; stan: number; jednostka: string }[];
  ilosc_partii_na_magazynie: number;
};

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetch("/api/dashboard").then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner.Page />;
  if (!data) return null;

  const hasAlerts = data.alerty_waznosc.length > 0;

  return (
    <div className="h-full flex flex-col gap-3 animate-view">
      {/* Nagłówek */}
      <div className="flex items-baseline justify-between shrink-0">
        <div>
          <h2 className="text-lg font-bold leading-tight" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Pulpit operacyjny</h2>
          <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--text-muted)' }}>
            {new Date().toLocaleDateString("pl-PL", { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Metryki */}
      <div className="grid grid-cols-4 gap-3 shrink-0">
        {[
          { label: "Planowane",        value: data.zlecenia.planowane,        icon: Clock,      color: 'var(--info)',           bg: 'rgba(56,189,248,0.06)' },
          { label: "W toku",           value: data.zlecenia.w_toku,           icon: Factory,    color: 'var(--warn)',           bg: 'rgba(245,158,11,0.06)' },
          { label: "Zrealizowane",     value: data.zlecenia.zrealizowane,     icon: TrendingUp, color: 'var(--ok)',             bg: 'rgba(16,185,129,0.06)' },
          { label: "Partie na stanie", value: data.ilosc_partii_na_magazynie, icon: Package,    color: 'var(--accent)',         bg: 'rgba(6,182,212,0.06)' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div
            key={label}
            className="rounded-lg px-5 py-4 flex items-center gap-4"
            style={{ background: bg, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${bg}`, border: `1px solid ${color}22` }}>
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
            <div>
              <div className="text-2xl font-bold leading-none" style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
              <div className="text-[10px] font-semibold uppercase tracking-widest mt-1" style={{ color: 'var(--text-muted)' }}>
                {label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Szybka nawigacja */}
      <div className="flex gap-2 shrink-0">
        {[
          { to: "/produkcja", icon: Factory, label: "Zlecenia produkcyjne" },
          { to: "/traceability", icon: Share2, label: "Traceability" },
        ].map(({ to, icon: Icon, label }) => (
          <button
            key={to}
            onClick={() => navigate(to)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150"
            style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-accent)';
              (e.currentTarget as HTMLElement).style.color = 'var(--accent)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
              (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
            }}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            <ChevronRight className="w-3 h-3 opacity-40" />
          </button>
        ))}
      </div>

      {/* Alerty ważności */}
      <div className="rounded-lg overflow-hidden flex-1 min-h-0 overflow-y-auto" style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}>
        <div
          className="flex items-center justify-between px-4 py-3 sticky top-0 z-10"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}
        >
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            <AlertTriangle className="w-3.5 h-3.5" style={{ color: 'var(--warn)' }} />
            Centrum alertów
          </div>
          {hasAlerts && (
            <span className="badge badge-danger">{data.alerty_waznosc.length} aktywne</span>
          )}
        </div>

        {hasAlerts ? (
          <table className="mes-table">
            <thead>
              <tr>
                <th>Asortyment</th>
                <th>Numer partii</th>
                <th>Stan</th>
                <th>Termin ważności</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.alerty_waznosc.map((a, i) => (
                <tr key={i}>
                  <td className="font-medium text-white">{a.asortyment}</td>
                  <td className="mono" style={{ color: 'var(--text-code)' }}>{a.numer_partii}</td>
                  <td className="mono">{fmtL(a.stan, 1)} <span className="text-xs uppercase" style={{ color: 'var(--text-muted)' }}>{a.jednostka}</span></td>
                  <td className="mono" style={{ color: 'var(--text-secondary)' }}>
                    {new Date(a.termin_waznosci).toLocaleDateString("pl-PL")}
                  </td>
                  <td>
                    {a.typ === "PRZETERMINOWANE"
                      ? <span className="badge badge-danger"><AlertCircle className="w-3 h-3" />Przeterminowane</span>
                      : <span className="badge badge-warn"><AlertCircle className="w-3 h-3" />Wygasa wkrótce</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-4 py-6 flex items-center gap-3 text-sm" style={{ color: 'var(--text-muted)' }}>
            <TrendingUp className="w-4 h-4" style={{ color: 'var(--ok)' }} />
            <span>Brak aktywnych alertów jakościowych lub magazynowych.</span>
          </div>
        )}
      </div>
    </div>
  );
}
