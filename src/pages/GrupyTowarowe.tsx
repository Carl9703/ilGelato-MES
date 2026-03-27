import React, { useState, useEffect, useCallback } from "react";
import {
  Plus, Pencil, Trash2, X, Save, ChevronRight, ChevronDown,
  FolderOpen, Folder, AlertCircle, Tag,
} from "lucide-react";
import { useToast } from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import { Spinner } from "../components/Spinner";

// ─── Types ────────────────────────────────────────────────────────────────────
type Grupa = {
  id: string;
  kod: string;
  nazwa: string;
  id_grupy_nadrzednej: string | null;
  kolejnosc: number;
  czy_aktywne: boolean;
  podgrupy?: Grupa[];
};

type FormState = {
  kod: string;
  nazwa: string;
  id_grupy_nadrzednej: string;
  kolejnosc: string;
};

// ─── Modal (poza głównym komponentem, żeby React nie odmontowywał przy rerenderze) ──
interface GrupaModalProps {
  open: boolean;
  editingId: string | null;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  grupy: Grupa[];
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}

function GrupaModal({ open, editingId, form, setForm, grupy, saving, onSave, onClose }: GrupaModalProps) {
  if (!open) return null;
  const parentName = grupy.find(g => g.id === form.id_grupy_nadrzednej)?.nazwa;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl border overflow-hidden animate-view"
        style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}
            >
              <Tag className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {editingId ? "Edytuj grupę" : "Nowa grupa towarowa"}
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {form.id_grupy_nadrzednej
                  ? `Podgrupa: ${parentName ?? "—"}`
                  : "Grupa główna"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors btn-hover-effect"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Kod */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Kod <span className="text-red-400">*</span>
              </label>
              <input
                id="grp-kod"
                type="text"
                value={form.kod}
                onChange={e => setForm(f => ({ ...f, kod: e.target.value }))}
                placeholder="np. GEL-ML"
                className="w-full rounded-xl px-4 py-2.5 font-mono font-bold text-sm outline-none focus:ring-2 uppercase"
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
                autoFocus
              />
            </div>

            {/* Kolejność */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Kolejność
              </label>
              <input
                id="grp-kolejnosc"
                type="number"
                min="0"
                value={form.kolejnosc}
                onChange={e => setForm(f => ({ ...f, kolejnosc: e.target.value }))}
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 font-mono"
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>

          {/* Nazwa */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Nazwa <span className="text-red-400">*</span>
            </label>
            <input
              id="grp-nazwa"
              type="text"
              value={form.nazwa}
              onChange={e => setForm(f => ({ ...f, nazwa: e.target.value }))}
              placeholder="np. Smaki mleczne"
              className="w-full rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Grupa nadrzędna */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Grupa nadrzędna
            </label>
            <select
              id="grp-parent"
              value={form.id_grupy_nadrzednej}
              onChange={e => setForm(f => ({ ...f, id_grupy_nadrzednej: e.target.value }))}
              className="w-full rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="">— brak (grupa główna) —</option>
              {grupy
                .filter(g => !editingId || g.id !== editingId)
                .map(g => (
                  <option key={g.id} value={g.id}>
                    {g.kod} – {g.nazwa}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4 border-t"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors btn-hover-effect"
            style={{
              background: 'var(--bg-hover)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            Anuluj
          </button>
          <button
            id="grp-save"
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 btn-hover-effect"
            style={{ background: 'var(--accent)' }}
          >
            <Save className="w-4 h-4" />
            {saving ? "Zapisywanie…" : "Zapisz"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Wiersz grupy (poza głównym komponentem) ──────────────────────────────────
interface GroupRowProps {
  g: Grupa;
  isSubgroup?: boolean;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  onEdit: (g: Grupa) => void;
  onAddSub: (parentId: string) => void;
  onDelete: (id: string, nazwa: string) => void;
}

function GroupRow({ g, isSubgroup = false, expanded, onToggleExpand, onEdit, onAddSub, onDelete }: GroupRowProps) {
  const hasChildren = (g.podgrupy?.length ?? 0) > 0;
  const isOpen = expanded.has(g.id);

  return (
    <>
      <div
        className="group flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
        style={{
          background: isSubgroup ? 'var(--bg-surface)' : 'var(--bg-panel)',
          border: `1px solid var(--border)`,
          marginLeft: isSubgroup ? 28 : 0,
          borderLeft: isSubgroup ? '2px solid var(--accent)' : '1px solid var(--border)',
        }}
      >
        {/* Expand / indent indicator */}
        <button
          onClick={() => hasChildren && onToggleExpand(g.id)}
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded transition-colors"
          style={{
            color: hasChildren ? 'var(--text-secondary)' : 'transparent',
            cursor: hasChildren ? 'pointer' : 'default',
            background: hasChildren ? 'var(--bg-hover)' : 'transparent',
          }}
        >
          {hasChildren
            ? isOpen
              ? <ChevronDown className="w-3.5 h-3.5" />
              : <ChevronRight className="w-3.5 h-3.5" />
            : null}
        </button>

        {/* Icon */}
        <span className="shrink-0" style={{ color: isSubgroup ? 'var(--accent)' : 'var(--warn)' }}>
          {isSubgroup ? <Folder className="w-4 h-4" /> : <FolderOpen className="w-4 h-4" />}
        </span>

        {/* Kod badge */}
        <span
          className="font-mono font-bold text-xs shrink-0 px-2 py-1 rounded-lg"
          style={{
            background: isSubgroup ? 'rgba(6,182,212,0.08)' : 'rgba(245,158,11,0.08)',
            color: isSubgroup ? 'var(--accent)' : 'var(--warn)',
            border: `1px solid ${isSubgroup ? 'rgba(6,182,212,0.25)' : 'rgba(245,158,11,0.25)'}`,
            letterSpacing: '0.05em',
          }}
        >
          {g.kod}
        </span>

        {/* Nazwa */}
        <span className="flex-1 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {g.nazwa}
        </span>

        {/* Podgrupy count */}
        {!isSubgroup && hasChildren && (
          <span
            className="text-xs px-2 py-0.5 rounded-full shrink-0 hidden sm:inline-block"
            style={{
              background: 'var(--bg-hover)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
          >
            {g.podgrupy!.length} podgrup
          </span>
        )}

        {/* Kolejność */}
        <span className="text-xs shrink-0 w-6 text-center hidden md:block" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
          {g.kolejnosc}
        </span>

        {/* Actions — widoczne po najechaniu */}
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          {!isSubgroup && (
            <button
              id={`add-sub-${g.id}`}
              onClick={() => onAddSub(g.id)}
              title="Dodaj podgrupę"
              className="px-2 py-1.5 rounded-lg flex items-center gap-1 text-xs font-semibold transition-colors btn-hover-effect"
              style={{
                color: 'var(--accent)',
                background: 'var(--accent-dim)',
                border: '1px solid var(--border-accent)',
              }}
            >
              <Plus className="w-3 h-3" />
              <span className="hidden lg:inline">Podgrupa</span>
            </button>
          )}
          <button
            id={`edit-${g.id}`}
            onClick={() => onEdit(g)}
            title="Edytuj"
            className="p-1.5 rounded-lg transition-colors btn-hover-effect"
            style={{ color: 'var(--text-secondary)', background: 'var(--bg-hover)' }}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            id={`del-${g.id}`}
            onClick={() => onDelete(g.id, g.nazwa)}
            title="Usuń"
            className="p-1.5 rounded-lg transition-colors btn-hover-effect"
            style={{ color: '#f87171', background: 'rgba(239,68,68,0.08)' }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Podgrupy */}
      {hasChildren && isOpen && (
        <div className="space-y-1.5 mt-1.5">
          {g.podgrupy!
            .slice()
            .sort((a, b) => a.kolejnosc - b.kolejnosc)
            .map(sg => (
              <GroupRow
                key={sg.id}
                g={sg}
                isSubgroup
                expanded={expanded}
                onToggleExpand={onToggleExpand}
                onEdit={onEdit}
                onAddSub={onAddSub}
                onDelete={onDelete}
              />
            ))}
        </div>
      )}
    </>
  );
}

// ─── Główna strona ────────────────────────────────────────────────────────────
const emptyForm: FormState = { kod: "", nazwa: "", id_grupy_nadrzednej: "", kolejnosc: "0" };

export default function GrupyTowarowe() {
  const [grupy, setGrupy] = useState<Grupa[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<{ id: string; nazwa: string } | null>(null);

  const { showToast } = useToast();

  const fetchGrupy = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/grupy-towarowe");
      if (res.ok) {
        const data: Grupa[] = await res.json();
        setGrupy(data);
        // Auto-expand wszystkich grup nadrzędnych przy pierwszym załadowaniu
        setExpanded(prev => {
          if (prev.size === 0) return new Set(data.map(g => g.id));
          return prev;
        });
      }
    } catch {
      showToast("Błąd ładowania grup", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGrupy(); }, [fetchGrupy]);

  const openNew = (parentId = "") => {
    setEditingId(null);
    const nextOrder = parentId
      ? (grupy.find(g => g.id === parentId)?.podgrupy?.length ?? 0) + 1
      : grupy.length + 1;
    setForm({ ...emptyForm, id_grupy_nadrzednej: parentId, kolejnosc: String(nextOrder) });
    setShowModal(true);
  };

  const openEdit = (g: Grupa) => {
    setEditingId(g.id);
    setForm({
      kod: g.kod,
      nazwa: g.nazwa,
      id_grupy_nadrzednej: g.id_grupy_nadrzednej ?? "",
      kolejnosc: String(g.kolejnosc),
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.kod.trim() || !form.nazwa.trim()) {
      showToast("Kod i nazwa są wymagane", "error");
      return;
    }
    setSaving(true);
    try {
      const body = {
        kod: form.kod.trim().toUpperCase(),
        nazwa: form.nazwa.trim(),
        id_grupy_nadrzednej: form.id_grupy_nadrzednej || null,
        kolejnosc: parseInt(form.kolejnosc) || 0,
      };
      const url = editingId ? `/api/grupy-towarowe/${editingId}` : "/api/grupy-towarowe";
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Błąd zapisu");
      showToast(editingId ? "Zaktualizowano grupę!" : "Dodano grupę!", "ok");
      setShowModal(false);
      fetchGrupy();
    } catch (e: any) {
      showToast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      const res = await fetch(`/api/grupy-towarowe/${confirmDelete.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Błąd usuwania");
      showToast("Grupa usunięta", "ok");
      setConfirmDelete(null);
      fetchGrupy();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  };

  const toggleExpand = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const totalCount = grupy.reduce((s, g) => s + 1 + (g.podgrupy?.length ?? 0), 0);

  return (
    <div className="h-full flex flex-col gap-4 animate-view">

      {/* ── Header ── */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Tag className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            Grupy towarowe
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {loading ? "Ładowanie…" : `${grupy.length} grup · ${totalCount - grupy.length} podgrup · hierarchia dwupoziomowa`}
          </p>
        </div>
        <button
          id="add-group-btn"
          onClick={() => openNew()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white btn-hover-effect"
          style={{ background: 'var(--accent)', boxShadow: '0 0 20px rgba(6,182,212,0.25)' }}
        >
          <Plus className="w-4 h-4" />
          Nowa grupa
        </button>
      </div>

      {/* ── Info banner ── */}
      <div
        className="flex items-start gap-3 px-4 py-3 rounded-xl shrink-0"
        style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.18)' }}
      >
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Grupy towarowe służą do kategoryzacji asortymentu. System obsługuje hierarchię dwupoziomową
          (np. <span className="font-mono font-bold" style={{ color: 'var(--text-code)' }}>GEL</span> →{" "}
          <span className="font-mono font-bold" style={{ color: 'var(--text-code)' }}>GEL-ML</span>).
          Grupy z asortymentem lub podgrupami nie mogą być usunięte – system poinformuje o konflikcie.
        </p>
      </div>

      {/* ── Lista ── */}
      {loading ? (
        <Spinner.Page />
      ) : grupy.length === 0 ? (
        <div
          className="flex-1 flex flex-col items-center justify-center gap-4 rounded-xl"
          style={{ border: '2px dashed var(--border)' }}
        >
          <FolderOpen className="w-14 h-14" style={{ color: 'var(--text-muted)', opacity: 0.25 }} />
          <div className="text-center">
            <p className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Brak grup towarowych</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Kliknij „Nowa grupa" aby dodać pierwszą kategorię
            </p>
          </div>
          <button
            onClick={() => openNew()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white btn-hover-effect"
            style={{ background: 'var(--accent)' }}
          >
            <Plus className="w-4 h-4" /> Dodaj pierwszą grupę
          </button>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pb-2 pr-1">
          {grupy
            .slice()
            .sort((a, b) => a.kolejnosc - b.kolejnosc)
            .map(g => (
              <GroupRow
                key={g.id}
                g={g}
                expanded={expanded}
                onToggleExpand={toggleExpand}
                onEdit={openEdit}
                onAddSub={openNew}
                onDelete={(id, nazwa) => setConfirmDelete({ id, nazwa })}
              />
            ))}
        </div>
      )}

      {/* ── Modal ── */}
      <GrupaModal
        open={showModal}
        editingId={editingId}
        form={form}
        setForm={setForm}
        grupy={grupy}
        saving={saving}
        onSave={handleSave}
        onClose={() => setShowModal(false)}
      />

      {/* ── Confirm delete ── */}
      <ConfirmModal
        isOpen={!!confirmDelete}
        title="Usuń grupę towarową"
        message={`Czy na pewno chcesz usunąć grupę „${confirmDelete?.nazwa}"? Asortyment przypisany do tej grupy nie zostanie usunięty.`}
        confirmText="Usuń grupę"
        cancelText="Anuluj"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
