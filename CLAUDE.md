# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

System zarządzania produkcją (MES/ERP) dla rzemieślniczej lodziarni.
Interfejs i baza danych w języku **polskim**.

---

## Uruchamianie

```bash
# Frontend (Vite, port 5173)
npm run dev

# Backend (Express, port 3001)
npx tsx server.ts

# Seed przykładowych danych (czyści bazę i wgrywa od zera)
npx tsx prisma/seed.ts

# Tworzenie konta administratora (pierwsza instalacja)
npx tsx prisma/create-admin.ts
```

**Zmiana schematu Prisma (Windows):** `prisma db push` nie może nadpisać DLL jeśli serwer działa. Kolejność:
```bash
cmd //c "taskkill /F /IM node.exe"   # zabij wszystkie procesy node
npx prisma db push                    # synchronizuj schemat + generuj klienta
npx tsx server.ts                     # uruchom serwer ponownie
```
`pkill` nie działa na Windows bash — używaj `cmd //c "taskkill /F /IM node.exe"`.

**Push do test.db** (PowerShell):
```powershell
$env:DATABASE_URL="file:./test.db"; npx prisma db push --skip-generate
```
Ścieżka `file:./test.db` jest **względem katalogu schematu** (`prisma/`), nie roota projektu. Błędna ścieżka `file:./prisma/test.db` tworzy `prisma/prisma/test.db` (nowy pusty plik).

---

## Stack techniczny

| Warstwa    | Technologie                                              |
|------------|----------------------------------------------------------|
| Frontend   | React 19, TypeScript, Vite 6, TailwindCSS 4, React Router 7 |
| Backend    | Node.js, Express 4, TypeScript                          |
| Baza danych| SQLite via Prisma 6 ORM                                  |
| Ikony/animacje | Lucide React, Motion                                |

**Plik bazy:** `prisma/prod.db` (testowa: `prisma/test.db`)
**API prefix:** `/api/` — Vite proxy przekierowuje `/api/*` → `localhost:3001`

---

## Struktura katalogów

```
src/
  pages/
    Dashboard.tsx       — pulpit operacyjny, metryki, alerty
    Asortyment.tsx      — katalog produktów, stany magazynowe, partie
    Receptury.tsx       — receptury z BOM, wersjonowanie, kalkulator kosztów
    Produkcja.tsx       — zlecenia produkcyjne + wizard sesji gelato
    PlanProdukcji.tsx   — planer turnusu (plan → wydruk → rozliczenie)
    Dokumenty.tsx       — dokumenty magazynowe PZ/WZ/PW/RW
    WyrobyGotowe.tsx    — stan opakowań wyrobów gotowych (pozzetti itp.)
    Opakowania.tsx      — cyrkulacja opakowań zwrotnych
    Kontrahenci.tsx     — słownik kontrahentów
    GrupyTowarowe.tsx   — hierarchia grup towarowych
    Traceability.tsx    — genealogia partii, śledzenie serii
    Raporty.tsx         — raporty sprzedaży per kontrahent
    Ustawienia.tsx      — ustawienia konta, zmiana hasła
  components/
    AsortymentSelektor.tsx    — modal multi-select produktów (wielokrotne użycie)
    ConfirmModal.tsx           — dialog potwierdzenia (wielokrotne użycie)
    DocumentPreviewModal.tsx   — podgląd dokumentu magazynowego
    ImportAsortymentuModal.tsx — import asortymentu z Excel
    Toast.tsx                  — system powiadomień (useToast hook)
    Spinner.tsx / EmptyState.tsx / SortableTh.tsx / Modal.tsx
  App.tsx               — router główny, nawigacja boczna
prisma/
  schema.prisma         — schemat bazy danych
  seed.ts               — dane przykładowe
  create-admin.ts       — tworzenie konta admina
server.ts               — API Express (~3700 linii)
docs/                   — dokumentacja domenowa (PL)
```

---

## Modele bazy danych (Prisma)

