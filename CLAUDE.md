# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

System zarządzania produkcją (MES/ERP) dla rzemieślniczej lodziarni.
Interfejs i baza danych w języku **polskim**.

---

## Uruchamianie

```bash
# Frontend (Vite, port 3000)
npm run dev

# Backend (Express, port 3001)
npx tsx server.ts

# Seed przykładowych danych (czyści bazę i wgrywa od zera)
npx tsx prisma/seed.ts
```

**Zmiana schematu Prisma (Windows):** `prisma db push` nie może nadpisać DLL jeśli serwer działa. Kolejność:
```bash
cmd //c "taskkill /F /IM node.exe"   # zabij wszystkie procesy node
npx prisma db push                    # synchronizuj schemat + generuj klienta
npx tsx server.ts                     # uruchom serwer ponownie
```
`pkill` nie działa na Windows bash — używaj `cmd //c "taskkill /F /IM node.exe"`.

---

## Stack techniczny

| Warstwa    | Technologie                                              |
|------------|----------------------------------------------------------|
| Frontend   | React 19, TypeScript, Vite 6, TailwindCSS 4, React Router 7 |
| Backend    | Node.js, Express 4, TypeScript                          |
| Baza danych| SQLite via Prisma 6 ORM                                  |
| Ikony/animacje | Lucide React, Motion                                |

**Plik bazy:** `prisma/dev.db`
**API prefix:** `/api/`

---

## Struktura katalogów

```
src/
  pages/
    Dashboard.tsx       — pulpit operacyjny, metryki, alerty
    Asortyment.tsx      — katalog produktów, stany magazynowe, partie
    Receptury.tsx       — receptury z BOM, wersjonowanie, kalkulator kosztów
    Produkcja.tsx       — zlecenia produkcyjne, kontrola jakości, realizacja
    Dokumenty.tsx       — dokumenty magazynowe PZ/WZ/PW/RW
    Traceability.tsx    — genealogia partii, śledzenie serii
  components/
    AsortymentSelektor.tsx  — modal multi-select produktów (wielokrotne użycie)
    ConfirmModal.tsx         — dialog potwierdzenia (wielokrotne użycie)
  App.tsx               — router główny, nawigacja boczna
prisma/
  schema.prisma         — schemat bazy danych
  seed.ts               — dane przykładowe
server.ts               — API Express (~2500 linii)
docs/                   — dokumentacja domenowa (PL)
```

---

## Modele bazy danych (Prisma)

| Model                     | Opis                                                  |
|---------------------------|-------------------------------------------------------|
| `Asortyment`              | Katalog produktów (surowce, półprodukty, wyroby gotowe) |
| `Partie_Magazynowe`       | Partie/LOTy z datami i statusem                       |
| `Ruchy_Magazynowe`        | Dziennik ruchów (każda transakcja magazynowa)         |
| `Receptury`               | Receptury z wersjami i parametrami produkcji          |
| `Skladniki_Receptury`     | Pozycje BOM (składniki → receptury)                   |
| `Zlecenia_Produkcyjne`    | Zlecenia produkcyjne z planem i realizacją            |
| `Punkty_Kontrolne`        | Punkty kontrolne HACCP (per receptura)                |
| `Wyniki_Kontroli`         | Wyniki pomiaru dla punktów kontrolnych                |
| `Rezerwacje_Magazynowe`   | Rezerwacje surowców pod zlecenia                      |
| `Rejestr_Przestojow`      | Log przestojów dla OEE (tabela istnieje, UI brak)     |
| `Uzytkownicy`             | Użytkownicy systemu (auth uproszczony)                |
| `Sesje_Produkcji_Gelato`  | Sesje produkcyjne gelato (turnus baza → wyroby)       |
| `Pozycje_Sesji_Gelato`    | Smaki/receptury w ramach sesji gelato                 |
| `Opakowania_Wyrobowe`     | Fizyczne opakowania wyrobów gotowych (pozzetti itp.)  |

---

## Typy dokumentów magazynowych

| Symbol | Nazwa                   | Kierunek |
|--------|-------------------------|----------|
| PZ     | Przyjęcie Zewnętrzne    | +magazyn |
| PW     | Przyjęcie Wewnętrzne    | +magazyn (z produkcji) |
| WZ     | Wydanie Zewnętrzne      | -magazyn |
| RW     | Rozchód Wewnętrzny      | -magazyn (zużycie) |

Numeracja: `PREFIX-NNN/MM/RR`, zlecenia: `ZP-NNNN/MM/RR`, sesje: `SP-NNN/MM/RR`, sesje gelato: `SPG-NNN/MM/RR`

---

## Statusy

**Zlecenia produkcyjne:** `Planowane` → `W_toku` → `Zrealizowane` | `Anulowane`

**Partie magazynowe:** `Dostepna` | `Kwarantanna` | `Zablokowana_Kontrola_Jakosci` | `Zutylizowana`

**Rezerwacje:** `Aktywna` | `Zrealizowana` | `Anulowana`

**Sesje gelato:** `Otwarta` | `Zamknieta`

---

## Kluczowe zasady logiki biznesowej

**Partie & FIFO**
- Każdy przyjęty towar tworzy partię (`Partie_Magazynowe`) z numerem LOT
- Selekcja do produkcji: FIFO sortowane po dacie ważności, potem dacie przyjęcia
- Stan magazynowy = `SUM(ilosc)` po aktywnych `Ruchy_Magazynowe` dla danej partii

