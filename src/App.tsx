import React from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router";
import { BookOpen, Factory, Database, LayoutDashboard, FileText, Share2, Users, BarChart2 } from "lucide-react";
import Dashboard from "./pages/Dashboard";
import Asortyment from "./pages/Asortyment";
import Receptury from "./pages/Receptury";
import Produkcja from "./pages/Produkcja";
import Dokumenty from "./pages/Dokumenty";
import Traceability from "./pages/Traceability";
import Kontrahenci from "./pages/Kontrahenci";
import Raporty from "./pages/Raporty";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Pulpit", testId: "nav-dashboard" },
  { to: "/asortyment", icon: Database, label: "Asortyment", testId: "nav-asortyment" },
  { to: "/receptury", icon: BookOpen, label: "Receptury", testId: "nav-receptury" },
  { to: "/produkcja", icon: Factory, label: "Produkcja", testId: "nav-produkcja" },
  { to: "/dokumenty", icon: FileText, label: "Dokumenty", testId: "nav-dokumenty" },
  { to: "/kontrahenci", icon: Users, label: "Kontrahenci", testId: "nav-kontrahenci" },
  { to: "/traceability", icon: Share2, label: "Traceability", testId: "nav-traceability" },
  { to: "/raporty", icon: BarChart2, label: "Raporty", testId: "nav-raporty" },
];

function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex text-slate-200 overflow-hidden" style={{ background: 'var(--bg-app)', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Sidebar */}
      <aside
        className="w-16 lg:w-64 flex flex-col shrink-0 print-hidden"
        style={{ background: 'var(--bg-surface)', borderRight: '1px solid var(--border)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div
            className="w-8 h-8 rounded flex items-center justify-center shrink-0"
            style={{ background: 'var(--accent)', opacity: 0.9 }}
          >
            <Factory className="w-4 h-4 text-white" />
          </div>
          <div className="hidden lg:block overflow-hidden">
            <h1 className="text-white font-bold text-sm leading-tight tracking-wide">ilGelato MES</h1>
            <p className="text-xs leading-none mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Produkcja i Magazyn
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label, testId }) => (
            <NavLink
              key={to}
              to={to}
              data-testid={testId}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors relative ${
                  isActive ? "text-white" : "hover:text-white"
                }`
              }
              style={({ isActive }) => ({
                background: isActive ? 'var(--accent-dim)' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              })}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="hidden lg:block whitespace-nowrap">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Status systemu */}
        <div className="hidden lg:block px-4 py-3 border-t text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
            <span className="font-medium" style={{ color: 'var(--ok)' }}>Operacyjny</span>
          </div>
          <div>
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