| Model                     | Opis                                                  |
|---------------------------|-------------------------------------------------------|
| `Asortyment`              | Katalog produktów (surowce, półprodukty, wyroby gotowe) |
| `Grupy_Towarowe`          | Hierarchia grup towarowych (drzewo)                   |
| `Partie_Magazynowe`       | Partie/LOTy z datami i statusem                       |
| `Ruchy_Magazynowe`        | Dziennik ruchów (każda transakcja magazynowa)         |
| `Dokumenty_Magazynowe`    | Nagłówki dokumentów PZ/WZ + pozycje w `pozycje_json`; WZ ma opcjonalne `data_dostawy` |
| `Kontrahenci`             | Słownik dostawców i odbiorców                         |
| `Receptury`               | Receptury z wersjami i parametrami produkcji          |
| `Skladniki_Receptury`     | Pozycje BOM (składniki → receptury)                   |
| `Zlecenia_Produkcyjne`    | Zlecenia produkcyjne z planem i realizacją            |
| `Sesje_Produkcji`         | Grupowanie zleceń w sesję (SP-NNN/MM/RR)              |
| `Rezerwacje_Magazynowe`   | Rezerwacje surowców pod zlecenia                      |
| `Wartosci_Odzywcze`       | Tabela wartości odżywczych per asortyment (1:1)       |
| `Alergeny_Asortymentu`    | 14 alergenów UE per asortyment (1:1)                  |
| `Uzytkownicy`             | Użytkownicy systemu (auth uproszczony)                |
| `Ruchy_Opakowan_Zwrotnych`| Cyrkulacja opakowań zwrotnych (PRZYJECIE/WYDA/ZWROT)  |
| `Sesja_Robocza`           | Persystencja stanu wizarda gelato (jeden rekord)      |
| `Sesja_Robocza_Log`       | Log kroków wizarda gelato                             |

---

## Typy dokumentów magazynowych

| Symbol | Nazwa                   | Kierunek |
|--------|-------------------------|----------|
| PZ     | Przyjęcie Zewnętrzne    | +magazyn |
| PW     | Przyjęcie Wewnętrzne    | +magazyn (z produkcji) |
| WZ     | Wydanie Zewnętrzne      | -magazyn |
| RW     | Rozchód Wewnętrzny      | -magazyn (zużycie) |

Numeracja: `PREFIX-NNN/MM/RR`, zlecenia: `ZP-NNNN/MM/RR`, sesje: `SP-NNN/MM/RR`, sesje gelato: `SPG-NNN/MM/RR`, opakowania: `OW-NNNN/MM/RR`

---

## Statusy

**Zlecenia produkcyjne:** `Planowane` → `W_toku` → `Zrealizowane` | `Anulowane`

**Partie magazynowe:** `Dostepna` | `Kwarantanna` | `Zablokowana_Kontrola_Jakosci` | `Zutylizowana`

**Rezerwacje:** `Aktywna` | `Zrealizowana` | `Anulowana`

**Sesje gelato:** `Otwarta` | `Zamknieta`

**Opakowania wyrobowe:** `Dostepne` | `Wydane` | `Zwrot` | `Zniszczone`

**Dokumenty:** `Bufor` | `Zatwierdzony` | `Anulowany`

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
- Wyświetlanie ilości: `resolveDisplayUnit(asortyment, ilosc_raw)` w `src/utils/fmt.ts` — obsługuje konwersję na kg gdy `JM_pomocnicza = "kg"`. Przy obliczaniu kosztu (wartosc) zawsze używaj `ilosc_raw`, nie przeliczonej ilości.

**Koszty i ceny**
- Cena ważona z PZ/PW (weighted average)
- Koszt produkcji = Σ(ilosc_składnika × cena_jednostkowa_składnika)
- Koszt wyrobu = total_koszt_wejść ÷ ilość_wyprodukowana
- Narzut % w recepturze dla kalkulacji ceny sprzedaży
- `cena_sprzedazy` i `stawka_vat` na `Asortyment` — ręcznie ustawiane dla wyrobów gotowych (zakładka "Ceny")

**Traceability**
- Genealogia rekurencyjna: które partie składników → która partia wyrobu
- Powiązanie przez `Ruchy_Magazynowe` (id_zlecenia)

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
- `POST /api/produkcja/sesja` — finalizacja całej sesji w jednej transakcji
- **Persystencja szkicu:** `GET/PUT/DELETE /api/produkcja/sesja-robocza` — jeden rekord `Sesja_Robocza` przechowuje JSON stanu wizarda; przy wejściu sprawdzany jest szkic

