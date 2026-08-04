import React, { useState, useEffect } from "react";
import { Lock, Zap, Crown, Rocket, Check, X, Star, AlertTriangle } from "lucide-react";

const plans = [
  {
    id: "basic",
    icon: Zap,
    name: "Starter",
    emoji: "⚡",
    price: "49",
    period: "mies.",
    color: "#06b6d4",
    colorDim: "rgba(6,182,212,0.12)",
    colorBorder: "rgba(6,182,212,0.3)",
    badge: null as string | null,
    features: [
      "Dostęp do aplikacji (tak samo jak teraz)",
      "Brak reklam (których i tak nie ma)",
      "Ciemny motyw (który już masz)",
      "Powiadomienia e-mail o niczym",
      "Wsparcie: ±14 dni roboczych",
    ],
    joke: "Idealny jeśli lubisz przepłacać za rzeczy, które już masz.",
  },
  {
    id: "pro",
    icon: Crown,
    name: "Pro",
    emoji: "👑",
    price: "199",
    period: "mies.",
    color: "#f59e0b",
    colorDim: "rgba(245,158,11,0.12)",
    colorBorder: "rgba(245,158,11,0.35)",
    badge: "NAJPOPULARNIEJSZY" as string | null,
    features: [
      "Wszystko z planu Starter",
      "Eksport PDF (działa raz na miesiąc)",
      "Dostęp do przyszłych funkcji (TBD™)",
      "Certyfikat ukończenia onboardingu",
      "Zdjęcie z CEO (dostawa: 3–5 lat)",
    ],
    joke: "Wybierany przez 0 z 1 zadowolonych klientów.",
  },
  {
    id: "enterprise",
    icon: Rocket,
    name: "Enterprise",
    emoji: "🚀",
    price: "999",
    period: "mies.",
    color: "#a855f7",
    colorDim: "rgba(168,85,247,0.12)",
    colorBorder: "rgba(168,85,247,0.35)",
    badge: "POLECAMY" as string | null,
    features: [
      "Wszystko z planu Pro",
      "Dedykowany opiekun (bot GPT-3)",
      "SLA 99.9% (nie dot. weekendów i świąt)",
      "Integracja z dowolnym systemem (Excel)",
      "Szkolenie dla pracowników (YouTube)",
    ],
    joke: "Dla tych, którzy wierzą w wartość dodaną.",
  },
];

