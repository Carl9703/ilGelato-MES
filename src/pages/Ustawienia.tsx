import React, { useState } from "react";
import { Settings, Tag } from "lucide-react";
import GrupyTowarowe from "./GrupyTowarowe";

type Tab = {
  id: string;
  label: string;
  icon: React.ElementType;
  component: React.ReactNode;
};

const tabs: Tab[] = [
  {
    id: "grupy-towarowe",
    label: "Grupy towarowe",
    icon: Tag,
    component: <GrupyTowarowe />,
  },
  // Tutaj łatwo dodać kolejne zakładki ustawień, np.:
  // { id: "jednostki", label: "Jednostki miary", icon: Ruler, component: <Jednostki /> },
  // { id: "uzytkownicy", label: "Użytkownicy", icon: Users, component: <Uzytkownicy /> },
];

export default function Ustawienia() {
  const [activeTab, setActiveTab] = useState(tabs[0].id);
  const current = tabs.find(t => t.id === activeTab)!;

  return (
    <div className="h-full flex flex-col gap-0 animate-view">

      {/* ── Page header ── */}
      <div className="shrink-0 flex items-center gap-3 mb-4">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}
        >
          <Settings className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white leading-tight">Ustawienia</h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Konfiguracja słowników i parametrów systemu
          </p>
        </div>
      </div>

      {/* ── Layout: sidebar tabs + content ── */}
      <div className="flex-1 min-h-0 flex gap-4">

        {/* ── Tab sidebar ── */}
        <div
          className="w-48 shrink-0 rounded-xl py-2 flex flex-col gap-0.5"
          style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', alignSelf: 'start' }}
        >
          <div className="px-3 pb-2 pt-1">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Słowniki
            </span>
          </div>
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`settings-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2.5 mx-2 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left"
                style={{
                  background: isActive ? 'var(--accent-dim)' : 'transparent',
                  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                  border: isActive ? '1px solid var(--border-accent)' : '1px solid transparent',
                }}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="whitespace-nowrap">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Tab content ── */}
        <div className="flex-1 min-h-0 min-w-0 flex flex-col">
          {current.component}
        </div>
      </div>
    </div>
  );
}