**Planer turnusu (`PlanProdukcji.tsx`, `/planer`)** — szczegóły w `docs/planer_produkcji.md`
- Plan to `Sesje_Produkcji` w statusie `Planowana` + zlecenia `Planowane`, **bez ruchów magazynowych**
- Rozliczenie (`POST /api/produkcja/plany/:id/rozlicz`) dokłada RW/PW/partie na już istniejących zleceniach
- Obie ścieżki (wizard i planer) dzielą funkcję `wykonajSesjeProdukcji()` w `server/routes/produkcja.ts`
- `auto_fifo: true` w body → serwer sam dobiera partie (`dobierzFifo`, `surowceFifoZReceptury`)
- **Uwaga na `wielkosc_produkcji`:** to wydajność (kg wyrobu z mnożnika 1), a nie rozmiar partii.
  `Skladniki_Receptury.ilosc_wymagana` to udziały masowe sumujące się do 1,0.
  `kg wyrobu = suma(mnożników) × wielkosc_produkcji`, `kg surowca = udział × kg wyrobu`

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
- Shared helpers w `src/utils/fmt.ts`: `fmtL`, `fmtDate`, `fmtFull`, `resolveDisplayUnit`
- `isCostDoc = isPW || isRW || isPZ` — flaga używana w `DocumentPreviewModal` i `printDoc.ts` dla sekcji kosztowych
- Każda strona powinna mieć `animate-view` na głównym divie (fade-in przy nawigacji)

**Asortyment.tsx — dwie ścieżki zapisu**
- `handleSubmit` — modal tworzenia/edycji (wywoływany przez `openNew`/`openEdit`)
- `handleDetailSubmit` — inline panel szczegółów (wywoływany przez przycisk "Zapisz zmiany")
- `useEffect` na `detailData` nadpisuje `formData` przy załadowaniu detali — każde nowe pole w `Asortyment` musi być dodane do WSZYSTKICH `setFormData` wywołań (3 miejsca + useEffect)
- Zakładki szczegółów: Specyfikacja, Zasoby/Partie, Dziennik zdarzeń, Wartości odżywcze, Alergeny, **Ceny** (tylko dla `Wyrob_Gotowy`)

**Backend (server.ts)**
- Wszystkie endpointy w jednym pliku (~3700 linii)
- Transakcje Prisma dla operacji wieloetapowych (PZ, realizacja zlecenia)
- Miękkie usuwanie: `czy_aktywne = false` zamiast DELETE
- Numeracja dokumentów: `generateDocNumber(tx, prefix)`
- Dwa klienty Prisma: `prisma` (prod.db) i `prismaTest` (test.db) — przełączane przez `DATABASE_URL`

---

## Ważne ograniczenia (stan aktualny)

- **Autentykacja:** uproszczona JWT — nie gotowe na produkcję
- **Testy:** brak suite testów (vitest/jest)
- **OEE:** brak UI — moduł przestojów niezaimplementowany
- **QR/Etykiety:** endpointy `/api/etykieta/:numer_partii` i `/api/etykiety-dokumentu/:referencja` istnieją, ale brak UI wydruku
- **PDF/wydruk:** klasy CSS do druku obecne, ale brak stylów printowych
- **Wielomagazynowość:** brak — jeden domyślny magazyn
- **HACCP:** modele `Punkty_Kontrolne` i `Wyniki_Kontroli` usunięte ze schematu — logika kontroli jakości niezaimplementowana

---

## Dokumentacja domenowa

W katalogu `docs/` (język polski):
- `planer_produkcji.md` — planer turnusu: mnożnik, wsady, rozliczenie
- `strukturabazy.md` — opis schematu DB
- `receptury.md` — logika receptur
- `produkcja.md` — logika produkcji
- `magazyn.md` — logika magazynowa
- `ux_wytyczne.md` — wytyczne UX
- `agents.md` — koncepcja agentów AI
