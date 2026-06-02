# Requirements Document

## Introduction

Funkcja umożliwia edycję dokumentów magazynowych (PZ, WZ, RW) zapisanych w statusie „Bufor". Dokument w buforze pełni rolę roboczego szkicu — można go wielokrotnie modyfikować przed ostatecznym zatwierdzeniem. Zatwierdzenie pozostaje jedyną operacją, która zmienia stany magazynowe. Dokumenty w statusie „Zatwierdzony" lub „Anulowany" są niemodyfikowalne. Dokument PW (Przyjęcie Wewnętrzne) jest generowany automatycznie przez moduł produkcji i nie podlega ręcznej edycji.

## Glossary

- **Dokument_Magazynowy**: Rekord w tabeli `Dokumenty_Magazynowe` reprezentujący PZ, WZ, RW lub PW.
- **Bufor**: Status dokumentu oznaczający szkic roboczy — stany magazynowe nie są jeszcze zmienione.
- **Zatwierdzony**: Status dokumentu po zatwierdzeniu — stany magazynowe zostały zaktualizowane.
- **Anulowany**: Status dokumentu po anulowaniu — dokument jest nieaktywny.
- **PZ**: Przyjęcie Zewnętrzne — dokument przyjęcia surowców/opakowań od dostawcy.
- **WZ**: Wydanie Zewnętrzne — dokument wydania wyrobów gotowych z magazynu.
- **RW**: Rozchód Wewnętrzny — dokument rozchodu surowców na potrzeby wewnętrzne.
- **PW**: Przyjęcie Wewnętrzne — dokument generowany automatycznie przez produkcję; nie podlega ręcznej edycji.
- **Pozycja_Dokumentu**: Pojedynczy wiersz dokumentu opisujący towar, partię i ilość; przechowywany w polu `pozycje_json`.
- **Referencja_Zewnętrzna**: Opcjonalne pole `numer_zewnetrzny` — numer dokumentu dostawcy lub inny identyfikator zewnętrzny.
- **Modal_Edycji**: Istniejący modal tworzenia dokumentu (PZ/WZ/RW) otwarty w trybie edycji z załadowanymi danymi bieżącego dokumentu.

## Requirements

### Requirement 1: Ochrona niemodyfikowalnych dokumentów

**User Story:** Jako użytkownik, chcę mieć pewność, że zatwierdzone i anulowane dokumenty są chronione przed przypadkową modyfikacją, aby zachować integralność historii magazynowej.

#### Acceptance Criteria

1. WHEN żądanie PUT `/api/dokumenty/:ref` zostanie odebrane, THE API SHALL odrzucić żądanie z kodem HTTP 400 i komunikatem błędu, jeśli dokument o podanej referencji ma status inny niż „Bufor".
2. WHEN żądanie PUT `/api/dokumenty/:ref` zostanie odebrane dla dokumentu o typie „PW", THE API SHALL odrzucić żądanie z kodem HTTP 400 i komunikatem błędu niezależnie od statusu dokumentu.
3. THE API SHALL zwrócić kod HTTP 404, jeśli dokument o podanej referencji nie istnieje w bazie danych.

### Requirement 2: Edycja dokumentu PZ w buforze

**User Story:** Jako użytkownik, chcę edytować dokument PZ zapisany w buforze, aby poprawić pozycje, ilości, partie, ceny lub referencję zewnętrzną przed zatwierdzeniem.

#### Acceptance Criteria

1. WHEN żądanie PUT `/api/dokumenty/:ref` zostanie odebrane dla dokumentu PZ w statusie „Bufor", THE API SHALL nadpisać pole `pozycje_json` dokumentu przekazaną listą pozycji.
2. WHEN żądanie PUT `/api/dokumenty/:ref` zostanie odebrane dla dokumentu PZ w statusie „Bufor", THE API SHALL zaktualizować pole `numer_zewnetrzny` wartością przekazaną w żądaniu (lub ustawić `null`, jeśli wartość jest pusta).
3. THE API SHALL wymagać, aby każda pozycja PZ zawierała: `id_asortymentu`, `numer_partii` (niepusty), `ilosc` (liczba dodatnia). Pola `cena_jednostkowa`, `data_produkcji`, `termin_waznosci` są opcjonalne.
4. IF lista pozycji przekazana w żądaniu PUT dla dokumentu PZ jest pusta, THEN THE API SHALL odrzucić żądanie z kodem HTTP 400 i komunikatem błędu.

### Requirement 3: Edycja dokumentu WZ w buforze

**User Story:** Jako użytkownik, chcę edytować dokument WZ zapisany w buforze, aby zmienić pozycje, kontrahenta, datę dostawy lub referencję zewnętrzną przed zatwierdzeniem.

#### Acceptance Criteria

1. WHEN żądanie PUT `/api/dokumenty/:ref` zostanie odebrane dla dokumentu WZ w statusie „Bufor", THE API SHALL nadpisać pole `pozycje_json` dokumentu przekazaną listą pozycji.
2. WHEN żądanie PUT `/api/dokumenty/:ref` zostanie odebrane dla dokumentu WZ w statusie „Bufor", THE API SHALL zaktualizować pola `id_kontrahenta`, `data_dostawy` i `numer_zewnetrzny` wartościami przekazanymi w żądaniu.
3. THE API SHALL wymagać, aby każda pozycja WZ zawierała: `id_partii` (niepuste), `ilosc` (liczba dodatnia), `cena_netto` (liczba nieujemna), `stawka_vat` (liczba nieujemna).
4. IF lista pozycji przekazana w żądaniu PUT dla dokumentu WZ jest pusta, THEN THE API SHALL odrzucić żądanie z kodem HTTP 400 i komunikatem błędu.
5. IF pole `id_kontrahenta` przekazane w żądaniu PUT dla dokumentu WZ jest puste lub nieobecne, THEN THE API SHALL odrzucić żądanie z kodem HTTP 400 i komunikatem błędu.

