# Wytyczne UI/UX — ilGelato MES

Aktualizacja: marzec 2026. Obowiązuje we wszystkich modułach aplikacji.

---

## 1. Globalny wzorzec: „Karta ERP"

**Zasada nadrzędna:** Żaden element w aplikacji nie może używać rozwijanych pasków (akordeonów), inline-editorów ani osobnych stron formularzy. Każdy obiekt danych otwiera się w **jednym modalnym oknie — „Karcie"**, które obsługuje podgląd, tworzenie i edycję.

### Tryby karty

```typescript
type KartaMode = "view" | "edit" | "new";
```

| Tryb | Badge | Akcje w nagłówku | Pola |
|------|-------|-----------------|------|
| `view` | 🟢 Podgląd | **Edytuj**, Archiwizuj, Zamknij | Read-only |
| `edit` | 🟡 Edycja | **Zapisz** (w stopce), Podgląd, Zamknij | Edytowalne |
| `new` | 🔵 Nowy | **Zapisz** (w stopce), Anuluj, Zamknij | Edytowalne |

### Szablon struktury karty (JSX)

```
[MODAL: fixed inset-0 z-50 backdrop-blur-sm]
  └── [KARTA: max-w-3xl rounded-3xl border #334155]
        ├── NAGŁÓWEK: ikona + nazwa + badge-trybu + przyciski-akcji + X
        ├── CIAŁO (overflow-y-auto):
        │     ├── Sekcja: Dane podstawowe
        │     ├── Sekcja: Pozycje / BOM / Składniki
        │     └── Sekcja: QC / Dodatkowe
        └── STOPKA (tylko w trybie edit/new): Anuluj | Zapisz
```

### Zachowanie przycisków

- Kliknięcie wiersza na liście → `openView(item)` → `kartaMode = "view"`
- Przycisk „+ Nowy" → `openNew()` → `kartaMode = "new"`
- Przycisk „Edytuj" wewnątrz karty (tryb view) → `switchToEdit()` → `kartaMode = "edit"` — **bez zamykania okna**
- Przycisk „Zapisz" → submit → po sukcesie API → `openView(savedItem)` → `kartaMode = "view"`
- Przycisk „Podgląd" / „Anuluj" → `switchToView()` lub `closeKarta()`

---

## 2. Architektura DOM i dostępność

- **Interaktywne elementy:** zawsze `<button>` lub `<a href>`. Nigdy `<div onClick>`.
- **Atrybuty testowe:** kluczowe elementy mają `data-testid` (np. `btn-zapisz-recepture`, `input-ilosc-skladnika`).
- **Formularze:** cała logika submit wewnątrz `<form onSubmit={...}>`.
- **Komunikaty:** sukces/błąd mają `role="alert"` oraz `data-testid="komunikat-status"`.

---

## 3. Styl wizualny (Design System)

### Kolory tła
| Warstwa | Kolor |
|---------|-------|
| Aplikacja (tło) | `#0f172a` |
| Panel/Card | `#1e293b` |
| Input/Select | `#334155` |
| Hover/Focus | `#475569` |

### Przyciski akcji (minimalne rozmiary 44×44px)
| Typ | Klasy Tailwind |
|-----|---------------|
| Główna akcja | `bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-semibold` |
| Edytuj | `bg-indigo-600 hover:bg-indigo-700` + ikona `Edit2` |
| Zapis (tryb edit) | `bg-indigo-600 hover:bg-indigo-700` + ikona `Save` |
| Anuluj/Neutral | `bg-[#334155] hover:bg-[#475569] text-slate-300` |
| Niebezpieczna | `bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20` |
| Start prod. | `bg-amber-600 hover:bg-amber-700` |
| Realizacja | `bg-emerald-600 hover:bg-emerald-700` |

### Pola formularza (read-only vs edit)
```jsx
// Tryb edycji:
<input className="w-full bg-[#1e293b] border border-[#334155] focus:border-indigo-500 text-white rounded-xl px-4 py-3 outline-none" />

// Tryb podglądu:
<div className="bg-[#1e293b]/50 border border-[#334155]/50 text-white rounded-xl px-4 py-3">
  {wartość}
</div>
```

### Badge trybów karty
```jsx
// view:  <span className="... bg-emerald-500/20 text-emerald-400">Podgląd</span>
// edit:  <span className="... bg-amber-500/20 text-amber-400">Edycja</span>
// new:   <span className="... bg-indigo-500/20 text-indigo-400">Nowy</span>
```

---

## 4. Ergonomia dla hali produkcyjnej

- **Mobile/Touch-first:** Minimalny rozmiar przycisku 44×44px. Odstępy wykluczają przypadkowe kliknięcia.
- **Wejście danych:** `type="number"` dla ilości, `type="text"` dla kodów i dat.
- **Skaner kodów kreskowych:** Pola partii (LOT) mają `autoFocus` — pracownik skanuje bez dotykania ekranu.
- **Ciemny motyw:** Czytelny w środowisku produkcyjnym (odblaski, zimne oświetlenie).

---

## 5. Nawigacja (aktywne moduły)

| `data-testid` | Moduł | Ikona |
|---------------|-------|-------|
| `nav-pulpit` | Pulpit (Dashboard) | `LayoutDashboard` |
| `nav-asortyment` | Asortyment | `Package` |
| `nav-receptury` | Receptury | `BookOpen` |
| `nav-produkcja` | Produkcja | `Factory` |
| `nav-dokumenty` | Dokumenty (PZ/PW/WZ/RW) | `FileText` |
| `nav-traceability` | Traceability | `GitBranch` |