**Jednostki**
- Każdy produkt ma jednostkę główną (`JM`) i opcjonalną pomocniczą (`JM_pomocnicza`)
- Przelicznik: 1 JM = X JM_pomocnicza
- Kalkulacje zawsze w JM głównej

**Koszty**
- Cena ważona z PZ/PW (weighted average)
- Koszt produkcji = Σ(ilosc_składnika × cena_jednostkowa_składnika)
- Koszt wyrobu = total_koszt_wejść ÷ ilość_wyprodukowana
- Narzut % w recepturze dla kalkulacji ceny sprzedaży

**Traceability**
- Genealogia rekurencyjna: które partie składników → która partia wyrobu
- Powiązanie przez `Ruchy_Magazynowe` (id_zlecenia)

**Kontrola jakości**
- Punkty HACCP definiowane per receptura
- Wymagane punkty blokują realizację zlecenia
- Auto-walidacja min/max przy zapisie wyniku

**Zasoby nieograniczone (`czy_zasob_nieograniczony`)**
- Flag na `Asortyment` dla mediów jak woda z kranu — bez kontroli stanu, bez PZ, bez rezerwacji
- Przy realizacji zlecenia: auto-tworzona wirtualna partia `numer_partii = "AUTO-{kod_towaru}"` i normalny ruch `Zuzycie` na RW (dla traceability)
- Logika w server.ts: `rozpocznij` pomija walidację i rezerwację; `realizuj` obsługuje w sekcji "OPCJA C" po FIFO
- Seed: zasoby nieograniczone nie mają wpisów PZ

---

## Dwa przepływy produkcji w Produkcja.tsx

**Standardowy (ZP — Zlecenia Produkcyjne)**
- Prosty CRUD zleceń ze statusami `Planowane → W_toku → Zrealizowane`
- `POST /api/produkcja/:id/rozpocznij` — walidacja stanu, tworzenie rezerwacji
- `POST /api/produkcja/:id/realizuj` — zużycie składników (RW), przyjęcie wyrobu (PW)
- Realizacja: OPCJA A (ręczne wskazanie partii przez `zuzyte_partie`) lub OPCJA B (auto-FIFO)

**Sesja Gelato (Wizard wielokrokowy)**
- Turnus produkcyjny: etap 1 (baza mleczna) → etap 2 (wyroby gotowe z bazy)
- State wizard: `wizBazaSurowce` (surowce bazy), `wizWyrobySurowceMap` (surowce per wyrób), `wizRealizacja`
- `computeWyrobySurowce()` — przelicza surowce dla wszystkich wyrobów i ładuje partie async
- Typy: `WizSurowiecBaza`, `WizSurowiecWyrob` — oba mają `czy_zasob_nieograniczony: boolean`
- `renderSurowceTable()` — wspólny renderer tabeli surowców dla bazy i wyrobów
- `POST /api/sesja-gelato` — finalizacja całej sesji w jednej transakcji

---

## Wzorce kodu

**Nazewnictwo**
- Kolumny DB: `snake_case` (nazwy polskie), np. `czy_aktywne`, `id_receptury`, `numer_partii`
- TypeScript: `camelCase`
- Prefiksy: `id_`, `czy_` (bool), `numer_`, `kod_`

**Frontend**
- Brak globalnego state managera (tylko `useState`/`useEffect`)
- Bezpośrednie `fetch()` do API (brak wrappera)
- Komponenty stron są samowystarczalne (data fetching + UI w jednym pliku)
- Duże pliki stron (Asortyment, Produkcja > 1500 linii) — normalne dla projektu
- Motyw ciemny z CSS variables: `--bg-app`, `--accent`, `--ok`, `--warn`, itp.

**Asortyment.tsx — dwie ścieżki zapisu**
- `handleSubmit` — modal tworzenia/edycji (wywoływany przez `openNew`/`openEdit`)
- `handleDetailSubmit` — inline panel szczegółów (wywoływany przez przycisk "Zapisz zmiany")
- `useEffect` na `detailData` nadpisuje `formData` przy załadowaniu detali — każde nowe pole w `Asortyment` musi być dodane do WSZYSTKICH `setFormData` wywołań (3 miejsca + useEffect)

**Backend (server.ts)**
- Wszystkie endpointy w jednym pliku
- Transakcje Prisma dla operacji wieloetapowych (PZ, realizacja zlecenia)
- Miękkie usuwanie: `czy_aktywne = false` zamiast DELETE
- Numeracja dokumentów: `generateDocNumber(tx, prefix)`

---

## Ważne ograniczenia (stan aktualny)

- **Autentykacja:** uproszczona, hardcoded user "admin" — nie gotowe na produkcję
- **Testy:** brak suite testów (vitest/jest)
- **OEE:** tabela `Rejestr_Przestojow` istnieje w DB, ale UI nie zaimplementowane
- **QR/Etykiety:** biblioteka `qrcode` zainstalowana, ale nie zaimplementowana w UI
- **PDF/wydruk:** klasy CSS do druku obecne, ale brak stylów printowych
- **Wielomagazynowość:** brak — jeden domyślny magazyn
- **Dostawcy/PO:** brak modułu

---

## Dokumentacja domenowa

W katalogu `docs/` (język polski):
- `strukturabazy.md` — opis schematu DB
- `receptury.md` — logika receptur
- `produkcja.md` — logika produkcji
- `magazyn.md` — logika magazynowa
- `ux_wytyczne.md` — wytyczne UX
- `agents.md` — koncepcja agentów AI
