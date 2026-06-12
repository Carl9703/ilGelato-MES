import React, { useState, useEffect } from "react";
import { Plus, Trash2, KeyRound, ShieldAlert } from "lucide-react";

type User = {
  id: string;
  login: string;
  czy_aktywne: boolean;
  utworzono_dnia: string;
};

export default function Uzytkownicy() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [showAdd, setShowAdd] = useState(false);
  const [newLogin, setNewLogin] = useState("");
  const [newPassword, setNewPassword] = useState("");
  
  const [editingLoginId, setEditingLoginId] = useState<string | null>(null);
  const [editLoginValue, setEditLoginValue] = useState("");

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/auth/users", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Błąd pobierania użytkowników");
      const data = await res.json();
      setUsers(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/auth/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ login: newLogin, haslo: newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setShowAdd(false);
      setNewLogin("");
      setNewPassword("");
      fetchUsers();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleEditLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLoginId) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/auth/users/${editingLoginId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ login: editLoginValue })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd podczas zmiany loginu");
      
      setEditingLoginId(null);
      setEditLoginValue("");
      fetchUsers();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/auth/users/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ czy_aktywne: !current })
      });
      if (!res.ok) throw new Error("Błąd aktualizacji");
      fetchUsers();
    } catch (e: any) {
      alert(e.message);
    }
  };

  if (loading) return <div className="text-white text-sm p-4">Ładowanie...</div>;

  return (
    <div className="flex flex-col gap-4 animate-view h-full">
      <div className="flex justify-between items-end">
        <div>
          <h3 className="text-sm font-bold text-white mb-1">Konta dostępowe</h3>
          <p className="text-[11px] text-slate-400">Zarządzanie operatorami i logowaniem do systemu</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/50 hover:bg-orange-500 hover:text-white transition-colors text-xs font-semibold"
        >
          <Plus className="w-3.5 h-3.5" /> Dodaj użytkownika
        </button>
      </div>

      {error && <div className="text-red-400 text-xs bg-red-400/10 p-2 rounded">{error}</div>}

      <div className="grid gap-2 overflow-y-auto min-h-0 pr-1">
        {users.map(u => (
          <div key={u.id} className="bg-[var(--bg-panel)] border border-[var(--border)] rounded-lg p-3 flex justify-between items-center">
            <div>
              <div className="font-bold text-white flex items-center gap-2">
                {u.login}
                {!u.czy_aktywne && (
                  <span className="text-[9px] uppercase tracking-widest bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded border border-red-500/30">
                    Zablokowane
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                ID: {u.id} • Utworzono: {new Date(u.utworzono_dnia).toLocaleString()}
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => { setEditingLoginId(u.id); setEditLoginValue(u.login); }}
                className="text-[10px] font-bold px-2 py-1 rounded border border-slate-500/30 text-slate-300 hover:bg-slate-500/20 transition-colors"
              >
                Edytuj login
              </button>
              <button
                onClick={() => handleToggleActive(u.id, u.czy_aktywne)}
                className={`text-[10px] font-bold px-2 py-1 rounded border transition-colors ${u.czy_aktywne ? 'border-orange-500/30 text-orange-400 hover:bg-orange-500/10' : 'border-green-500/30 text-green-400 hover:bg-green-500/10'}`}
              >
                {u.czy_aktywne ? "Zablokuj" : "Odblokuj"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-app)] border border-[var(--border)] rounded-xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="px-4 py-3 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg-panel)]">
              <h3 className="font-bold text-white text-sm">Nowy użytkownik</h3>
            </div>
            <form onSubmit={handleAdd} className="p-4 flex flex-col gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Login</label>
                <input
                  autoFocus
                  required
                  value={newLogin}
                  onChange={e => setNewLogin(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] text-white rounded px-2.5 py-1.5 outline-none focus:border-orange-500 text-sm"
                  placeholder="np. operator2"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Hasło</label>
                <input
                  required
                  type="password"
                  minLength={4}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] text-white rounded px-2.5 py-1.5 outline-none focus:border-orange-500 text-sm"
                  placeholder="min. 4 znaki"
                />
              </div>
              
              <div className="bg-orange-500/10 border border-orange-500/30 rounded p-2 flex gap-2 mt-2">
                <ShieldAlert className="w-4 h-4 text-orange-400 shrink-0" />
                <p className="text-xs text-orange-400 leading-tight">
                  Użytkownik otrzyma natychmiastowy dostęp do wszystkich funkcji systemu. Role i ograniczenia dostępu nie są obecnie zaimplementowane.
                </p>
              </div>

              <div className="flex gap-2 justify-end mt-4">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="px-3 py-1.5 rounded text-xs font-semibold text-slate-400 hover:bg-[var(--bg-panel)]"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded text-xs font-bold bg-orange-500 text-white hover:bg-orange-600 shadow-lg"
                >
                  Utwórz konto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingLoginId && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-app)] border border-[var(--border)] rounded-xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="px-4 py-3 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg-panel)]">
              <h3 className="font-bold text-white text-sm">Edytuj login</h3>
            </div>
            <form onSubmit={handleEditLoginSubmit} className="p-4 flex flex-col gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Nowy login</label>
                <input
                  autoFocus
                  required
                  value={editLoginValue}
                  onChange={e => setEditLoginValue(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] text-white rounded px-2.5 py-1.5 outline-none focus:border-orange-500 text-sm"
                  placeholder="Login"
                />
              </div>

              <div className="flex gap-2 justify-end mt-4">
                <button
                  type="button"
                  onClick={() => setEditingLoginId(null)}
                  className="px-3 py-1.5 rounded text-xs font-semibold text-slate-400 hover:bg-[var(--bg-panel)]"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded text-xs font-bold bg-orange-500 text-white hover:bg-orange-600 shadow-lg"
                >
                  Zapisz
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