### Requirement 4: Edycja dokumentu RW w buforze

**User Story:** Jako użytkownik, chcę edytować dokument RW zapisany w buforze, aby zmienić pozycje, partie lub ilości przed zatwierdzeniem.

#### Acceptance Criteria

1. WHEN żądanie PUT `/api/dokumenty/:ref` zostanie odebrane dla dokumentu RW w statusie „Bufor", THE API SHALL nadpisać pole `pozycje_json` dokumentu przekazaną listą pozycji.
2. THE API SHALL wymagać, aby każda pozycja RW zawierała: `id_partii` (niepuste), `ilosc` (liczba dodatnia).
3. IF lista pozycji przekazana w żądaniu PUT dla dokumentu RW jest pusta, THEN THE API SHALL odrzucić żądanie z kodem HTTP 400 i komunikatem błędu.

### Requirement 5: Brak wpływu edycji na stany magazynowe

**User Story:** Jako użytkownik, chcę mieć pewność, że edycja dokumentu w buforze nie zmienia stanów magazynowych, aby nie zaburzać bieżącej dostępności towarów.

#### Acceptance Criteria

1. WHILE dokument ma status „Bufor", THE API SHALL utrzymywać wszystkie powiązane rekordy `Ruchy_Magazynowe` z flagą `czy_aktywne = false` — zarówno przed, jak i po operacji edycji.
2. THE API SHALL zmieniać stany magazynowe wyłącznie w momencie zatwierdzenia dokumentu przez endpoint `POST /api/dokumenty/:ref/zatwierdz`, nie podczas operacji PUT.
3. WHEN operacja PUT zostanie wykonana pomyślnie, THE API SHALL zwrócić zaktualizowany nagłówek dokumentu z polem `status` równym „Bufor".

### Requirement 6: Przycisk „Edytuj" w interfejsie użytkownika

**User Story:** Jako użytkownik, chcę widzieć przycisk „Edytuj" przy dokumentach w buforze, aby móc szybko otworzyć formularz edycji bez konieczności tworzenia nowego dokumentu.

#### Acceptance Criteria

1. WHEN dokument na liście ma status „Bufor" i typ PZ, WZ lub RW, THE Interfejs SHALL wyświetlać przycisk „Edytuj" w wierszu tego dokumentu.
2. WHEN dokument ma status „Zatwierdzony" lub „Anulowany", THE Interfejs SHALL nie wyświetlać przycisku „Edytuj".
3. WHEN dokument ma typ „PW", THE Interfejs SHALL nie wyświetlać przycisku „Edytuj" niezależnie od statusu.
4. WHEN użytkownik kliknie „Edytuj" przy dokumencie PZ w buforze, THE Interfejs SHALL otworzyć Modal_Edycji PZ z załadowanymi danymi dokumentu (pozycje, referencja zewnętrzna).
5. WHEN użytkownik kliknie „Edytuj" przy dokumencie WZ w buforze, THE Interfejs SHALL otworzyć Modal_Edycji WZ z załadowanymi danymi dokumentu (pozycje, kontrahent, data dostawy, referencja zewnętrzna).
6. WHEN użytkownik kliknie „Edytuj" przy dokumencie RW w buforze, THE Interfejs SHALL otworzyć Modal_Edycji RW z załadowanymi danymi dokumentu (pozycje).

### Requirement 7: Zapis zmian z poziomu modalu edycji

**User Story:** Jako użytkownik, chcę zapisać zmiany w edytowanym dokumencie buforowym, aby zaktualizować jego treść bez konieczności usuwania i tworzenia go od nowa.

#### Acceptance Criteria

1. WHEN Modal_Edycji jest otwarty w trybie edycji i użytkownik kliknie przycisk zapisu, THE Interfejs SHALL wywołać żądanie PUT `/api/dokumenty/:ref` z aktualnymi danymi formularza zamiast żądania POST.
2. WHEN żądanie PUT zakończy się sukcesem, THE Interfejs SHALL zamknąć Modal_Edycji, odświeżyć listę dokumentów i wyświetlić komunikat potwierdzający zapisanie zmian.
3. WHEN żądanie PUT zakończy się błędem, THE Interfejs SHALL wyświetlić komunikat błędu bez zamykania modalu.
4. WHEN Modal_Edycji jest otwarty w trybie edycji, THE Interfejs SHALL wyświetlać referencję edytowanego dokumentu w nagłówku modalu.
5. WHEN Modal_Edycji jest otwarty w trybie edycji dla dokumentu PZ, THE Interfejs SHALL nie generować nowego numeru dokumentu — referencja pozostaje niezmieniona.

### Requirement 8: Spójność danych po edycji

**User Story:** Jako użytkownik, chcę mieć pewność, że po edycji dokumentu w buforze jego dane są spójne i gotowe do zatwierdzenia.

#### Acceptance Criteria

1. WHEN operacja PUT zostanie wykonana pomyślnie, THE API SHALL zapewnić, że pole `pozycje_json` dokumentu zawiera wyłącznie pozycje przekazane w żądaniu PUT.
2. THE API SHALL wykonywać operację PUT w ramach pojedynczej transakcji bazodanowej, tak aby częściowa aktualizacja nie była możliwa.
3. WHEN operacja PUT zakończy się błędem w trakcie transakcji, THE API SHALL wycofać wszystkie zmiany i zwrócić kod HTTP 500 z opisem błędu.
