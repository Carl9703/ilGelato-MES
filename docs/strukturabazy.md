# Struktura Bazy Danych — ilGelato MES

Schemat SQLite zdefiniowany przez Prisma (`prisma/schema.prisma`). Aktualizacja: marzec 2026.

---

## Encje

### 1. Asortyment
Słownik wszystkich indeksów towarowych (surowce, opakowania, półprodukty, wyroby gotowe).

| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | UUID | PK |
| `kod_towaru` | String (unique) | Kod wewnętrzny, np. `SUR-001` |
| `nazwa` | String | Pełna nazwa towaru |
| `typ_asortymentu` | Enum | `Surowiec`, `Opakowanie`, `Polprodukt`, `Wyrob_Gotowy` |
| `jednostka_miary` | String | Podstawowa JM (np. `kg`, `L`, `szt`) |
| `jednostka_pomocnicza` | String? | Druga JM (np. `g`) |
| `przelicznik_jednostki` | Float? | Ile JM_pomocniczych = 1 JM_podstawowej |
| `czy_wymaga_daty_waznosci` | Boolean | Czy wymagana data ważności przy PZ |
| `cena_jednostkowa` | Float? | Orientacyjna cena zakupu |
| `czy_aktywne` | Boolean | Soft delete |
| `utworzono_dnia` | DateTime | Auto |
| `zaktualizowano_dnia` | DateTime | Auto |

### 2. Partie_Magazynowe
Fizyczne zasoby w magazynie — każda dostawa/produkcja tworzy nową partię.

| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | UUID | PK |
| `id_asortymentu` | UUID FK | → Asortyment |
| `numer_partii` | String (unique) | Identyfikator LOT/partii |
| `data_produkcji` | DateTime? | |
| `termin_waznosci` | DateTime? | |
| `status_partii` | Enum | `Dostepna`, `Kwarantanna`, `Zablokowana` |
| `id_lokalizacji` | UUID FK? | → Lokalizacje_Magazynowe |
| `czy_aktywne` | Boolean | Soft delete |
| `utworzono_dnia` | DateTime | Auto |
| `zaktualizowano_dnia` | DateTime | Auto |

### 3. Ruchy_Magazynowe
Każdy ruch (przyjęcie, wydanie, zużycie) to osobny wiersz. Stan = suma `ilosc` dla partii.

| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | UUID | PK |
| `id_partii` | UUID FK | → Partie_Magazynowe |
| `typ_ruchu` | Enum | `PZ`, `WZ`, `Zuzycie`, `Przyjecie_Z_Produkcji`, `Przesuniecie` |
| `ilosc` | Float | Dodatnia (przyjęcie) / ujemna (wydanie) |
| `referencja_dokumentu` | String? | Numer dokumentu PZ/PW/WZ |
| `id_uzytkownika` | UUID FK? | → Uzytkownicy |
| `id_zlecenia` | UUID FK? | → Zlecenia_Produkcyjne (przy zużyciu) |
| `cena_jednostkowa` | Float? | Cena przy PZ |
| `czy_aktywne` | Boolean | Soft delete |
| `utworzono_dnia` | DateTime | Auto |

### 4. Receptury
Nagłówki BOM — jeden rekord = jedna wersja receptury.

| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | UUID | PK |
| `id_asortymentu_docelowego` | UUID FK | → Asortyment (Wyrob_Gotowy/Polprodukt) |
| `numer_wersji` | Int | Wersjonowanie receptury |
| `dni_trwalosci` | Int? | Liczba dni ważności wyrobu |
| `czy_aktywne` | Boolean | Soft delete |
| `utworzono_dnia` | DateTime | Auto |
| `zaktualizowano_dnia` | DateTime | Auto |

### 5. Skladniki_Receptury
Pozycje materiałowe (BOM lines).

| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | UUID | PK |
| `id_receptury` | UUID FK | → Receptury |
| `id_asortymentu_skladnika` | UUID FK | → Asortyment |
| `ilosc_wymagana` | Float | Ilość na 1 jednostkę wyrobu |
| `czy_pomocnicza` | Boolean | Użyj jednostki pomocniczej |
| `procent_strat` | Float? | % technologiczny odpad |
| `czy_aktywne` | Boolean | Soft delete |

### 6. Zlecenia_Produkcyjne
Dokumenty wykonawcze zlecające produkcję.

| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | UUID | PK |
| `numer_zlecenia` | String (unique) | Format: `ZP-NNNN/MM/RR` |
| `id_receptury` | UUID FK | → Receptury |
| `planowana_ilosc_wyrobu` | Float | |
| `rzeczywista_ilosc_wyrobu` | Float? | Wypełniana po realizacji |
| `status` | Enum | `Planowane`, `W_toku`, `Zrealizowane`, `Anulowane` |
| `czy_aktywne` | Boolean | Soft delete |
| `utworzono_dnia` | DateTime | Auto |
| `zaktualizowano_dnia` | DateTime | Auto |

### 7. Rezerwacje_Magazynowe
Blokowanie surowców dla zleceń „W toku".

| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | UUID | PK |
| `id_zlecenia` | UUID FK | → Zlecenia_Produkcyjne |
| `id_partii` | UUID FK | → Partie_Magazynowe |
| `ilosc_zarezerwowana` | Float | |
| `czy_aktywne` | Boolean | Soft delete |

### 8. Punkty_Kontrolne
Definicje parametrów QC dla receptury (HACCP).

| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | UUID | PK |
| `id_receptury` | UUID FK | → Receptury |
| `nazwa_parametru` | String | np. „Temperatura pasteryzacji" |
| `jednostka` | String | np. „°C" |
| `wartosc_min` | Float? | |
| `wartosc_max` | Float? | |
| `czy_wymagany` | Boolean | Blokuje realizację jeśli brak wyniku |
| `kolejnosc` | Int | Kolejność wyświetlania |

### 9. Wyniki_Kontroli
Zmierzone wartości QC dla konkretnego zlecenia.

| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | UUID | PK |
| `id_zlecenia` | UUID FK | → Zlecenia_Produkcyjne |
| `id_punktu_kontrolnego` | UUID FK | → Punkty_Kontrolne |
| `wartosc_zmierzona` | String | |
| `uwagi` | String? | |

### 10. Lokalizacje_Magazynowe
Miejsca składowania w magazynie.

| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | UUID | PK |
| `nazwa` | String | np. „Regał A-1", „Chłodnia" |
| `czy_aktywne` | Boolean | |

---

## Uwagi implementacyjne

- **Stan magazynowy** partii = `SUM(ilosc)` z `Ruchy_Magazynowe` gdzie `id_partii = X`
- **Dostępny stan** = stan ogółem − suma aktywnych rezerwacji
- Realizacja zlecenia to transakcja ACID: jednoczesne `Zuzycie` surowców + `Przyjecie_Z_Produkcji` wyrobu
- Numeracja dokumentów jest generowana serwerowo w `server.ts` (funkcje `generateDocNumber`, `generateZlecenieNumber`)
