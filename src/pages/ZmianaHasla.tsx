import React, { useState } from "react";
import { KeyRound, CheckCircle } from "lucide-react";

export default function ZmianaHasla() {
  const [stare, setStare] = useState("");
  const [nowe, setNowe] = useState("");
  const [potwierdz, setPotwierdz] = useState("");
  const [blad, setBlad] = useState<string | null>(null);
  const [sukces, setSukces] = useState(false);
  const [ladowanie, setLadowanie] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBlad(null);
    setSukces(false);
    if (nowe !== potwierdz) {
      setBlad("Nowe hasło i potwierdzenie nie są zgodne");
      return;
    }
    setLadowanie(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stare_haslo: stare, nowe_haslo: nowe }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBlad(data.error || "Błąd zmiany hasła");
        return;
      }
      setSukces(true);
      setStare(""); setNowe(""); setPotwierdz("");
    } catch {
      setBlad("Brak połączenia z serwerem");
    } finally {
      setLadowanie(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "9px 12px",
    background: "var(--bg-input)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    color: "var(--text-primary)",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", maxWidth: "380px" }}
    >
      <div className="flex items-center gap-2 mb-5">
        <KeyRound className="w-4 h-4" style={{ color: "var(--accent)" }} />
        <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
          Zmiana hasła
        </span>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Aktualne hasło
          </label>
          <input
            type="password"
            value={stare}
            onChange={e => setStare(e.target.value)}
            required
            autoComplete="current-password"
            style={inputStyle}
            onFocus={e => (e.target.style.borderColor = "var(--accent)")}
            onBlur={e => (e.target.style.borderColor = "var(--border)")}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Nowe hasło
          </label>
          <input
            type="password"
            value={nowe}
            onChange={e => setNowe(e.target.value)}
            required
            autoComplete="new-password"
            style={inputStyle}
            onFocus={e => (e.target.style.borderColor = "var(--accent)")}
            onBlur={e => (e.target.style.borderColor = "var(--border)")}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Powtórz nowe hasło
          </label>
          <input
            type="password"
            value={potwierdz}
            onChange={e => setPotwierdz(e.target.value)}
            required
            autoComplete="new-password"
            style={inputStyle}
            onFocus={e => (e.target.style.borderColor = "var(--accent)")}
            onBlur={e => (e.target.style.borderColor = "var(--border)")}
          />
        </div>

        {blad && (
          <div
            className="text-xs px-3 py-2 rounded-lg"
            style={{
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.3)",
              color: "#ef4444",
            }}
          >
            {blad}
          </div>
        )}

        {sukces && (
          <div
            className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
            style={{
              background: "rgba(16,185,129,0.12)",
              border: "1px solid rgba(16,185,129,0.3)",
              color: "var(--ok)",
            }}
          >
            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
            Hasło zostało zmienione
          </div>
        )}

        <button
          type="submit"
          disabled={ladowanie}
          style={{
            marginTop: "4px",
            padding: "9px",
            background: ladowanie ? "var(--accent-dim)" : "var(--accent)",
            color: ladowanie ? "var(--accent)" : "#000",
            border: "none",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: ladowanie ? "not-allowed" : "pointer",
          }}
        >
          {ladowanie ? "Zapisywanie..." : "Zmień hasło"}
        </button>
      </form>
    </div>
  );
}
