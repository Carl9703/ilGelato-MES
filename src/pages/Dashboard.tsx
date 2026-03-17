import { useState, useEffect } from "react";
import { AlertTriangle, Package, Factory, Clock, TrendingUp, AlertCircle, Share2, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router";

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

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!data) return null;

  const hasAlerts = data.alerty_waznosc.length > 0;

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Nagłówek */}
      <div className="flex items-baseline justify-between shrink-0">
        <div>
          <h2 className="text-lg font-bold text-white tracking-wide">Pulpit operacyjny</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {new Date().toLocaleDateString("pl-PL", { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Pasek statusu — 4 metryki w jednej belce */}
      <div className="rounded mes-panel grid grid-cols-4">
        {[
          { label: "Planowane",        value: data.zlecenia.planowane,        icon: Clock,      color: 'var(--info)' },
          { label: "W toku",           value: data.zlecenia.w_toku,           icon: Factory,    color: 'var(--warn)' },
          { label: "Zrealizowane",     value: data.zlecenia.zrealizowane,     icon: TrendingUp, color: 'var(--ok)'   },
          { label: "Partie na stanie", value: data.ilosc_partii_na_magazynie, icon: Package,    color: 'var(--text-secondary)' },
        ].map(({ label, value, icon: Icon, color }, i) => (
          <div
            key={label}
            className="px-6 py-4 flex items-center gap-4"
            style={{ borderLeft: i > 0 ? '1px solid var(--border)' : 'none' }}
          >
            <Icon className="w-4 h-4 shrink-0" style={{ color }} />
            <div>
              <div className="text-xl font-bold font-mono text-white leading-none">{value}</div>
              <div className="text-[10px] font-semibold uppercase tracking-widest mt-1" style={{ color: 'var(--text-muted)' }}>
                {label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Szybka nawigacja — kompaktowe linki, nie kafelki */}
      <div className="flex gap-2 shrink-0">
        <button
          onClick={() => navigate("/produkcja")}
          className="btn-hover-effect flex items-center gap-2 px-4 py-2 rounded text-sm font-medium"
          style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
        >
          <Factory className="w-3.5 h-3.5" />
          Zlecenia produkcyjne
          <ChevronRight className="w-3 h-3 opacity-40" />
        </button>
        <button
          onClick={() => navigate("/traceability")}
          className="btn-hover-effect flex items-center gap-2 px-4 py-2 rounded text-sm font-medium"
          style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
        >
          <Share2 className="w-3.5 h-3.5" />
          Traceability
          <ChevronRight className="w-3 h-3 opacity-40" />
        </button>
      </div>

      {/* Alerty ważności */}
      <div className="rounded mes-panel overflow-hidden flex-1 min-h-0 overflow-y-auto">
        <div
          className="flex items-center justify-between px-4 py-3"
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
                  <td className="mono">{a.stan.toFixed(1)} <span className="text-xs uppercase" style={{ color: 'var(--text-muted)' }}>{a.jednostka}</span></td>
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
