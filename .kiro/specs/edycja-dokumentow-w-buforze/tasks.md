# Implementation Plan: Edycja dokumentów magazynowych w buforze

## Overview

Dodanie możliwości edycji dokumentów PZ, WZ, RW w statusie Bufor — endpoint PUT na backendzie oraz tryb edycji w istniejących modalach na frontendzie.

## Tasks

- [ ] 1. Backend: endpoint PUT /api/dokumenty/:ref
  - W `server.ts` dodaj endpoint `PUT /api/dokumenty/:ref`
  - Walidacja: dokument musi istnieć (404), status musi być „Bufor" (400), typ nie może być „PW" (400)
  - Dla PZ: nadpisz `pozycje_json`, zaktualizuj `numer_zewnetrzny`
  - Dla WZ: nadpisz `pozycje_json`, zaktualizuj `id_kontrahenta`, `data_dostawy`, `numer_zewnetrzny`
  - Dla RW: nadpisz `pozycje_json`
  - Całość w transakcji ACID, ruchy magazynowe pozostają z `czy_aktywne = false`
  - _Requirements: 1, 2, 3, 4, 5, 8_

- [ ] 2. Frontend: tryb edycji w modalach PZ/WZ/RW (Dokumenty.tsx)
  - Dodaj stan `editDocRef: string | null` — gdy ustawiony, modal działa w trybie edycji
  - Dodaj funkcję `openEditModal(doc)` która pobiera szczegóły dokumentu i wypełnia stany formularza
  - Dla PZ: wypełnij `pzRows` z `pozycje_json`, `pzReferencja` z `numer_zewnetrzny`; nie generuj nowego numeru
  - Dla WZ: wypełnij `wzRows` z `pozycje_json`, `wzKontrahentId`, `wzDataDostawy`, `wzReferencja`; załaduj partie dla każdej pozycji
  - Dla RW: wypełnij `rwRows` z `pozycje_json`; załaduj partie dla każdej pozycji
  - W nagłówku modalu wyświetl referencję edytowanego dokumentu gdy `editDocRef` jest ustawiony
  - _Requirements: 6, 7_

- [ ] 3. Frontend: przycisk „Edytuj" na liście dokumentów (Dokumenty.tsx)
  - W wierszu tabeli dokumentów dodaj przycisk „Edytuj" (ikona `Pencil`) widoczny tylko gdy `status === 'Bufor'` i `typ !== 'PW'`
  - Kliknięcie wywołuje `openEditModal(doc)`
  - _Requirements: 6_

- [ ] 4. Frontend: zapis PUT zamiast POST w trybie edycji (Dokumenty.tsx)
  - W `handleCreatePz`, `handleCreateWz`, `handleCreateRw` — gdy `editDocRef` jest ustawiony, wywołaj `PUT /api/dokumenty/:ref` zamiast POST
  - Po sukcesie: zamknij modal, odśwież listę, wyczyść `editDocRef`, pokaż toast
  - Po błędzie: pokaż toast bez zamykania modalu
  - _Requirements: 7_

## Task Dependency Graph

```json
{
  "waves": [
    ["1"],
    ["2", "3"],
    ["4"]
  ]
}
```