export default function PremiumModal() {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [dots, setDots] = useState(".");

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!showPurchaseModal) return;
    const t = setInterval(() => setDots(d => d.length >= 3 ? "." : d + "."), 500);
    return () => clearInterval(t);
  }, [showPurchaseModal]);

  function handleClose() {
    setClosing(true);
    setTimeout(() => { setVisible(false); setClosing(false); }, 300);
  }

  function handleBuy(planId: string) {
    setSelectedPlan(planId);
    setShowConfetti(true);
    setTimeout(() => { setShowConfetti(false); setShowPurchaseModal(true); }, 1000);
  }

  function handlePurchaseClose() {
    setShowPurchaseModal(false);
    handleClose();
  }

  if (!visible) return null;

  const plan = plans.find(p => p.id === selectedPlan);

  // ── Purchase confirmation troll modal ──
  if (showPurchaseModal && plan) {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(8,12,20,0.92)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(8px)",
        animation: "fadeIn 0.25s ease",
      }}>
        <div style={{
          background: "linear-gradient(135deg, #0d1320 0%, #121929 100%)",
          border: "1px solid rgba(16,185,129,0.4)",
          borderRadius: 20,
          padding: "36px",
          maxWidth: 430,
          width: "90%",
          textAlign: "center",
          boxShadow: "0 0 60px rgba(16,185,129,0.2), 0 24px 60px rgba(0,0,0,0.7)",
          animation: "slideUp 0.35s cubic-bezier(0.34,1.56,0.64,1)",
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "rgba(16,185,129,0.15)", border: "2px solid rgba(16,185,129,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px", fontSize: 30,
          }}>🎉</div>
          <h2 style={{ fontSize: 21, fontWeight: 700, color: "#10b981", marginBottom: 8 }}>
            Płatność przetworzona!
          </h2>
          <p style={{ color: "#6b8aaa", fontSize: 14, marginBottom: 14, lineHeight: 1.6 }}>
            Dziękujemy za zakup planu <strong style={{ color: "#dde8f5" }}>{plan.name} {plan.emoji}</strong>!
            Twoja płatność jest właśnie przetwarzana{dots}
          </p>
          <div style={{
            background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
            borderRadius: 10, padding: "12px 14px", marginBottom: 14, textAlign: "left",
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <AlertTriangle style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }} size={15} />
              <p style={{ color: "#f59e0b", fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                <strong>Ważna informacja:</strong> Twoja karta została obciążona kwotą{" "}
                <strong>{plan.price} zł</strong>. Aktywacja może potrwać 3–5 dni roboczych
                lub nigdy — w zależności od obrotu księżyca.
              </p>
            </div>
          </div>
          <p style={{ color: "#3d5570", fontSize: 12, marginBottom: 20 }}>
            Potwierdzenie wysłano na e-mail, którego nie podałeś/aś.<br />
            Sprawdź folder SPAM, Kosz oraz pod wycieraczką.
          </p>
          <button
            onClick={handlePurchaseClose}
            style={{
              width: "100%", padding: "12px", borderRadius: 10, border: "none",
              background: "linear-gradient(135deg, #10b981, #059669)",
              color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer",
              boxShadow: "0 4px 20px rgba(16,185,129,0.3)",
            }}
          >
            Super, nie mogę się doczekać! 🎊
          </button>
          <p style={{ color: "#3d5570", fontSize: 10, marginTop: 10 }}>
            Klikając przycisk, akceptujesz Warunki Usługi (145 stron, PDF, PL/EN/DE/Klingon).
          </p>
        </div>
      </div>
    );
  }

  // ── Main premium modal ──
  return (
    <>
      {showConfetti && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, pointerEvents: "none" }}>
          {Array.from({ length: 40 }).map((_, i) => (
            <div key={i} style={{
              position: "absolute", width: 8, height: 8,
              borderRadius: Math.random() > 0.5 ? "50%" : 2,
              background: ["#06b6d4","#f59e0b","#10b981","#a855f7","#f43f5e","#38bdf8"][i % 6],
              left: `${Math.random() * 100}%`, top: "-10px",
              animation: `confettiFall ${1 + Math.random() * 1.5}s ease-in ${Math.random() * 0.5}s forwards`,
            }} />
          ))}
        </div>
      )}

      <div style={{
        position: "fixed", inset: 0, zIndex: 9998,
        background: "rgba(8,12,20,0.88)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(10px)",
        animation: closing ? "fadeOut 0.3s ease forwards" : "fadeIn 0.3s ease",
        padding: "16px",
      }}>
        {/* Modal container — wysokość dynamicznie dopasowana do okna */}
        <div style={{
          background: "linear-gradient(160deg, #0d1320 0%, #0a1220 50%, #080c14 100%)",
          border: "1px solid rgba(6,182,212,0.2)",
          borderRadius: 22,
          width: "100%",
          maxWidth: 980,
          height: "calc(100dvh - 32px)",
          maxHeight: 760,
          boxShadow: "0 0 80px rgba(6,182,212,0.08), 0 32px 80px rgba(0,0,0,0.8)",
          animation: closing ? "slideDown 0.3s ease forwards" : "slideUp 0.4s cubic-bezier(0.34,1.56,0.64,1)",
          display: "flex",
          flexDirection: "column",
        }}>

          {/* ── Header ── */}
          <div style={{
            padding: "22px 28px 16px",
            textAlign: "center",
            flexShrink: 0,
          }}>
            {/* Kłódka inline z tytułem */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 10 }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                background: "linear-gradient(135deg, rgba(244,63,94,0.2), rgba(244,63,94,0.05))",
                border: "1.5px solid rgba(244,63,94,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 0 24px rgba(244,63,94,0.2)",
              }}>
                <Lock size={20} style={{ color: "#f43f5e" }} />
              </div>

              <div style={{ textAlign: "left" }}>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)",
                  borderRadius: 999, padding: "3px 11px", marginBottom: 5,
                }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#f43f5e", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    ⚠ Dostęp zablokowany
                  </span>
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: "#dde8f5", margin: 0, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                  Twój dostęp do{" "}
                  <span style={{
                    background: "linear-gradient(135deg, #06b6d4, #a855f7)",
                    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                  }}>ilGelato MES</span>{" "}wygasł
                </h2>
              </div>
            </div>

            <p style={{ color: "#6b8aaa", fontSize: 13, margin: 0, lineHeight: 1.5 }}>
              Aby kontynuować korzystanie z systemu MES, wykup jeden z planów subskrypcyjnych.
            </p>
            <p style={{ color: "#3d5570", fontSize: 11, margin: "4px 0 0" }}>
              * Ceny netto + VAT 23% + opłata manipulacyjna + podatek od deszczu
            </p>
          </div>

          {/* ── Plans — zajmują dostępne miejsce ── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 14,
            padding: "0 18px",
            flex: 1,
            minHeight: 0,
          }}>
            {plans.map((p) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.id}
                  style={{
                    background: p.badge
                      ? `linear-gradient(160deg, ${p.colorDim} 0%, rgba(0,0,0,0) 100%)`
                      : "rgba(255,255,255,0.02)",
                    border: `1px solid ${p.badge ? p.colorBorder : "rgba(255,255,255,0.06)"}`,
                    borderRadius: 16,
                    padding: p.badge ? "24px 18px 18px" : "18px",
                    position: "relative",
                    transition: "transform 0.2s, box-shadow 0.2s",
                    boxShadow: p.badge ? `0 0 36px ${p.colorDim}` : "none",
                    display: "flex", flexDirection: "column",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)";
                    (e.currentTarget as HTMLDivElement).style.boxShadow = `0 12px 36px ${p.colorDim}`;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                    (e.currentTarget as HTMLDivElement).style.boxShadow = p.badge ? `0 0 36px ${p.colorDim}` : "none";
                  }}
                >
                  {p.badge && (
                    <div style={{
                      position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                      background: `linear-gradient(135deg, ${p.color}, ${p.color}cc)`,
                      color: "#fff", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                      padding: "3px 12px", borderRadius: 999, whiteSpace: "nowrap",
                      boxShadow: `0 4px 12px ${p.colorDim}`,
                    }}>
                      {p.badge}
                    </div>
                  )}

                  {/* Ikona + nazwa */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                      background: p.colorDim, border: `1px solid ${p.colorBorder}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Icon size={18} style={{ color: p.color }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#dde8f5", lineHeight: 1.2 }}>
                        {p.name} {p.emoji}
                      </div>
                      <div style={{ fontSize: 10, color: "#3d5570" }}>ilGelato MES</div>
                    </div>
                  </div>

                  {/* Cena */}
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 30, fontWeight: 800, color: p.color, lineHeight: 1 }}>{p.price} zł</span>
                    <span style={{ fontSize: 12, color: "#3d5570" }}> / {p.period}</span>
                    <div style={{ fontSize: 10, color: "#3d5570", marginTop: 2 }}>Rozliczane rocznie z góry, zwrot niemożliwy</div>
                  </div>

                  {/* Features */}
                  <ul style={{ listStyle: "none", margin: "0 0 10px", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                    {p.features.map((f, i) => (
                      <li key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                        <Check size={12} style={{ color: p.color, flexShrink: 0, marginTop: 2 }} />
                        <span style={{ fontSize: 12, color: "#6b8aaa", lineHeight: 1.4 }}>{f}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Spacer — wypycha żart i przycisk na dół */}
                  <div style={{ flex: 1 }} />

                  {/* Joke */}
                  <div style={{
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 7, padding: "7px 9px", marginBottom: 12,
                  }}>
                    <p style={{ fontSize: 11, color: "#3d5570", margin: 0, fontStyle: "italic", lineHeight: 1.4 }}>
                      💡 {p.joke}
                    </p>
                  </div>

                  {/* CTA */}
                  <button
                    onClick={() => handleBuy(p.id)}
                    style={{
                      width: "100%", padding: "10px", borderRadius: 9,
                      border: `1px solid ${p.colorBorder}`,
                      background: p.badge ? `linear-gradient(135deg, ${p.color}, ${p.color}bb)` : p.colorDim,
                      color: p.badge ? "#fff" : p.color,
                      fontSize: 13, fontWeight: 600, cursor: "pointer",
                      transition: "opacity 0.15s",
                      boxShadow: p.badge ? `0 4px 18px ${p.colorDim}` : "none",
                      flexShrink: 0,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = "0.82")}
                    onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                  >
                    Kup teraz — żałuj wieczność
                  </button>
                </div>
              );
            })}
          </div>

          {/* ── Footer ── */}
          <div style={{
            borderTop: "1px solid rgba(255,255,255,0.05)",
            padding: "14px 22px",
            display: "flex", flexWrap: "wrap",
            alignItems: "center", justifyContent: "space-between", gap: 10,
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", gap: 3 }}>
                {[1,2,3,4,5].map(s => <Star key={s} size={13} fill="#f59e0b" style={{ color: "#f59e0b" }} />)}
              </div>
              <span style={{ fontSize: 12, color: "#3d5570" }}>
                „Bardzo profesjonalne okienko. Zapłaciłem od razu." — <em>anonimowy klient</em>
              </span>
            </div>
            <button
              onClick={handleClose}
              style={{
                background: "transparent", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8, color: "#3d5570", fontSize: 12, cursor: "pointer",
                padding: "6px 14px", display: "flex", alignItems: "center", gap: 6,
                transition: "color 0.15s, border-color 0.15s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.color = "#dde8f5";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.2)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.color = "#3d5570";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.08)";
              }}
            >
              <X size={12} />
              Zamknij i płacz w poduszkę
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes fadeOut { from { opacity: 1 } to { opacity: 0 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(26px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes slideDown { from { opacity: 1; transform: translateY(0) } to { opacity: 0; transform: translateY(18px) } }
        @keyframes confettiFall {
          0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </>
  );
}
