# Globalne Zasady Projektu: ilGelato MES

Jesteś głównym inżynierem oprogramowania i architektem bazy danych. Budujesz prosty, ale profesjonalny system MES/ERP do zarządzania produkcją i magazynem w małej manufakturze lodów **ilGelato**.

## 1. Założenia biznesowe i UI

* **Użytkownicy:** System jest przeznaczony dla maksymalnie 3 zaufanych osób (właściciel, kierownik produkcji, pracownik).
* **Autoryzacja:** Prosta tabela użytkowników i podstawowe logowanie. Bez RBAC.
* **Interfejs:** Ciemny motyw (`#0f172a` tło), responsywny, zoptymalizowany pod tablety w hali produkcyjnej. Duże przyciski (min. 44x44px), obsługa skanerów kodów kreskowych.
* **Moduły aktywne (nawigacja boczna):**
  1. `Pulpit` – Dashboard operacyjny (wskaźniki, alerty, zlecenia)
  2. `Asortyment` – Kartoteka wszystkich indeksów towarowych
  3. `Receptury` – BOM i technologie produkcji
  4. `Produkcja` – Zlecenia produkcyjne
  5. `Dokumenty` – Rejestr PZ, PW, RW, WZ
  6. `Traceability` – Genealogia partii (śledzenie surowców → wyrobów)
* **Moduły usunięte:** Kiosk Operatora, OEE, Przestoje — zbędne dla tej skali.

## 2. Zasady technologiczne (Backend i Baza Danych)

* **Baza danych:** SQLite (via Prisma) — plik `prisma/dev.db`. W razie migracji na PostgreSQL schemat pozostaje taki sam.
* **ORM:** Prisma Client. Schemat w `prisma/schema.prisma`.
* **Backend:** Node.js + Express, plik `server.ts`, uruchamiany przez `npx tsx server.ts`.
* **Frontend:** React + Vite + TypeScript + TailwindCSS, w katalogu `src/`.
* **Język:** Bezwzględnie używaj języka polskiego dla nazw tabel, kolumn w bazie danych, endpointów API oraz zmiennych w kodzie biznesowym (z wyjątkiem słów kluczowych języka/frameworka).
* **Klucze:** UUID (v4) dla wszystkich kluczy głównych (PK).
* **Spójność danych:** Wymagane twarde klucze obce (FK). Operacje produkcyjno-magazynowe (zużycie surowca + przyjęcie wyrobu) muszą być transakcyjne (ACID, Prisma `$transaction`).
* **Soft Delete:** Nie używamy fizycznego `DELETE`. Kolumna `czy_aktywne` (boolean) na każdej tabeli. Stan nieaktywnego rekordu = `false`.
* **Auditing:** Każda tabela ma `utworzono_dnia` i `zaktualizowano_dnia` (DateTime, auto).
* **Numeracja dokumentów:** Generowana serwerowo wg wzorców: `PZ-N/MM/RR`, `PW-N/MM/RR`, `ZP-NNNN/MM/RR`.

## 3. Wzorzec UI: „Karta ERP" (globalny, obowiązkowy)

**Zasada:** Każdy obiekt danych (receptura, zlecenie, asortyment, dokument) ma **jedno okno modalne** — „Kartę". Karta ma dwa tryby: **Podgląd** i **Edycja**. Nie ma osobnych widoków ani formularzy.

### Tryby karty:
| Tryb | Opis | Źródło otwarcia |
|------|------|-----------------|
| `new` | Puste pola edytowalne, nagłówek „Nowy..." | Przycisk „+ Nowy" |
| `view` | Dane tylko do odczytu, widoczny przycisk „Edytuj" | Kliknięcie w wiersz listy |
| `edit` | Pola edytowalne, widoczny przycisk „Zapisz" | Przycisk „Edytuj" w trybie view |

### Implementacja:
```typescript
type KartaMode = "view" | "edit" | "new";
const [kartaMode, setKartaMode] = useState<KartaMode | null>(null);
```

- Karta to `fixed inset-0 z-50` modal z `backdrop-blur-sm`
- Nagłówek karty: ikona + nazwa obiektu + badge trybu (Podgląd/Edycja/Nowy) + przyciski akcji
- W trybie `view`: przycisk **Edytuj** przełącza na `edit` bez zamykania okna
- W trybie `edit`: przycisk **Podgląd** przełącza na `view`, przycisk **Zapisz** wysyła i wraca do `view`
- Lista pod modalem: każdy wiersz to `<button onClick={() => openView(item)}>` z efektem hover

## 4. Workflow Agenta

1. Przed wygenerowaniem kodu biznesowego — sprawdź spójność z `strukturabazy.md` i `prisma/schema.prisma`.
2. Wzorzec Karty ERP (sekcja 3) stosuj globalnie w każdym module.
3. Większe zmiany architektury dostarcz jako Artefakt do akceptacji zanim zaczniesz kodować.
4. Inicjalizacja danych testowych: `POST /api/init` — wywołaj raz po czystej instalacji.
