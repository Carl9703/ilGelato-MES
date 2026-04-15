import React, { useState } from "react";
import { Lock, User, IceCream } from "lucide-react";

interface Props {
  onLogin: (token: string, login: string) => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [login, setLogin] = useState("");
  const [haslo, setHaslo] = useState("");
  const [blad, setBlad] = useState<string | null>(null);
  const [ladowanie, setLadowanie] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBlad(null);
    setLadowanie(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, haslo }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBlad(data.error || "Błąd logowania");
        return;
      }
      onLogin(data.token, data.login);
    } catch {
      setBlad("Brak połączenia z serwerem");
    } finally {
      setLadowanie(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--bg-app)" }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "380px",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "16px",
          padding: "40px 36px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        }}
      >
        {/* Logo / nagłówek */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{ background: "var(--accent-dim)", border: "1px solid var(--border-accent)" }}
          >
            <IceCream className="w-7 h-7" style={{ color: "var(--accent)" }} />
          </div>
          <h1
            className="text-xl font-bold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            ilGelato MES
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Zaloguj się, aby kontynuować
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Login */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Login
            </label>
            <div className="relative">
              <User
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                type="text"
                value={login}
                onChange={e => setLogin(e.target.value)}
                autoComplete="username"
                autoFocus
                required
                placeholder="admin"
                style={{
                  width: "100%",
                  paddingLeft: "36px",
                  paddingRight: "12px",
                  paddingTop: "10px",
                  paddingBottom: "10px",
                  background: "var(--bg-input)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--text-primary)",
                  fontSize: "14px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
                onFocus={e => (e.target.style.borderColor = "var(--accent)")}
                onBlur={e => (e.target.style.borderColor = "var(--border)")}
              />
            </div>
          </div>

          {/* Hasło */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Hasło
            </label>
            <div className="relative">
              <Lock
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                type="password"
                value={haslo}
                onChange={e => setHaslo(e.target.value)}
                autoComplete="current-password"
                required
                placeholder="••••••••"
                style={{
                  width: "100%",
                  paddingLeft: "36px",
                  paddingRight: "12px",
                  paddingTop: "10px",
                  paddingBottom: "10px",
                  background: "var(--bg-input)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--text-primary)",
                  fontSize: "14px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
                onFocus={e => (e.target.style.borderColor = "var(--accent)")}
                onBlur={e => (e.target.style.borderColor = "var(--border)")}
              />
            </div>
          </div>

          {/* Błąd */}
          {blad && (
            <div
              className="text-sm px-3 py-2 rounded-lg"
              style={{
                background: "rgba(239,68,68,0.12)",
                border: "1px solid rgba(239,68,68,0.3)",
                color: "#ef4444",
              }}
            >
              {blad}
            </div>
          )}

          {/* Przycisk */}
          <button
            type="submit"
            disabled={ladowanie}
            style={{
              marginTop: "4px",
              padding: "11px",
              background: ladowanie ? "var(--accent-dim)" : "var(--accent)",
              color: ladowanie ? "var(--accent)" : "#000",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: ladowanie ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {ladowanie ? "Logowanie..." : "Zaloguj się"}
          </button>
        </form>
      </div>
    </div>
  );
}
