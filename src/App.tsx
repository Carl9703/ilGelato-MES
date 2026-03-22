import React from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from "react-router";
import { BookOpen, Factory, Database, LayoutDashboard, FileText, Share2, Users, BarChart2, Package } from "lucide-react";
import logoImg from "./assets/logo.png";
import Dashboard from "./pages/Dashboard";
import Asortyment from "./pages/Asortyment";
import Receptury from "./pages/Receptury";
import Produkcja from "./pages/Produkcja";
import Dokumenty from "./pages/Dokumenty";
import Traceability from "./pages/Traceability";
import Kontrahenci from "./pages/Kontrahenci";
import Raporty from "./pages/Raporty";
import WyrobyGotowe from "./pages/WyrobyGotowe";

const navItems = [
  { to: "/dashboard",  icon: LayoutDashboard, label: "Pulpit",      testId: "nav-dashboard"  },
  { to: "/asortyment", icon: Database,         label: "Asortyment", testId: "nav-asortyment" },
  { to: "/receptury",  icon: BookOpen,          label: "Receptury",  testId: "nav-receptury"  },
  { to: "/produkcja",  icon: Factory,           label: "Produkcja",  testId: "nav-produkcja"  },
  { to: "/dokumenty",  icon: FileText,          label: "Dokumenty",  testId: "nav-dokumenty"  },
  { to: "/wyroby-gotowe", icon: Package,         label: "Wyroby gotowe", testId: "nav-wyroby-gotowe" },
  { to: "/kontrahenci",icon: Users,             label: "Kontrahenci",testId: "nav-kontrahenci"},
  { to: "/traceability",icon: Share2,           label: "Traceability",testId: "nav-traceability"},
  { to: "/raporty",    icon: BarChart2,         label: "Raporty",    testId: "nav-raporty"    },
];

function MainLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return (
    <div className="h-full flex overflow-hidden" style={{ background: 'var(--bg-app)', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", color: 'var(--text-primary)' }}>
      {/* Sidebar */}
      <aside
        className="w-16 lg:w-60 flex flex-col shrink-0 print-hidden"
        style={{
          background: 'linear-gradient(180deg, #0d1825 0%, #080c14 100%)',
          borderRight: '1px solid var(--border)',
          boxShadow: '4px 0 24px rgba(0,0,0,0.4)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <img src={logoImg} alt="ilGelato Logo" className="w-8 h-8 rounded-lg object-contain shrink-0" style={{ boxShadow: '0 0 10px rgba(0,0,0,0.5)' }} />
          <div className="hidden lg:block overflow-hidden">
            <h1 className="font-bold text-sm leading-tight" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>ilGelato MES</h1>
            <p className="text-[10px] font-medium leading-none mt-0.5 uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Produkcja · Magazyn
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto" style={{ gap: '1px', display: 'flex', flexDirection: 'column' }}>
          {navItems.map(({ to, icon: Icon, label, testId }) => (
            <NavLink
              key={to}
              to={to}
              data-testid={testId}
              className={({ isActive }) =>
                `flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 relative ${
                  isActive ? "" : "hover:text-white"
                }`
              }
              style={({ isActive }) => ({
                background: isActive ? 'var(--accent-dim)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                border: isActive ? '1px solid var(--border-accent)' : '1px solid transparent',
                boxShadow: isActive ? 'inset 0 0 20px rgba(6,182,212,0.05)' : 'none',
              })}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="hidden lg:block whitespace-nowrap">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Status systemu */}
        <div className="hidden lg:block px-4 py-3 text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: 'var(--ok)', boxShadow: '0 0 6px var(--ok)' }} />
            <span className="font-semibold" style={{ color: 'var(--ok)' }}>Operacyjny</span>
          </div>
          <div style={{ color: 'var(--text-muted)' }}>
            {new Date().toLocaleDateString("pl-PL", { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden min-w-0 flex flex-col" style={{ background: 'var(--bg-app)' }}>
        <div className="flex-1 min-h-0 p-4 overflow-hidden flex flex-col">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/*" element={
          <MainLayout>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/asortyment" element={<Asortyment />} />
              <Route path="/receptury" element={<Receptury />} />
              <Route path="/produkcja" element={<Produkcja />} />
              <Route path="/dokumenty" element={<Dokumenty />} />
              <Route path="/wyroby-gotowe" element={<WyrobyGotowe />} />
              <Route path="/kontrahenci" element={<Kontrahenci />} />
              <Route path="/traceability" element={<Traceability />} />
              <Route path="/raporty" element={<Raporty />} />
            </Routes>
          </MainLayout>
        } />
      </Routes>
    </BrowserRouter>
  );
}
