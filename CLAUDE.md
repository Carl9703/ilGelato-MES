# ilGelato MES — CLAUDE.md

System zarządzania produkcją (MES/ERP) dla rzemieślniczej lodziarni.
Interfejs i baza danych w języku **polskim**.

---

## Uruchamianie

```bash
# Frontend (Vite, port 3000)
npm run dev

# Backend (Express, port 3001)
npx tsx server.ts

# Seed przykładowych danych
npx tsx prisma/seed.ts
```

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
server.ts               — API Express (ok. 2000 linii)
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

---

## Typy dokumentów magazynowych

| Symbol | Nazwa                   | Kierunek |
|--------|-------------------------|----------|
| PZ     | Przyjęcie Zewnętrzne    | +magazyn |
| PW     | Przyjęcie Wewnętrzne    | +magazyn (z produkcji) |
| WZ     | Wydanie Zewnętrzne      | -magazyn |
| RW     | Rozchód Wewnętrzny      | -magazyn (zużycie) |

Numeracja: `PREFIX-NNN/MM/RR`, zlecenia: `ZP-NNNN/MM/RR`

---

## Statusy

**Zlecenia produkcyjne:** `Planowane` → `W_toku` → `Zrealizowane` | `Anulowane`

**Partie magazynowe:** `Dostepna` | `Kwarantanna` | `Zablokowana_Kontrola_Jakosci` | `Zutylizowana`

**Rezerwacje:** `Aktywna` | `Zrealizowana` | `Anulowana`

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
- Duże pliki stron (Asortyment, Produkcja > 1000 linii) — normalne dla projektu
- Motyw ciemny z CSS variables: `--bg-app`, `--accent`, `--ok`, `--warn`, itp.

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
