import React, { useState, useEffect } from "react";
import { Users, Plus, Pencil, Trash2, X, Save, AlertCircle, Search } from "lucide-react";
import { Spinner } from "../components/Spinner";
import { EmptyState } from "../components/EmptyState";
import { useToast } from "../components/Toast";

type Kontrahent = {
  id: string;
  kod: string;
  nazwa: string;
  adres: string | null;
  czy_aktywne: boolean;
};

type FormData = { kod: string; nazwa: string; adres: string };
const emptyForm = (): FormData => ({ kod: "", nazwa: "", adres: "" });

export default function Kontrahenci() {
  const [kontrahenci, setKontrahenci] = useState<Kontrahent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { showToast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm());
  const [saving, setSaving] = useState(false);

  const fetchKontrahenci = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/kontrahenci");
      if (res.ok) setKontrahenci(await res.json());
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchKontrahenci(); }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && showForm) setShowForm(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showForm]);

  const openAdd = () => {
    setEditId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (k: Kontrahent) => {
    setEditId(k.id);
    setForm({ kod: k.kod, nazwa: k.nazwa, adres: k.adres || "" });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editId ? `/api/kontrahenci/${editId}` : "/api/kontrahenci";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setShowForm(false);
      showToast(editId ? "Kontrahent zaktualizowany." : "Kontrahent dodany.", "ok");
      fetchKontrahenci();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, nazwa: string) => {
    if (!confirm(`Usunąć kontrahenta "${nazwa}"?`)) return;
    try {
      const res = await fetch(`/api/kontrahenci/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast("Kontrahent usunięty.", "ok");
      fetchKontrahenci();
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  const filtered = kontrahenci.filter(k =>
    !search || k.kod.toLowerCase().includes(search.toLowerCase()) || k.nazwa.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Nagłówek */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5" style={{ color: "var(--accent)" }} />
          <h2 className="text-lg font-bold text-white">Kontrahenci</h2>
          <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "var(--bg-surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
            {kontrahenci.length}
          </span>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm text-white transition-colors min-h-[40px]"
          style={{ background: "var(--accent)" }}
        >
          <Plus className="w-4 h-4" /> Dodaj kontrahenta
        </button>
      </div>

      {/* Pasek wyszukiwania */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl shrink-0" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        <Search className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Szukaj po kodzie lub nazwie…"
          className="flex-1 bg-transparent outline-none text-sm"
          style={{ color: "var(--text-primary)" }}
        />
        {search && <button onClick={() => setSearch("")} style={{ color: "var(--text-muted)" }}><X className="w-4 h-4" /></button>}
      </div>

      {/* Tabela */}
      <div className="mes-panel rounded overflow-hidden flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <Spinner.Page />
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center" style={{ color: "var(--text-muted)" }}>
            {search ? "Brak wyników wyszukiwania" : "Brak kontrahentów. Dodaj pierwszego."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
                {["Kod", "Nazwa", "Adres", "Akcje"].map((h, i) => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: i === 3 ? "right" : "left", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(k => (
                <tr key={k.id}
                  style={{ borderBottom: "1px solid var(--border-dim)", transition: "background .1s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "8px 12px", fontFamily: "JetBrains Mono,monospace", fontWeight: 700, color: "var(--accent)" }}>{k.kod}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 600, color: "var(--text-primary)" }}>{k.nazwa}</td>
                  <td style={{ padding: "8px 12px", color: "var(--text-secondary)", fontSize: 12 }}>{k.adres || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(k)} title="Edytuj"
                        className="p-1.5 rounded btn-hover-effect"
                        style={{ color: "var(--accent)", background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)" }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(k.id, k.nazwa)} title="Usuń"
                        className="p-1.5 rounded btn-hover-effect"
                        style={{ color: "#ef4444", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal formularza */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-lg border border-[#334155]">
            <div className="flex justify-between items-center p-5 border-b border-[#334155]">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4" style={{ color: "var(--accent)" }} />
                {editId ? "Edytuj kontrahenta" : "Nowy kontrahent"}
              </h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-[#334155]" style={{ color: "var(--text-muted)" }}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Kod <span className="text-red-400">*</span>
                </label>
                <input
                  type="text" required value={form.kod} onChange={e => setForm(f => ({ ...f, kod: e.target.value }))}
                  placeholder="np. KON-001"
                  className="w-full rounded-xl px-4 py-2.5 font-mono text-sm outline-none"
                  style={{ background: "var(--bg-app)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Nazwa <span className="text-red-400">*</span>
                </label>
                <input
                  type="text" required value={form.nazwa} onChange={e => setForm(f => ({ ...f, nazwa: e.target.value }))}
                  placeholder="Pełna nazwa kontrahenta"
                  className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                  style={{ background: "var(--bg-app)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: "var(--text-muted)" }}>Adres</label>
                <textarea
                  value={form.adres} onChange={e => setForm(f => ({ ...f, adres: e.target.value }))}
                  placeholder="ul. Przykładowa 1, 00-000 Miasto"
                  rows={2}
                  className="w-full rounded-xl px-4 py-2.5 text-sm outline-none resize-none"
                  style={{ background: "var(--bg-app)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors"
                  style={{ color: "var(--text-muted)" }}>
                  Anuluj
                </button>
                <button type="submit" disabled={saving}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm text-white min-h-[40px]"
                  style={{ background: "var(--accent)" }}>
                  <Save className="w-4 h-4" /> {editId ? "Zapisz zmiany" : "Dodaj"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
